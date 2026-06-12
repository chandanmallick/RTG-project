from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

styles = getSampleStyleSheet()
print("styles keys:", list(styles.byName.keys()))
print("Heading2 style:", styles['Heading2'])
try:
    section_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=12
    )
    print("section_style created:", section_style)
    p = Paragraph("test", section_style)
    print("Paragraph created successfully:", p)
except Exception as e:
    import traceback
    traceback.print_exc()
