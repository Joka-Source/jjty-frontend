"""Generate a synthetic, two-page AcroForm; never uses personal data."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, ArrayObject

root = Path(__file__).resolve().parents[1]
out = root / 'test/fixtures/jett-fillable.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
buffer = BytesIO()
c = canvas.Canvas(buffer, pagesize=(612, 792), invariant=1)
c.setTitle('Synthetic JETT form')
c.setAuthor('JETT synthetic test fixture')
form = c.acroForm
ink = HexColor('#18352e')
def heading(number, subtitle):
    c.setFillColor(ink); c.setFont('Helvetica-Bold', 23)
    c.drawString(48, 734, 'Synthetic JETT form')
    c.setFont('Helvetica', 11); c.drawString(48, 710, subtitle)
    c.setFont('Helvetica', 9); c.drawString(48, 36, f'Test data only - page {number} of 2')
def label(text, y):
    c.setFillColor(ink); c.setFont('Helvetica', 11); c.drawString(48, y, text)
def text(name, y, value='', height=28, flags=''):
    form.textfield(name=name, tooltip=name.replace('_', ' '), x=48, y=y,
                   width=516, height=height, value=value, fieldFlags=flags,
                   borderWidth=1, borderColor=ink, fillColor=HexColor('#f8faf9'),
                   fontName='Helvetica', fontSize=12, forceBorder=True)
heading(1, 'Contact and delivery - editable fields')
label('Full name', 665); text('full_name', 627)
label('Reference (also shown on page 2)', 600); text('reference', 562, 'JETT-001')
label('Category', 535)
form.choice(name='category', tooltip='Category', x=48, y=495, width=260, height=28,
            options=['General','Research','Support'], value='General',
            fontSize=12, borderColor=ink, forceBorder=True)
label('Delivery preference', 459)
for value,x in [('Email',48),('Post',220)]:
    form.radio(name='delivery', tooltip='Delivery preference', value=value,
               selected=value=='Email', x=x, y=424, buttonStyle='circle',
               borderColor=ink, size=18)
    c.drawString(x+27,429,value)
form.checkbox(name='consent', tooltip='Consent to synthetic test', x=48,y=375,
              checked=False, buttonStyle='check', borderColor=ink,size=18)
c.drawString(76,380,'I confirm this is synthetic test data.')
c.showPage()
heading(2, 'Notes and the shared reference field')
label('Reference (same field as page 1)', 665); text('reference_repeat',627,'JETT-001')
label('Notes', 595); text('notes',370,height=210,flags='multiline')
c.save()

reader=PdfReader(buffer)
writer=PdfWriter(); writer.clone_document_from_reader(reader)
fields=writer.root_object['/AcroForm']['/Fields']
by_name={ref.get_object().get('/T'):ref for ref in fields}
first,second=by_name['reference'],by_name['reference_repeat']
first_obj=first.get_object()
# Split a merged field/widget into one canonical parent with two child widgets.
parent=DictionaryObject()
for key in ['/FT','/T','/TU','/V','/DV','/Ff','/DA','/Q','/MaxLen']:
    if key in first_obj: parent[NameObject(key)]=first_obj[key]
parent[NameObject('/Kids')]=ArrayObject([first,second])
parent_ref=writer._add_object(parent)
for ref in [first,second]:
    widget=ref.get_object()
    for key in ['/FT','/T','/TU','/V','/DV','/Ff','/DA','/Q','/MaxLen']:
        widget.pop(NameObject(key),None)
    widget[NameObject('/Parent')]=parent_ref
writer.root_object['/AcroForm'][NameObject('/Fields')]=ArrayObject([
    parent_ref if ref==first else ref for ref in fields if ref!=second
])
writer.add_metadata({'/Title':'Synthetic JETT form','/Author':'JETT synthetic test fixture'})
with out.open('wb') as target: writer.write(target)
print(out)
