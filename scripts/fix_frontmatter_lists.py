"""Move navigation material to the front and add figure/table lists.

This is a final, idempotent OOXML pass for the two thesis deliverables.  It
keeps the thesis and appendix content intact, marks only the Chinese primary
captions as list sources, and lets Microsoft Word refresh all page numbers.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from shutil import copyfile
import re
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree as E


ROOT = Path(__file__).resolve().parents[1]
THESIS_DIR = ROOT / "论文"
MAIN = THESIS_DIR / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现_格式修订版.docx"
APPENDIX = THESIS_DIR / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现_附录.docx"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + NS["w"] + "}"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def tag(name: str) -> str:
    return W + name


def child(parent, name: str, **attrs):
    node = parent.find(tag(name))
    if node is None:
        node = E.SubElement(parent, tag(name))
    for key, value in attrs.items():
        node.set(tag(key), str(value))
    return node


def paragraph_properties(paragraph):
    properties = paragraph.find(tag("pPr"))
    if properties is None:
        properties = E.Element(tag("pPr"))
        paragraph.insert(0, properties)
    return properties


def paragraph_style(paragraph) -> str:
    return paragraph.xpath("string(w:pPr/w:pStyle/@w:val)", namespaces=NS)


def set_paragraph_style(paragraph, style_id: str) -> None:
    child(paragraph_properties(paragraph), "pStyle", val=style_id)


def paragraph_text(paragraph) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))


def serialize(root) -> bytes:
    return E.tostring(root, encoding="UTF-8", xml_declaration=True, standalone=True)


def read_package(path: Path) -> dict[str, bytes]:
    with ZipFile(path) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def write_package(path: Path, parts: dict[str, bytes]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
        for name, payload in parts.items():
            archive.writestr(name, payload)
    copyfile(temporary, path)


def ensure_style(styles, style_id: str, based_on: str) -> None:
    style = styles.find(f"w:style[@w:styleId='{style_id}']", NS)
    if style is None:
        style = E.SubElement(styles, tag("style"))
        style.set(tag("type"), "paragraph")
        style.set(tag("customStyle"), "1")
        style.set(tag("styleId"), style_id)
    child(style, "name", val=style_id)
    child(style, "basedOn", val=based_on)
    child(style, "next", val=based_on)
    child(style, "uiPriority", val="99")


def keep_toc_entries_together(styles) -> None:
    """Prevent a single long navigation entry from splitting across pages."""
    for style_id in ("TOC1", "TOC2", "TOC3"):
        style = styles.find(f"w:style[@w:styleId='{style_id}']", NS)
        if style is None:
            continue
        properties = child(style, "pPr")
        child(properties, "keepLines", val="1")


def make_title(value: str, style_id: str, first_page: bool = False):
    paragraph = E.Element(tag("p"))
    properties = paragraph_properties(paragraph)
    child(properties, "pStyle", val=style_id)
    if first_page:
        child(properties, "pageBreakBefore", val="0")
    run = E.SubElement(paragraph, tag("r"))
    text = E.SubElement(run, tag("t"))
    text.text = value
    return paragraph


def make_field(instruction: str):
    paragraph = E.Element(tag("p"))
    properties = paragraph_properties(paragraph)
    child(properties, "pStyle", val="u9")
    indent = child(properties, "ind")
    indent.set(tag("firstLine"), "0")
    indent.set(tag("firstLineChars"), "0")
    numbering = child(properties, "numPr")
    numbering.clear()
    child(numbering, "numId", val="0")

    begin_run = E.SubElement(paragraph, tag("r"))
    begin = E.SubElement(begin_run, tag("fldChar"))
    begin.set(tag("fldCharType"), "begin")
    begin.set(tag("dirty"), "true")

    instruction_run = E.SubElement(paragraph, tag("r"))
    instruction_node = E.SubElement(instruction_run, tag("instrText"))
    instruction_node.set(XML_SPACE, "preserve")
    instruction_node.text = f" {instruction} "

    separator_run = E.SubElement(paragraph, tag("r"))
    E.SubElement(separator_run, tag("fldChar")).set(tag("fldCharType"), "separate")

    placeholder_run = E.SubElement(paragraph, tag("r"))
    E.SubElement(placeholder_run, tag("t")).text = "更新域后自动生成"

    end_run = E.SubElement(paragraph, tag("r"))
    E.SubElement(end_run, tag("fldChar")).set(tag("fldCharType"), "end")
    return paragraph


def make_boundary(section_properties):
    paragraph = E.Element(tag("p"))
    properties = paragraph_properties(paragraph)
    child(properties, "pStyle", val="ThesisNavBoundary")
    spacing = child(properties, "spacing")
    spacing.attrib.clear()
    spacing.set(tag("before"), "0")
    spacing.set(tag("after"), "0")
    spacing.set(tag("line"), "20")
    spacing.set(tag("lineRule"), "exact")
    run_properties = child(properties, "rPr")
    child(run_properties, "vanish", val="1")
    child(run_properties, "sz", val="2")
    properties.append(section_properties)
    return paragraph


def remove_tc_fields(paragraph) -> None:
    """Remove TC fields previously inserted by this pass."""
    nodes = list(paragraph)
    remove_indexes: set[int] = set()
    for start, node in enumerate(nodes):
        if node.tag != tag("r") or not node.xpath(
            ".//w:fldChar[@w:fldCharType='begin']", namespaces=NS
        ):
            continue
        depth = 0
        instructions: list[str] = []
        end = start
        for index in range(start, len(nodes)):
            current = nodes[index]
            if current.tag == tag("r"):
                depth += len(
                    current.xpath(".//w:fldChar[@w:fldCharType='begin']", namespaces=NS)
                )
                instructions.extend(current.xpath(".//w:instrText/text()", namespaces=NS))
                depth -= len(
                    current.xpath(".//w:fldChar[@w:fldCharType='end']", namespaces=NS)
                )
            end = index
            if depth == 0:
                break
        if "".join(instructions).strip().startswith("TC "):
            remove_indexes.update(range(start, end + 1))
    for index in sorted(remove_indexes, reverse=True):
        paragraph.remove(nodes[index])


def append_tc_field(paragraph, value: str, identifier: str, bookmark_id: int) -> None:
    """Add a hidden TOC-entry field at the caption's physical page."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')

    begin_run = E.SubElement(paragraph, tag("r"))
    child(child(begin_run, "rPr"), "vanish", val="1")
    E.SubElement(begin_run, tag("fldChar")).set(tag("fldCharType"), "begin")

    prefix_run = E.SubElement(paragraph, tag("r"))
    child(child(prefix_run, "rPr"), "vanish", val="1")
    prefix = E.SubElement(prefix_run, tag("instrText"))
    prefix.set(XML_SPACE, "preserve")
    prefix.text = ' TC "'

    bookmark_name = f"_TocList{identifier}{bookmark_id:05d}"
    bookmark_start = E.SubElement(paragraph, tag("bookmarkStart"))
    bookmark_start.set(tag("id"), str(bookmark_id))
    bookmark_start.set(tag("name"), bookmark_name)

    value_run = E.SubElement(paragraph, tag("r"))
    child(child(value_run, "rPr"), "vanish", val="1")
    value_node = E.SubElement(value_run, tag("instrText"))
    value_node.text = escaped

    bookmark_end = E.SubElement(paragraph, tag("bookmarkEnd"))
    bookmark_end.set(tag("id"), str(bookmark_id))

    suffix_run = E.SubElement(paragraph, tag("r"))
    child(child(suffix_run, "rPr"), "vanish", val="1")
    suffix = E.SubElement(suffix_run, tag("instrText"))
    suffix.set(XML_SPACE, "preserve")
    suffix.text = f'" \\f {identifier} \\l 1 '

    end_run = E.SubElement(paragraph, tag("r"))
    child(child(end_run, "rPr"), "vanish", val="1")
    E.SubElement(end_run, tag("fldChar")).set(tag("fldCharType"), "end")


