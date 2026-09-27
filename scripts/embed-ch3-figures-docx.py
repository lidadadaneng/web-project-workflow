from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.image.image import Image
from docx.shared import Pt
from docx.oxml.ns import qn


WORKSPACE = Path(__file__).resolve().parents[1]
DOCX_PATH = WORKSPACE / "论文" / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现.docx"
FIGURES = {
    "!图1-1": ("第1章", "图1-1-现有研究覆盖范围与本文定位.png", "图1-1 现有研究覆盖范围与本文定位", "Figure 1-1 Coverage of Existing Research and the Position of This Thesis"),
    "!图1-2": ("第1章", "图1-2-核心研究内容.png", "图1-2 核心研究内容", "Figure 1-2 Core Research Content"),
    "!图3-1": ("第3章", "图3-1-方法总体框架.png", "图3-1 方法总体框架", "Figure 3-1 Overall Framework of the Method"),
    "!图3-2": ("第3章", "图3-2-六阶段流程约束架构.png", "图3-2 六阶段流程约束架构", "Figure 3-2 Six-Stage Process-Constrained Architecture"),
    "!图3-3": ("第3章", "图3-3-能力代码双层本体模型.png", "图3-3 能力-代码双层本体模型", "Figure 3-3 Capability-Code Two-Layer Ontology Model"),
    "!图3-4": ("第3章", "图3-4-business_map生成流程.png", "图3-4 business_map 生成流程", "Figure 3-4 business_map Generation Process"),
    "!图3-5": ("第3章", "图3-5-图谱驱动任务上下文生成流水线.png", "图3-5 图谱驱动的任务上下文生成流水线", "Figure 3-5 Graph-Driven Task-Context Generation Pipeline"),
    "!图5-1": ("第5章", "图5-1-wpw系统三层架构.png", "图5-1 wpw 系统三层架构"),
    "!图5-2": ("第5章", "图5-2-工作流引擎实现架构.png", "图5-2 工作流引擎实现架构"),
    "!图5-3": ("第5章", "图5-3-阶段制品生成与确认流程.png", "图5-3 阶段制品生成与确认流程"),
    "!图5-4": ("第5章", "图5-4-DAG驱动的阶段门禁.png", "图5-4 DAG 驱动的阶段门禁"),
    "!图5-5": ("第5章", "图5-5-加权双向BFS子图扩展示意.png", "图5-5 加权双向 BFS 子图扩展示意"),
}


def insert_after(anchor, paragraph):
    anchor._p.addnext(paragraph._p)


document = Document(str(DOCX_PATH))
max_text_width = min(
    section.page_width - section.left_margin - section.right_margin
    for section in document.sections
)
placeholders = [
    p for p in document.paragraphs
    if p.text.strip().split("||", 1)[0] in FIGURES
]
if not placeholders:
    print("No figure placeholders found; document may already be synchronized.")
    raise SystemExit(0)

for placeholder in placeholders:
    raw_placeholder = placeholder.text.strip()
    key, _, caption_text_en = raw_placeholder.partition("||")
    figure_dir, image_name, caption_text = FIGURES[key][:3]
    image_path = WORKSPACE / "论文" / "图表" / figure_dir / image_name
    if not image_path.exists():
        raise FileNotFoundError(image_path)

    figure = document.add_paragraph()
    figure.alignment = WD_ALIGN_PARAGRAPH.CENTER
    figure.paragraph_format.space_before = 0
    figure.paragraph_format.space_after = 0
    figure.paragraph_format.keep_with_next = True
    native_width = Image.from_file(str(image_path)).width
    figure.add_run().add_picture(str(image_path), width=min(native_width, max_text_width))

    caption = document.add_paragraph(style="u图标题")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(1.2)
    caption.paragraph_format.space_after = Pt(12)
    caption.paragraph_format.line_spacing = 1.0
    caption.add_run(caption_text)
    if caption_text_en:
        caption.add_run().add_break()
        caption.add_run(caption_text_en)
    for run in caption.runs:
        run.font.name = "Times New Roman"
        run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "黑体")
        run.font.size = Pt(10.5)
        run.bold = True

    anchor = placeholder._p
    parent = anchor.getparent()
    insert_after(placeholder, figure)
    insert_after(figure, caption)
    parent.remove(anchor)

document.save(str(DOCX_PATH))
print(f"Embedded {len(placeholders)} chapter figures in {DOCX_PATH}")
