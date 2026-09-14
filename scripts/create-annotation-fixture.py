"""Deterministic synthetic PDF for exact annotation/export geometry checks."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

output=Path(__file__).resolve().parents[1]/'test/fixtures/jett-annotations.pdf'
output.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(output),pagesize=(612,792),invariant=1)
c.setTitle('Synthetic JETT annotation fixture')
c.setAuthor('JETT synthetic test fixture')
# A real empty first page catches extraction-index versus PDF-page confusion.
c.showPage()
c.setFillColor(HexColor('#18352e'))
c.setFont('Helvetica-Bold',20)
c.drawString(48,735,'Annotation geometry fixture')
c.setFont('Helvetica',12)
c.drawString(48,680,'The orchard is ready.')
c.drawString(48,650,'The orchard is ready.')
c.drawString(48,590,'The northern orchard produces crisp apples every autumn.')
c.drawString(48,572,'Beyond the stone bridge, nesting birds shelter through winter.')
c.drawString(48,554,'Keep both lines when a passage crosses a line boundary.')
c.setFont('Helvetica',9)
c.drawString(48,40,'Synthetic text only - physical PDF page 2')
c.showPage()
c.setPageRotation(90)
c.setFillColor(HexColor('#18352e'))
c.setFont('Helvetica-Bold',20)
c.drawString(48,550,'Rotated page fixture')
c.setFont('Helvetica',12)
c.drawString(48,490,'Rotated orchard passage.')
c.drawString(48,460,'A quarter turn must preserve the selected words.')
c.drawString(48,442,'Annotations belong to physical PDF page three.')
c.setFont('Helvetica',9)
c.drawString(48,40,'Synthetic text only - physical PDF page 3, rotation 90')
c.save()
print(output)