def set_page_numbering(section_properties, fmt: str, start: int) -> None:
    section_type = child(section_properties, "type", val="nextPage")
    section_type.set(tag("val"), "nextPage")
    page_number = child(section_properties, "pgNumType", fmt=fmt, start=start)
    page_number.set(tag("fmt"), fmt)
    page_number.set(tag("start"), str(start))


def suppress_leading_page_break(paragraph) -> None:
    """A next-page section break already starts the following heading page."""
    properties = paragraph_properties(paragraph)
    existing = properties.find(tag("pageBreakBefore"))
    if existing is not None:
        properties.remove(existing)
    node = E.Element(tag("pageBreakBefore"))
    node.set(tag("val"), "0")
    position = 1 if properties.find(tag("pStyle")) is not None else 0
    properties.insert(position, node)


def toc_field_spans(body) -> list[tuple[int, int]]:
    """Return inclusive body-child spans occupied by TOC fields and results."""
    children = list(body)
    spans: list[tuple[int, int]] = []
    for start, element in enumerate(children):
        if element.tag != tag("p"):
            continue
        instructions = " ".join(element.xpath(".//w:instrText/text()", namespaces=NS))
        if "TOC " not in instructions:
            continue
        depth = 0
        saw_toc = False
        end = start
        for index in range(start, len(children)):
            current = children[index]
            if current.tag != tag("p"):
                continue
            for node in current.xpath(".//w:fldChar | .//w:instrText", namespaces=NS):
                if node.tag == tag("fldChar"):
                    kind = node.get(tag("fldCharType"))
                    if kind == "begin":
                        depth += 1
                    elif kind == "end":
                        depth -= 1
                elif "TOC " in (node.text or ""):
                    saw_toc = True
            end = index
            if saw_toc and depth == 0:
                break
        spans.append((start, end))
    return spans


