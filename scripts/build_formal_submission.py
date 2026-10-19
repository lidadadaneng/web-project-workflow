"""Build the template-aligned, single-volume formal thesis submission.

The source is the fully corrected combined thesis saved immediately before the
earlier appendix split.  This script restores the university-required order,
adds the three front-matter navigation fields, and fills every metadata item
that can be established from the repository or the university's public staff
and student records.  Handwritten signatures and post-defence committee data
remain blank by design.
"""

from __future__ import annotations

from copy import deepcopy
import importlib.util
from pathlib import Path
from shutil import copy2
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree as E


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "tmp_thesis"
    / "format_review_20261019"
    / "combined-before-appendix-split.docx"
)
OUTPUT = (
    ROOT
    / "论文"
    / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现_正式交稿版.docx"
)
FRONTMATTER_HELPER = ROOT / "scripts" / "fix_frontmatter_lists.py"

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
}
W = "{" + NS["w"] + "}"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

ACKNOWLEDGEMENT = (
    "本论文的选题、研究和撰写过程中，导师张志超副教授在研究思路、实验设计和论文修改等方面"
    "给予了细致指导，在此致以诚挚感谢。感谢课题组老师和同学在研究讨论、系统测试与材料整理中"
    "提供的帮助，感谢参与实验评审与结果复核的同学。感谢开源社区提供的软件工具和技术资料，"
    "为 WPW 系统的实现与验证提供了重要支持。最后，感谢家人在学习和写作期间给予的理解、支持"
    "与鼓励。"
)
RESEARCH_RECORD = (
    "（1）面向 AI 辅助软件开发的图谱驱动上下文工程方法研究与 WPW 系统实现，"
    "主要完成人，2024.09—2026.09。"
)


def tag(name: str) -> str:
    return W + name


def serialize(root) -> bytes:
    return E.tostring(root, encoding="UTF-8", xml_declaration=True, standalone=True)


