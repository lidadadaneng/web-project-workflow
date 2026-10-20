"""Compact the invisible end paragraphs of Word-generated navigation fields.

Word emits one empty TOC1 paragraph for the outer field terminator.  In a
nearly full TOC/list page that invisible paragraph can occupy a whole page.
Run this after Word has refreshed the three navigation fields.
"""
from __future__ import annotations

from pathlib import Path
import shutil
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree as E


ROOT = Path(__file__).resolve().parents[1]
THESIS_DIR = ROOT / "论文"
PATHS = (
    THESIS_DIR / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现_格式修订版.docx",
    THESIS_DIR / "面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现_附录.docx",
)
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + NS["w"] + "}"


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


def compact_paragraph(paragraph) -> None:
    properties = paragraph_properties(paragraph)
    section = properties.find(tag("sectPr"))
    if section is not None:
        properties.remove(section)
    spacing = child(properties, "spacing")
    spacing.attrib.clear()
    spacing.set(tag("before"), "0")
    spacing.set(tag("after"), "0")
    spacing.set(tag("line"), "2")
    spacing.set(tag("lineRule"), "exact")
    indent = child(properties, "ind")
    indent.attrib.clear()
    indent.set(tag("left"), "0")
    indent.set(tag("right"), "0")
    indent.set(tag("firstLine"), "0")
    for name in ("pageBreakBefore", "keepNext", "keepLines"):
        for node in properties.findall(tag(name)):
            properties.remove(node)
    mark = child(properties, "rPr")
    child(mark, "vanish", val="1")
    child(mark, "sz", val="2")
    child(mark, "szCs", val="2")
    for run in paragraph.findall(tag("r")):
        run_properties = child(run, "rPr")
        child(run_properties, "vanish", val="1")
        child(run_properties, "sz", val="2")
        child(run_properties, "szCs", val="2")
    if section is not None:
        properties.append(section)


def field_spans(body):
    children = list(body)
    for start, element in enumerate(children):
        if element.tag != tag("p"):
            continue
        instruction = " ".join(element.xpath(".//w:instrText/text()", namespaces=NS))
        if "TOC " not in instruction:
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
        yield start, end


def process(path: Path) -> int:
    with ZipFile(path) as source:
        parts = {name: source.read(name) for name in source.namelist()}
    document = E.fromstring(parts["word/document.xml"])
    body = document.find(tag("body"))
    spans = list(field_spans(body))
    compacted = 0
    # Word places the outer field terminator in a separate empty paragraph.
    # Move that run onto the final visible entry and remove the empty paragraph
    # entirely.  Formatting the empty paragraph as hidden causes Word to treat
    # the following section break inconsistently during PDF export.
    for start, end in reversed(spans):
        children = list(body)
        paragraph = children[end]
        visible_text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS)).strip()
        if visible_text:
            # Already compacted: the outer end is on the final visible entry.
            compacted += 1
            continue
        end_runs = paragraph.xpath(
            "./w:r[w:fldChar[@w:fldCharType='end']]", namespaces=NS
        )
        if len(end_runs) != 1 or end <= start:
            raise RuntimeError(
                f"Unexpected navigation field terminator in {path.name}: "
                f"span={start}..{end}, end_runs={len(end_runs)}"
            )
        end_run = end_runs[0]
        paragraph.remove(end_run)
        previous = children[end - 1]
        if previous.tag != tag("p"):
            raise RuntimeError("Navigation field does not end after a paragraph.")
        previous.append(end_run)
        body.remove(paragraph)
        compacted += 1
    if compacted != 3:
        raise RuntimeError(f"Expected three navigation fields in {path.name}, found {compacted}")
    boundaries = body.xpath(
        "w:p[w:pPr/w:pStyle/@w:val='ThesisNavBoundary']", namespaces=NS
    )
    if len(boundaries) > 1 or (path == PATHS[0] and len(boundaries) != 1):
        raise RuntimeError(f"Expected one navigation boundary in {path.name}.")
    children = list(body)
    boundary = boundaries[0] if boundaries else None
    if boundary is not None:
        boundary_index = children.index(boundary)
        if boundary_index + 1 >= len(children) or children[boundary_index + 1].tag != tag("p"):
            raise RuntimeError("Navigation boundary is not followed by content.")
        first_content = children[boundary_index + 1]
    else:
        first_candidates = body.xpath(
            "w:p[w:pPr/w:pStyle/@w:val='u' or "
            "w:pPr/w:pStyle/@w:val='ThesisAppendixFirst']",
            namespaces=NS,
        )
        if not first_candidates:
            raise RuntimeError("Could not locate the first appendix title.")
        first_content = first_candidates[0]
        boundary_index = None
    properties = paragraph_properties(first_content)
    page_break = properties.find(tag("pageBreakBefore"))
    if page_break is not None:
        properties.remove(page_break)
    page_break = E.Element(tag("pageBreakBefore"))
    page_break.set(tag("val"), "0")
    position = 1 if properties.find(tag("pStyle")) is not None else 0
    properties.insert(position, page_break)
    # Attach the appendix section break to the final table-list entry and
    # remove the dedicated boundary paragraph.  Word may still insert a blank
    # verso so that the restarted Arabic page 1 begins on a recto; preserving
    # that parity is preferable to turning the body pages into Roman numbers.
    if path == PATHS[1]:
        if boundary is not None:
            boundary_index = list(body).index(boundary)
            if boundary_index == 0 or list(body)[boundary_index - 1].tag != tag("p"):
                raise RuntimeError("Appendix boundary has no preceding list entry.")
            boundary_properties = paragraph_properties(boundary)
            section = boundary_properties.find(tag("sectPr"))
            if section is None:
                raise RuntimeError("Appendix navigation boundary has no section properties.")
            boundary_properties.remove(section)
            previous_properties = paragraph_properties(list(body)[boundary_index - 1])
            old_section = previous_properties.find(tag("sectPr"))
            if old_section is not None:
                previous_properties.remove(old_section)
            previous_properties.append(section)
            body.remove(boundary)
        else:
            first_index = list(body).index(first_content)
            if first_index == 0 or list(body)[first_index - 1].tag != tag("p"):
                raise RuntimeError("Appendix content has no preceding navigation paragraph.")
            previous_properties = paragraph_properties(list(body)[first_index - 1])
            section = previous_properties.find(tag("sectPr"))
            if section is None:
                raise RuntimeError("Could not locate the appendix section properties.")
        for section_type in section.findall(tag("type")):
            section.remove(section_type)
        first_content_properties = paragraph_properties(first_content)
        first_content_style = child(first_content_properties, "pStyle")
        first_content_style.set(tag("val"), "u")
    parts["word/document.xml"] = E.tostring(
        document, encoding="UTF-8", xml_declaration=True, standalone=True
    )
    settings = E.fromstring(parts["word/settings.xml"])
    update_fields = settings.find("w:updateFields", NS)
    if update_fields is None:
        update_fields = E.SubElement(settings, tag("updateFields"))
    update_fields.set(tag("val"), "false")
    parts["word/settings.xml"] = E.tostring(
        settings, encoding="UTF-8", xml_declaration=True, standalone=True
    )
    temporary = path.with_suffix(path.suffix + ".tmp")
    with ZipFile(temporary, "w", ZIP_DEFLATED) as target:
        for name, payload in parts.items():
            target.writestr(name, payload)
    shutil.copyfile(temporary, path)
    return compacted


def main() -> None:
    for path in PATHS:
        print(path.name, process(path))


if __name__ == "__main__":
    main()