def remove_existing_navigation(body):
    children = list(body)
    remove_indexes: set[int] = set()
    saved_section = None
    for start, end in toc_field_spans(body):
        remove_indexes.update(range(start, end + 1))
        if start > 0 and children[start - 1].tag == tag("p"):
            prior_style = paragraph_style(children[start - 1])
            if prior_style in {"ThesisTOCTitle", "ThesisListTitle"}:
                remove_indexes.add(start - 1)
    for index, element in enumerate(children):
        if element.tag != tag("p"):
            continue
        if paragraph_style(element) in {"ThesisTOCTitle", "ThesisListTitle", "ThesisNavBoundary"}:
            remove_indexes.add(index)
    for index in sorted(remove_indexes):
        for section in children[index].xpath("w:pPr/w:sectPr", namespaces=NS):
            saved_section = deepcopy(section)
    for index in sorted(remove_indexes, reverse=True):
        body.remove(children[index])
    return saved_section


def mark_caption_sources(body) -> tuple[int, int]:
    figures = 0
    tables = 0
    bookmark_ids = [
        int(value)
        for value in body.xpath(".//w:bookmarkStart/@w:id", namespaces=NS)
        if value.isdigit()
    ]
    next_bookmark_id = max(bookmark_ids, default=0) + 1
    for paragraph in body.findall(tag("p")):
        style_id = paragraph_style(paragraph)
        value = paragraph_text(paragraph).strip()
        if style_id in {"u0", "ThesisFigureListEntry"}:
            set_paragraph_style(paragraph, "u0")
            remove_tc_fields(paragraph)
            match = re.search(r"(?=Fig\.\s*[A-E\d])", value, flags=re.IGNORECASE)
            chinese_caption = value[: match.start()].strip() if match else value
            append_tc_field(paragraph, chinese_caption, "F", next_bookmark_id)
            next_bookmark_id += 1
            figures += 1
        elif style_id in {"ua", "ThesisTableListEntry"}:
            is_primary_chinese = value.startswith("表") and "（续）" not in value
            set_paragraph_style(paragraph, "ua")
            remove_tc_fields(paragraph)
            if is_primary_chinese:
                append_tc_field(paragraph, value, "T", next_bookmark_id)
                next_bookmark_id += 1
                tables += 1
    return figures, tables


def navigation_elements(first_title_at_document_start: bool, section_properties):
    return [
        make_title("目  录", "ThesisTOCTitle", first_title_at_document_start),
        make_field('TOC \\o "1-3" \\h \\z \\u'),
        make_title("插图清单", "ThesisListTitle"),
        make_field("TOC \\f F \\h \\z"),
        make_title("附表清单", "ThesisListTitle"),
        make_field("TOC \\f T \\h \\z"),
        make_boundary(section_properties),
    ]


