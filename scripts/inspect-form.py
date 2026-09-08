"""Independent pypdf field-tree/widget inspection, without modifying the PDF.

Usage: python inspect-form.py OUTPUT [--expect expected.json]
       [--original SOURCE --original-sha256 SHA256]
Expected JSON maps field names to canonical values (buttons use /Yes, /Off, etc.).
"""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('pdf',type=Path)
parser.add_argument('--expect',type=Path)
parser.add_argument('--original',type=Path)
parser.add_argument('--original-sha256')
args=parser.parse_args()
reader=PdfReader(args.pdf)
canonical=reader.get_fields() or {}
errors=[]
def value(v):
    if isinstance(v,list):return [value(item) for item in v]
    if v is None:return None
    return str(v)
def inheritance(obj,key):
    visited=set()
    while obj is not None:
        if id(obj) in visited:raise ValueError('Cyclic field parent relationship')
        visited.add(id(obj))
        if key in obj:return obj[key]
        obj=obj.get('/Parent')
        if obj is not None:obj=obj.get_object()
    return None
def full_name(obj):
    names=[];visited=set()
    while obj is not None:
        if id(obj) in visited:raise ValueError('Cyclic field parent relationship')
        visited.add(id(obj))
        if '/T' in obj:names.insert(0,str(obj['/T']))
        obj=obj.get('/Parent')
        if obj is not None:obj=obj.get_object()
    return '.'.join(names)
fields={name:{'type':str(field.get('/FT')),'value':value(field.get('/V')),
              'flags':int(field.get('/Ff',0)),'options':value(field.get('/Opt'))}
        for name,field in canonical.items()}
canonical_objects={}
def object_id(obj):
    ref=getattr(obj,'indirect_reference',None)
    return (ref.idnum,ref.generation) if ref else ('direct',id(obj))
def visit_fields(ref):
    obj=ref.get_object()
    if '/T' in obj:
        name=full_name(obj)
        if name in canonical_objects:errors.append(f'Duplicate canonical field name {name}')
        canonical_objects[name]=object_id(obj)
    for child in obj.get('/Kids',[]):visit_fields(child)
for ref in reader.trailer['/Root'].get('/AcroForm',{}).get('/Fields',[]):visit_fields(ref)
expected=json.loads(args.expect.read_text()) if args.expect else {}
for name,wanted in expected.items():
    if name not in fields:errors.append(f'Missing canonical field {name}')
    elif fields[name]['value']!=wanted:errors.append(f'{name}: expected {wanted!r}, got {fields[name]["value"]!r}')
widgets=[]
for page_index,page in enumerate(reader.pages):
    for ref in page.get('/Annots',[]):
        widget=ref.get_object()
        if widget.get('/Subtype')!='/Widget':continue
        name=full_name(widget);effective=value(inheritance(widget,'/V'))
        if name not in fields:errors.append(f'Page {page_index+1}: orphan widget {name}')
        elif effective!=fields[name]['value']:errors.append(f'Page {page_index+1}: stale effective value for {name}')
        ancestor=widget;linked=False
        while ancestor is not None:
            if object_id(ancestor)==canonical_objects.get(name):linked=True;break
            ancestor=ancestor.get('/Parent')
            if ancestor is not None:ancestor=ancestor.get_object()
        if not linked:errors.append(f'Page {page_index+1}: widget {name} is detached from its canonical field')
        normal=widget.get('/AP',{}).get('/N')
        if normal is not None:normal=normal.get_object()
        appearance_bytes=0;states=[]
        state=widget.get('/AS')
        if normal is None:errors.append(f'Page {page_index+1}: missing normal appearance for {name}')
        elif hasattr(normal,'get_data'):appearance_bytes=len(normal.get_data())
        else:
            states=list(map(str,normal.keys()))
            if state not in normal:errors.append(f'Page {page_index+1}: appearance state missing for {name}')
            else:appearance_bytes=len(normal[state].get_object().get_data())
            wanted=effective if effective in normal else '/Off'
            if state!=wanted:errors.append(f'Page {page_index+1}: stale button appearance for {name}: {state} vs {wanted}')
        if not appearance_bytes:errors.append(f'Page {page_index+1}: empty appearance for {name}')
        widgets.append({'page':page_index+1,'name':name,'effectiveValue':effective,
                        'appearanceState':value(state),'appearanceStates':states,
                        'appearanceBytes':appearance_bytes,'parented':'/Parent' in widget})
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
report={'file':str(args.pdf.resolve()),'sha256':digest(args.pdf),'pages':len(reader.pages),
        'fields':fields,'widgets':widgets,'errors':errors}
if args.original:
    report['originalSha256']=digest(args.original)
    if args.original_sha256 and report['originalSha256']!=args.original_sha256:errors.append('Original source checksum changed')
if args.original_sha256 and not args.original:errors.append('--original-sha256 requires --original')
report['result']='PASS_STRUCTURE' if not errors else 'FAIL'
print(json.dumps(report,indent=2))
raise SystemExit(bool(errors))
