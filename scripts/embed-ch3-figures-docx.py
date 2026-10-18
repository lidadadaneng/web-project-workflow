from pathlib import Path
import os
import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.image.image import Image
from docx.oxml import OxmlElement
from docx.shared import Inches, Pt
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph


WORKSPACE = Path(__file__).resolve().parents[1]
PAPER_DIR = WORKSPACE / "论文"
DOCX_PATH = Path(os.environ.get(
    "WPW_THESIS_DOCX",
    PAPER_DIR / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现.docx",
))
IMAGE_RE = re.compile(r"^!\[([^\]]+)\]\(([^)]+)\)\s*$", re.MULTILINE)
FIGURE_RE = re.compile(r"图\s*([A-Za-z]?\d*-\d+)")


def collect_figures():
    figures = {}
    sources = [next(iter(PAPER_DIR.glob(f"{chapter}.*.md")), None) for chapter in range(1, 7)]
    sources += [PAPER_DIR / "附录.md"]
    for source in sources:
        if source is None or not source.is_file():
            continue
        text = source.read_text(encoding="utf-8")
        for alt, target in IMAGE_RE.findall(text):
            parts = [part.strip() for part in alt.split("|", 1)]
            match = FIGURE_RE.search(parts[0])
            if not match:
                continue
            figure_id = match.group(1)
            if not target.lower().endswith(".png"):
                raise ValueError(f"Figure {figure_id} is not referenced as PNG: {target}")

            image_path = PAPER_DIR / target
            if not image_path.exists():
                image_path = source.parent / target
            if not image_path.is_file() or image_path.stat().st_size == 0:
                raise FileNotFoundError(f"Missing or empty PNG for figure {figure_id}: {image_path}")
            if len(parts) < 2 or not parts[1]:
                raise ValueError(f"Figure {figure_id} has no English caption in its alt text")
            if figure_id in figures:
                raise ValueError(f"Duplicate figure id in Markdown: {figure_id}")

            figures[f"!图{figure_id}"] = {
                "path": image_path,
                "caption_cn": parts[0],
                "caption_en": parts[1],
            }
    return figures


def insert_after(anchor, paragraph):
    anchor._p.addnext(paragraph._p)


def disable_style_numbering(paragraph):
    ppr = paragraph._p.get_or_add_pPr()
    num_pr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num_id = OxmlElement("w:numId")
    num_id.set(qn("w:val"), "0")
    num_pr.append(ilvl)
    num_pr.append(num_id)
    style = ppr.find(qn("w:pStyle"))
    ppr.insert(1 if style is not None else 0, num_pr)


figures = collect_figures()
document = Document(str(DOCX_PATH))
placeholders = [
    paragraph
    for paragraph in document.paragraphs
    if paragraph.text.strip().split("||", 1)[0] in figures
]
unknown = [
    paragraph.text.strip()
    for paragraph in document.paragraphs
    if paragraph.text.strip().startswith("!图")
    and paragraph.text.strip().split("||", 1)[0] not in figures
]
if unknown:
    raise ValueError("Image placeholders have no matching Markdown PNG: " + ", ".join(unknown))
if not placeholders:
    print("No figure placeholders found; document may already be synchronized.")
    raise SystemExit(0)

max_text_width = min(
    section.page_width - section.left_margin - section.right_margin
    for section in document.sections
)
max_text_height = min(
    section.page_height - section.top_margin - section.bottom_margin - Inches(0.6)
    for section in document.sections
)

for placeholder in placeholders:
    key = placeholder.text.strip().split("||", 1)[0]
    figure_info = figures[key]
    image_path = figure_info["path"]

    figure = document.add_paragraph()
    figure.alignment = WD_ALIGN_PARAGRAPH.CENTER
    figure.paragraph_format.space_before = 0
    figure.paragraph_format.space_after = 0
    figure.paragraph_format.keep_with_next = True
    figure.paragraph_format.keep_together = True

    native = Image.from_file(str(image_path))
    ratio_width = round(max_text_height * native.width / native.height)
    display_width = min(native.width, max_text_width, ratio_width)
    figure.add_run().add_picture(str(image_path), width=display_width)

    caption = document.add_paragraph(style="u图标题")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(1.2)
    caption.paragraph_format.space_after = Pt(12)
    caption.paragraph_format.line_spacing = 1.0
    caption.paragraph_format.keep_together = True
    disable_style_numbering(caption)
    caption.add_run(figure_info["caption_cn"])
    caption.add_run().add_break()
    caption.add_run(figure_info["caption_en"])
    for run in caption.runs:
        run.font.name = "Times New Roman"
        run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "黑体")
        run.font.size = Pt(10.5)
        run.bold = True

    anchor = placeholder._p
    parent = anchor.getparent()
    following = anchor.getnext()
    for expected_caption in (figure_info["caption_cn"], figure_info["caption_en"]):
        if following is None or following.tag != qn("w:p"):
            break
        next_paragraph = Paragraph(following, document)
        if next_paragraph.text.strip() != expected_caption:
            break
        next_element = following.getnext()
        parent.remove(following)
        following = next_element
    insert_after(placeholder, figure)
    insert_after(figure, caption)
    parent.remove(anchor)

document.save(str(DOCX_PATH))
print(f"Embedded {len(placeholders)} figures in {DOCX_PATH}")