def update_settings(parts: dict[str, bytes]) -> None:
    settings = E.fromstring(parts["word/settings.xml"])
    child(settings, "updateFields", val="true")
    parts["word/settings.xml"] = serialize(settings)


def revise_main(path: Path) -> tuple[int, int]:
    parts = read_package(path)
    document = E.fromstring(parts["word/document.xml"])
    body = document.find(tag("body"))
    styles = E.fromstring(parts["word/styles.xml"])
    ensure_style(styles, "ThesisListTitle", "ThesisTOCTitle")
    ensure_style(styles, "ThesisFigureListEntry", "u0")
    ensure_style(styles, "ThesisTableListEntry", "ua")
    ensure_style(styles, "ThesisNavBoundary", "u9")
    keep_toc_entries_together(styles)

    saved_section = remove_existing_navigation(body)
    keywords = next(
        paragraph
        for paragraph in body.findall(tag("p"))
        if paragraph_text(paragraph).strip().startswith("Key Words:")
    )
    keyword_properties = paragraph_properties(keywords)
    keyword_section = keyword_properties.find(tag("sectPr"))
    if keyword_section is not None:
        front_section = deepcopy(keyword_section)
        keyword_properties.remove(keyword_section)
    elif saved_section is not None:
        front_section = saved_section
    else:
        raise RuntimeError("Main thesis front-matter section boundary was not found.")
    set_page_numbering(front_section, "upperRoman", 1)

    final_section = body.find(tag("sectPr"))
    if final_section is None:
        raise RuntimeError("Main thesis final section properties were not found.")
    set_page_numbering(final_section, "decimal", 1)

    figures, tables = mark_caption_sources(body)
    insertion_index = list(body).index(keywords) + 1
    for offset, element in enumerate(navigation_elements(False, front_section)):
        body.insert(insertion_index + offset, element)

    parts["word/document.xml"] = serialize(document)
    parts["word/styles.xml"] = serialize(styles)
    update_settings(parts)
    write_package(path, parts)
    return figures, tables


def revise_appendix(path: Path) -> tuple[int, int]:
    parts = read_package(path)
    document = E.fromstring(parts["word/document.xml"])
    body = document.find(tag("body"))
    styles = E.fromstring(parts["word/styles.xml"])
    ensure_style(styles, "ThesisListTitle", "ThesisTOCTitle")
    ensure_style(styles, "ThesisFigureListEntry", "u0")
    ensure_style(styles, "ThesisTableListEntry", "ua")
    ensure_style(styles, "ThesisNavBoundary", "u9")
    keep_toc_entries_together(styles)

    saved_section = remove_existing_navigation(body)
    final_section = body.find(tag("sectPr"))
    if final_section is None:
        raise RuntimeError("Appendix final section properties were not found.")
    if saved_section is not None:
        # An idempotent rerun can recover the already-created front section.
        front_section = saved_section
    else:
        front_section = deepcopy(final_section)
    set_page_numbering(front_section, "upperRoman", 1)
    set_page_numbering(final_section, "decimal", 1)

    figures, tables = mark_caption_sources(body)
    first_content = next(
        element for element in body if element.tag == tag("p") and paragraph_style(element) == "u"
    )
    suppress_leading_page_break(first_content)
    for offset, element in enumerate(navigation_elements(True, front_section)):
        body.insert(offset, element)

    parts["word/document.xml"] = serialize(document)
    parts["word/styles.xml"] = serialize(styles)
    update_settings(parts)
    write_package(path, parts)
    return figures, tables


def main() -> None:
    for path in (MAIN, APPENDIX):
        if not path.exists():
            raise FileNotFoundError(path)
    main_counts = revise_main(MAIN)
    appendix_counts = revise_appendix(APPENDIX)
    print(f"MAIN figures={main_counts[0]} tables={main_counts[1]}")
    print(f"APPENDIX figures={appendix_counts[0]} tables={appendix_counts[1]}")


if __name__ == "__main__":
    main()