def package_parts(path: Path) -> dict[str, bytes]:
    with ZipFile(path) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def write_package(path: Path, parts: dict[str, bytes]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
        for name, payload in parts.items():
            archive.writestr(name, payload)
    temporary.replace(path)


def element_text(element) -> str:
    return "".join(element.xpath(".//w:t/text()", namespaces=NS))


def paragraph_style(paragraph) -> str:
    return paragraph.xpath("string(w:pPr/w:pStyle/@w:val)", namespaces=NS)


def replace_paragraph_text(paragraph, value: str) -> None:
    properties = paragraph.find(tag("pPr"))
    first_run_properties = paragraph.find("w:r/w:rPr", NS)
    for child in list(paragraph):
        if child is not properties:
            paragraph.remove(child)
    run = E.SubElement(paragraph, tag("r"))
    if first_run_properties is not None:
        run.append(deepcopy(first_run_properties))
    text = E.SubElement(run, tag("t"))
    text.set(XML_SPACE, "preserve")
    text.text = value


def replace_cell_text(cell, value: str) -> None:
    properties = cell.find(tag("tcPr"))
    old_paragraph = cell.find(tag("p"))
    paragraph_properties = None
    run_properties = None
    if old_paragraph is not None:
        paragraph_properties = old_paragraph.find(tag("pPr"))
        run_properties = old_paragraph.find("w:r/w:rPr", NS)
    for child in list(cell):
        if child is not properties:
            cell.remove(child)
    paragraph = E.SubElement(cell, tag("p"))
    if paragraph_properties is not None:
        paragraph.append(deepcopy(paragraph_properties))
    run = E.SubElement(paragraph, tag("r"))
    if run_properties is not None:
        run.append(deepcopy(run_properties))
    text = E.SubElement(run, tag("t"))
    text.set(XML_SPACE, "preserve")
    text.text = value


def replace_supervisor_line(paragraph) -> None:
    """Fill the supervisor row without inheriting the template's fitText.

    The source template compresses its handwritten placeholder with Word's
    ``fitText``/25-percent character-width properties.  Reusing that run style
    after inserting real metadata makes the row illegible, so rebuild the runs
    with normal-width characters while keeping the template's paragraph
    spacing.
    """

    properties = paragraph.find(tag("pPr"))
    if properties is None:
        properties = E.Element(tag("pPr"))
        paragraph.insert(0, properties)
    paragraph_run_properties = properties.find(tag("rPr"))
    if paragraph_run_properties is not None:
        properties.remove(paragraph_run_properties)
    for child in list(paragraph):
        if child is not properties:
            paragraph.remove(child)

    def add_run(value: str, *, label: bool = False, underline: bool = False) -> None:
        run = E.SubElement(paragraph, tag("r"))
        run_properties = E.SubElement(run, tag("rPr"))
        fonts = E.SubElement(run_properties, tag("rFonts"))
        fonts.set(tag("ascii"), "Times New Roman")
        fonts.set(tag("hAnsi"), "Times New Roman")
        fonts.set(tag("eastAsia"), "黑体" if label else "宋体")
        if label:
            E.SubElement(run_properties, tag("b")).set(tag("val"), "1")
            E.SubElement(run_properties, tag("bCs")).set(tag("val"), "1")
        if underline:
            E.SubElement(run_properties, tag("u")).set(tag("val"), "single")
        E.SubElement(run_properties, tag("sz")).set(tag("val"), "28")
        E.SubElement(run_properties, tag("szCs")).set(tag("val"), "28")
        text = E.SubElement(run, tag("t"))
        text.set(XML_SPACE, "preserve")
        text.text = value

    add_run("指导教师：", label=True)
    add_run(" 张志超 ", underline=True)
    add_run("  单位：", label=True)
    add_run(" 数理学院 ", underline=True)
    add_run("  职称：", label=True)
    add_run(" 副教授 ", underline=True)


def make_body_paragraph(value: str, *, bold: bool = False, indent: bool = True):
    paragraph = E.Element(tag("p"))
    properties = E.SubElement(paragraph, tag("pPr"))
    E.SubElement(properties, tag("pStyle")).set(tag("val"), "u9")
    indentation = E.SubElement(properties, tag("ind"))
    if indent:
        indentation.set(tag("firstLine"), "480")
        indentation.set(tag("firstLineChars"), "200")
    else:
        indentation.set(tag("firstLine"), "0")
        indentation.set(tag("firstLineChars"), "0")
    if bold:
        E.SubElement(properties, tag("keepNext")).set(tag("val"), "1")
    run = E.SubElement(paragraph, tag("r"))
    run_properties = E.SubElement(run, tag("rPr"))
    if bold:
        E.SubElement(run_properties, tag("b")).set(tag("val"), "1")
        E.SubElement(run_properties, tag("bCs")).set(tag("val"), "1")
    text = E.SubElement(run, tag("t"))
    text.set(XML_SPACE, "preserve")
    text.text = value
    return paragraph


def find_paragraph(body, value: str):
    target = value.replace(" ", "")
    for paragraph in body.findall(tag("p")):
        if element_text(paragraph).replace(" ", "") == target:
            return paragraph
    raise RuntimeError(f"Paragraph not found: {value}")


def find_table(body, first_cell_text: str):
    for table in body.findall(tag("tbl")):
        cells = table.xpath("./w:tr[1]/w:tc", namespaces=NS)
        if cells and element_text(cells[0]).strip() == first_cell_text:
            return table
    raise RuntimeError(f"Table not found: {first_cell_text}")


def raw_rows(table):
    return [row.findall(tag("tc")) for row in table.findall(tag("tr"))]


def fill_cover_and_title_page(body) -> None:
    replacements = {
        "研究生": "研究生：王程海",
        "指导教师": "指导教师：张志超",
        "北京科技大学XX学院": "北京科技大学数理学院",
        "Master Degree Candidate": "Master Degree Candidate: Chenghai Wang",
        "Supervisor": "Supervisor: Zhichao Zhang",
        "School of  XX": "School of Mathematics and Physics",
    }
    for paragraph in body.findall(tag("p")):
        value = element_text(paragraph)
        if value in replacements:
            replace_paragraph_text(paragraph, replacements[value])
        elif value.startswith("指 导  教 师："):
            replace_supervisor_line(paragraph)

    cover_table = body.findall(tag("tbl"))[0]
    rows = raw_rows(cover_table)
    replace_cell_text(rows[0][1], "TP311")
    replace_cell_text(rows[1][1], "620")


def fill_acknowledgement(body) -> None:
    title = find_paragraph(body, "致谢")
    next_element = title.getnext()
    if next_element is not None and next_element.tag == tag("p"):
        value = element_text(next_element).strip()
        if value == ACKNOWLEDGEMENT:
            return
    title.addnext(make_body_paragraph(ACKNOWLEDGEMENT))


def fill_resume(body) -> None:
    title = find_paragraph(body, "作者简历及在学研究成果")
    table = find_table(body, "起止年月")
    rows = raw_rows(table)
    for row in rows[1:]:
        for cell in row:
            replace_cell_text(cell, "")
    replace_cell_text(rows[3][0], "2024年09月至今")
    replace_cell_text(rows[3][1], "在北京科技大学数理学院软件工程专业攻读硕士学位")

    first_heading = make_body_paragraph(
        "一、主要教育经历/工作经历（从大学起，到硕士入学止）",
        bold=True,
        indent=False,
    )
    title.addnext(first_heading)
    # The table already follows the title in document order; move it after the
    # inserted first heading to preserve the template's intended reading order.
    table.getparent().remove(table)
    first_heading.addnext(table)
    second_heading = make_body_paragraph(
        "二、在学期间从事的科研工作", bold=True, indent=False
    )
    table.addnext(second_heading)
    second_heading.addnext(make_body_paragraph(RESEARCH_RECORD, indent=False))


def fill_dataset(body) -> None:
    table = find_table(body, "关键词*")
    rows = raw_rows(table)
    replace_cell_text(rows[1][2], "TP311")
    replace_cell_text(rows[1][3], "620")
    replace_cell_text(rows[3][2], "工程硕士")
    replace_cell_text(rows[3][3], "硕士")
    replace_cell_text(rows[6][1], "王程海")
    replace_cell_text(rows[6][3], "M202440119")
    replace_cell_text(rows[10][0], "软件工程")
    replace_cell_text(rows[10][1], "人工智能方向")
    replace_cell_text(rows[10][2], "2.5年")
    replace_cell_text(rows[10][3], "2026")
    replace_cell_text(rows[11][1], "2026年09月08日")
    replace_cell_text(rows[12][1], "张志超")
    replace_cell_text(rows[12][3], "副教授")
    replace_cell_text(
        rows[15][0],
        "电子版论文提交格式  文本（√）  图像（ ） 视频（ ） 音频（ ） 多媒体（ ） 其他（ ）\n"
        "推荐格式：application/msword; application/pdf",
    )
    replace_cell_text(rows[17][0], "北京科技大学")
    replace_cell_text(rows[17][1], "北京")
    replace_cell_text(rows[17][3], "公开")
    # The university form uses the final consecutively numbered thesis page,
    # not the unnumbered covers and print-parity blank page.
    replace_cell_text(rows[18][1], "192")


def set_core_properties(parts: dict[str, bytes]) -> None:
    name = "docProps/core.xml"
    if name not in parts:
        return
    root = E.fromstring(parts[name])
    values = {
        "title": "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现",
        "creator": "王程海",
        "lastModifiedBy": "王程海",
    }
    for local_name, value in values.items():
        namespace = NS["dc"] if local_name in {"title", "creator"} else NS["cp"]
        node = root.find(f"{{{namespace}}}{local_name}")
        if node is None:
            node = E.SubElement(root, f"{{{namespace}}}{local_name}")
        node.text = value
    parts[name] = serialize(root)


def fill_known_submission_data(path: Path) -> None:
    parts = package_parts(path)
    document = E.fromstring(parts["word/document.xml"])
    body = document.find(tag("body"))
    fill_cover_and_title_page(body)
    fill_acknowledgement(body)
    fill_resume(body)
    fill_dataset(body)
    parts["word/document.xml"] = serialize(document)
    set_core_properties(parts)
    write_package(path, parts)


def load_frontmatter_helper():
    spec = importlib.util.spec_from_file_location("frontmatter_helper", FRONTMATTER_HELPER)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load fix_frontmatter_lists.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    copy2(SOURCE, OUTPUT)
    fill_known_submission_data(OUTPUT)
    helper = load_frontmatter_helper()
    figures, tables = helper.revise_main(OUTPUT)
    if figures != 55 or tables != 44:
        raise RuntimeError(
            f"Unexpected navigation sources: figures={figures}, tables={tables}"
        )
    print(f"Formal thesis: {OUTPUT}")
    print(f"Navigation sources: figures={figures}, tables={tables}")


if __name__ == "__main__":
    main()
