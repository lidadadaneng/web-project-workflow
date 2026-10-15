from pathlib import Path

from docx import Document
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn


DOCX = Path("论文/面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现-前5章.docx").resolve()
doc = Document(str(DOCX))
body = doc.element.body

start = None
end = None
for child in body.iterchildren():
    if child.tag != qn("w:p"):
        continue
    paragraph = Paragraph(child, doc)
    if paragraph.style.name in ("Heading 1", "u1级标题"):
        text = paragraph.text.strip()
        if text == "系统测试与结果分析" and start is None:
            start = child
        elif text == "参考文献" and start is not None:
            end = child
            break

if start is None or end is None:
    raise RuntimeError(
        f"Could not find chapter 6/reference boundaries: start={start is not None}, end={end is not None}"
    )

children = list(body.iterchildren())
start_index = children.index(start)
end_index = children.index(end)
removed = 0
preserved = 0
for child in children[start_index:end_index]:
    xml = child.xml
    if any(
        token in xml
        for token in (
            "w:sectPr",
            'w:br w:type="page"',
            'w:br w:type="column"',
            "w:fldChar",
            "w:pageBreakBefore",
        )
    ):
        preserved += 1
        continue
    body.remove(child)
    removed += 1

doc.save(str(DOCX))
print(
    f"Removed {removed} body elements from chapter 6 through chapter 7; "
    f"preserved {preserved} elements containing pagination, section, or field controls"
)
