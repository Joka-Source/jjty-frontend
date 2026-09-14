"""Read-only independent annotation inspection with pypdf.

Expected JSON is a list of {page (one-based), nm, subtype, contents} entries.
Subtype values include the PDF slash, for example /Highlight or /Text.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from pypdf import PdfReader

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('pdf',type=Path)
parser.add_argument('--expect',type=Path)
parser.add_argument('--original',type=Path)
parser.add_argument('--original-sha256')
args=parser.parse_args()
reader=PdfReader(args.pdf);annotations=[];errors=[];names=set()
for index,page in enumerate(reader.pages):
    box=list(map(float,page.mediabox))
    for ref in page.get('/Annots',[]):
        annot=ref.get_object()
        if annot.get('/Subtype') in ['/Widget','/Link','/Popup']:continue
        subtype=str(annot.get('/Subtype'));nm=str(annot.get('/NM',''))
        rect=list(map(float,annot.get('/Rect',[])))
        quad=list(map(float,annot.get('/QuadPoints',[])))
        contents=str(annot.get('/Contents',''))
        normal=annot.get('/AP',{}).get('/N')
        if normal is not None:normal=normal.get_object()
        appearance_bytes=len(normal.get_data()) if hasattr(normal,'get_data') else 0
        if not nm:errors.append(f'Page {index+1}: annotation has no NM identity')
        elif nm in names:errors.append(f'Duplicate annotation identity {nm}')
        names.add(nm)
        if len(rect)!=4 or not all(map(math.isfinite,rect)) or rect[2]<=rect[0] or rect[3]<=rect[1]:errors.append(f'{nm}: invalid rectangle')
        if subtype in ['/Highlight','/Underline','/StrikeOut','/Squiggly']:
            if not quad or len(quad)%8:errors.append(f'{nm}: missing or incomplete quadrilaterals')
            for x,y in zip(quad[::2],quad[1::2]):
                if not math.isfinite(x) or not math.isfinite(y):errors.append(f'{nm}: nonfinite point');continue
                if not(box[0]-1<=x<=box[2]+1 and box[1]-1<=y<=box[3]+1):errors.append(f'{nm}: quadrilateral outside physical page')
                if len(rect)==4 and not(rect[0]-1<=x<=rect[2]+1 and rect[1]-1<=y<=rect[3]+1):errors.append(f'{nm}: quadrilateral outside annotation rectangle')
        if not appearance_bytes:errors.append(f'{nm}: missing/empty normal appearance')
        annotations.append({'page':index+1,'nm':nm,'subtype':subtype,'contents':contents,
                            'rect':rect,'quadPoints':quad,'appearanceBytes':appearance_bytes})
if args.expect:
    expected=json.loads(args.expect.read_text())
    if len(expected)!=len(annotations):errors.append(f'Expected {len(expected)} annotations, got {len(annotations)}')
    for item in expected:
        found=[a for a in annotations if a['nm']==item['nm']]
        if len(found)!=1:errors.append(f'Expected exactly one {item["nm"]}');continue
        for key in ['page','subtype','contents']:
            if found[0][key]!=item[key]:errors.append(f'{item["nm"]}: {key} differs from expected')
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report={'file':str(args.pdf.resolve()),'sha256':digest(args.pdf),'pageCount':len(reader.pages),
        'annotations':annotations,'errors':errors}
if args.original:
    report['originalSha256']=digest(args.original)
    if args.original_sha256 and report['originalSha256']!=args.original_sha256:errors.append('Original source checksum changed')
if args.original_sha256 and not args.original:errors.append('--original-sha256 requires --original')
report['result']='PASS_STRUCTURE' if not errors else 'FAIL'
print(json.dumps(report,indent=2));raise SystemExit(bool(errors))
