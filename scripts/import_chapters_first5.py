# -*- coding: utf-8 -*-
"""把摘要与成稿章节 md（1-7）填充进论文 docx，重建对应章节区域。"""
import copy
import re
import docx
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from docx.shared import Pt

DOCX = r'E:\project\web-project-workflow\论文\面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现-前5章.docx'
MD0 = r'E:\project\web-project-workflow\论文\0.摘要.md'
MD1 = r'E:\project\web-project-workflow\论文\1.引言.md'
MD2 = r'E:\project\web-project-workflow\论文\2.相关技术.md'
MD3 = r'E:\project\web-project-workflow\论文\3.上下文工程方法.md'
MD4 = r'E:\project\web-project-workflow\论文\4.系统需求分析.md'
MD5 = r'E:\project\web-project-workflow\论文\5.系统设计与实现.md'
MD6 = r'E:\project\web-project-workflow\论文\6.系统测试与结果分析.md'
MD7 = r'E:\project\web-project-workflow\论文\7.总结与展望.md'

d = docx.Document(DOCX)
paras = d.paragraphs

# ---------- 锚点段落（取样式模板；按样式动态定位，锚点文本可能已被上次导入重建删除） ----------
def find_para(text, style):
    for p in paras:
        if p.text.strip() == text and p.style.name == style:
            return p
    raise LookupError(f'{text!r} ({style})')

def has_para(text, style):
    return any(p.text.strip() == text and p.style.name == style for p in paras)

def first_style(style):
    for p in paras:
        if p.style.name == style:
            return p
    raise LookupError(f'no paragraph with style {style!r}')

A_H2 = first_style('u2级标题')
A_H3 = first_style('u3级标题')
A_TABLE_TITLE = first_style('u表标题')
A_CODE = first_style('Plain Text')
A_BODY = first_style('u正文')

def get_rpr(anchor):
    r = anchor._p.find(qn('w:r'))
    rpr = r.find(qn('w:rPr')) if r is not None else None
    return copy.deepcopy(rpr) if rpr is not None else None

BODY_RPR = get_rpr(A_BODY)

# The official template leaves the East Asian body font implicit. Make it
# explicit so Word cannot substitute a theme font on another workstation.
body_style_rpr = d.styles['u正文'].element.get_or_add_rPr()
body_style_rpr.get_or_add_rFonts().set(qn('w:eastAsia'), '宋体')

# ---------- md 解析 ----------
INLINE = re.compile(r'(\*\*[^*]+?\*\*|\*[^*\n]+?\*|`[^`]+?`|\[[^\]]+?\]\([^)]+?\))')
IMAGE_MD = re.compile(r'^!\[([^\]]*)\]\(([^)]+)\)$')

def tokenize(text):
    """返回 [(text, bold, italic, code)] 片段列表。"""
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            out.append((part[2:-2], True, False, False))
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            out.append((part[1:-1], False, True, False))
        elif part.startswith('`') and part.endswith('`'):
            out.append((part[1:-1], False, False, True))
        elif part.startswith('[') and '](' in part:
            out.append((part[1:part.index(']')], False, False, False))
        else:
            out.append((part, False, False, False))
    return out or [('', False, False, False)]

def parse_md(path):
    blocks = []
    lines = open(path, encoding='utf-8-sig').read().splitlines()
    i, para_buf, in_html_comment = 0, [], False

    def flush():
        if para_buf:
            blocks.append(('p', ' '.join(para_buf)))
            para_buf.clear()

    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if in_html_comment:
            if '-->' in s:
                in_html_comment = False
        elif s.startswith('<!--'):
            flush()
            if '-->' not in s:
                in_html_comment = True
        elif not s:
            flush()
        elif s.startswith('```'):
            flush()
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i])
                i += 1
            blocks.append(('code', '\n'.join(code)))
        elif s.startswith('#'):
            flush()
            level = len(s) - len(s.lstrip('#'))
            text = s.lstrip('#').strip()
            blocks.append((f'h{level}', text))
        elif s.startswith('|'):
            flush()
            rows = []
            aligns = None
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
                    aligns = [
                        'center' if c.startswith(':') and c.endswith(':')
                        else 'right' if c.endswith(':')
                        else 'left'
                        for c in cells
                    ]
                else:
                    rows.append(cells)
                i += 1
            # 表题是紧邻表格前、以“表N-M”开头的独立标题；“表N-M给出/列出...”仍是正文。
            # 双语表题按“中文一行、英文一行”保存，两个标题都要进入表题样式。
            if (len(blocks) >= 2 and blocks[-2][0] == 'p' and blocks[-1][0] == 'p'
                    and re.fullmatch(r'表\s*\d+-\d+\s+.+', blocks[-2][1].strip())
                    and re.fullmatch(r'Table\s+\d+-\d+\s+.+', blocks[-1][1].strip())):
                cn_caption = blocks[-2][1].strip()
                is_sentence = re.match(r'^表\s*\d+-\d+\s*(给出|列出|展示|说明|报告|汇总|比较)', cn_caption)
                if not is_sentence:
                    blocks[-2] = ('table_caption', cn_caption)
                    blocks[-1] = ('table_caption_en', blocks[-1][1].strip())
            elif blocks and blocks[-1][0] == 'p':
                candidate = blocks[-1][1].strip()
                is_caption = re.fullmatch(r'表\s*\d+-\d+\s+.+', candidate)
                is_sentence = re.match(r'^表\s*\d+-\d+\s*(给出|列出|展示|说明|报告|汇总|比较)', candidate)
                if is_caption and not is_sentence:
                    blocks[-1] = ('table_caption', candidate)
            blocks.append(('table', rows, aligns or []))
            continue
        elif s.startswith('>'):
            flush()
            blocks.append(('quote', s.lstrip('> ').strip()))
        elif IMAGE_MD.fullmatch(s):
            flush()
            m = IMAGE_MD.fullmatch(s)
            blocks.append(('image', m.group(1), m.group(2)))
        elif re.fullmatch(r'-{3,}|\*{3,}', s):
            flush()
        elif re.match(r'^\s*[-*+]\s+', ln):
            flush()
            indent = (len(ln) - len(ln.lstrip())) // 2
            blocks.append(('li', re.sub(r'^\s*[-*+]\s+', '', ln), indent, False))
        elif re.match(r'^\s*\d+[.、)]\s+', ln):
            flush()
            blocks.append(('li', ln.strip(), 0, True))
        else:
            para_buf.append(s)
        i += 1
    flush()
    # 截掉章末写作素材块（参考文献映射/图表清单等，不进论文正文）
    markers = ('本章参考文献', '本章图表清单', '全文参考文献规模规划')
    for i, blk in enumerate(blocks):
        t = blk[1] if len(blk) > 1 else ''
        if isinstance(t, str) and t.strip().lstrip('*').strip().startswith(markers):
            return blocks[:i]
    return blocks

def strip_num(text):
    text = re.sub(r'^第\s*\d+\s*章\s*', '', text)
    text = re.sub(r'^\d+(\.\d+)*\s*', '', text)
    return text.strip()

# ---------- docx 构建原语 ----------
body = d.element.body

def make_para(anchor, elements):
    """elements: [(text, bold, italic, code)]；克隆锚点段落并填内容。"""
    style_name = anchor.style.name
    new = copy.deepcopy(anchor._p)
    p = Paragraph(new, None)
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    for text, bold, italic, code in elements:
        run = p.add_run(text)
        if bold:
            run.bold = True
        if italic:
            run.italic = True
        if code:
            run.font.name = 'Consolas'
    if style_name == 'u正文':
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    elif style_name == 'u表标题':
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_before = Pt(10.5)
        p.paragraph_format.space_after = Pt(1.05)
        p.paragraph_format.keep_with_next = True
        for run in p.runs:
            run.font.name = 'Times New Roman'
            run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '黑体')
            run.font.size = Pt(10.5)
            run.bold = True
    elif style_name in ('u2级标题', 'u3级标题', 'Heading 1'):
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.keep_together = True
    return new

def text_el(text):
    return [(text, False, False, False)]

def make_code_para(text):
    """Render one fenced Markdown block as one shaded, monospace Word paragraph."""
    new = copy.deepcopy(A_CODE._p)
    p = Paragraph(new, None)
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    p.paragraph_format.left_indent = Pt(18)
    p.paragraph_format.right_indent = Pt(18)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    ppr = p._p.get_or_add_pPr()
    shd = ppr.find(qn('w:shd'))
    if shd is None:
        shd = docx.oxml.OxmlElement('w:shd')
        ppr.append(shd)
    shd.set(qn('w:fill'), 'F2F2F2')
    shd.set(qn('w:val'), 'clear')
    run = p.add_run(text.rstrip())
    run.font.name = 'Consolas'
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), 'Consolas')
    run.font.size = Pt(9)
    return new

def set_border(container, edge, val, size=None):
    borders = container.find(qn('w:tblBorders'))
    if borders is None:
        borders = OxmlElement('w:tblBorders')
        container.append(borders)
    border = borders.find(qn('w:' + edge))
    if border is None:
        border = OxmlElement('w:' + edge)
        borders.append(border)
    border.set(qn('w:val'), val)
    border.set(qn('w:color'), '000000')
    if size is not None:
        border.set(qn('w:sz'), str(size))

def set_cell_bottom_border(cell, size=6):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn('w:tcBorders'))
    if borders is None:
        borders = OxmlElement('w:tcBorders')
        tc_pr.append(borders)
    bottom = borders.find(qn('w:bottom'))
    if bottom is None:
        bottom = OxmlElement('w:bottom')
        borders.append(bottom)
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), str(size))
    bottom.set(qn('w:color'), '000000')

def format_table(tbl, aligns):
    """Apply the USTB five-point, centered, three-line table format."""
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = True
    tbl_pr = tbl._tbl.tblPr
    set_border(tbl_pr, 'top', 'single', 12)
    set_border(tbl_pr, 'bottom', 'single', 12)
    for edge in ('left', 'right', 'insideH', 'insideV'):
        set_border(tbl_pr, edge, 'nil')

    for ri, row in enumerate(tbl.rows):
        tr_pr = row._tr.get_or_add_trPr()
        if tr_pr.find(qn('w:cantSplit')) is None:
            tr_pr.append(OxmlElement('w:cantSplit'))
        if ri == 0 and tr_pr.find(qn('w:tblHeader')) is None:
            tr_pr.append(OxmlElement('w:tblHeader'))
        for ci, cell in enumerate(row.cells):
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            if ri == 0:
                set_cell_bottom_border(cell)
            for p in cell.paragraphs:
                p.paragraph_format.first_line_indent = Pt(0)
                p.paragraph_format.left_indent = Pt(0)
                p.paragraph_format.right_indent = Pt(0)
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.0
                if ri == 0:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                else:
                    align = aligns[ci] if ci < len(aligns) else 'left'
                    p.alignment = {
                        'center': WD_ALIGN_PARAGRAPH.CENTER,
                        'right': WD_ALIGN_PARAGRAPH.RIGHT,
                    }.get(align, WD_ALIGN_PARAGRAPH.LEFT)
                for run in p.runs:
                    run.font.name = 'Times New Roman'
                    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '宋体')
                    run.font.size = Pt(10.5)
                    if ri == 0:
                        run.bold = True

# ---------- 区段重建 ----------
def rebuild(start_text, end_text, new_elements, end_style='Heading 1'):
    start = find_para(start_text, 'Heading 1')
    end = find_para(end_text, end_style)
    children = list(body.iterchildren())
    si, ei = children.index(start._p), children.index(end._p)
    removed = 0
    for el in children[si + 1:ei]:
        if el.tag == qn('w:p'):
            xml = el.xml
            if 'w:sectPr' in xml or 'type="page"' in xml or 'fldChar' in xml:
                # Keep structural controls but clear stale template text carried by the paragraph.
                for text_node in list(el.iter(qn('w:t'))):
                    text_node.getparent().remove(text_node)
                continue
            body.remove(el)
            removed += 1
        elif el.tag == qn('w:tbl'):
            body.remove(el)
            removed += 1
    for el in new_elements:
        end._p.addprevious(el)
    return removed

# ---------- 块 -> 元素 ----------
def blocks_to_elements(blocks, h2='u2', h3='u3', h3_map=None):
    """h2/h3: md 二三级标题映射到的样式；h3_map: {标题文本: ('lead'|'u3', ...)} 覆盖。"""
    out = []
    for blk in blocks:
        kind = blk[0]
        if kind == 'h1':
            continue
        if kind in ('h2', 'h3', 'h4'):
            title = strip_num(blk[1])
            if h3_map and kind == 'h3' and title in h3_map:
                out.append(make_para(A_BODY, [(title + '　', True, False, False)]))
                continue
            anchor = A_H2 if (kind == 'h2' and h2 == 'u2') else A_H3 if kind == 'h3' else A_BODY
            if kind == 'h2' and h2 == 'u3':
                anchor = A_H3
            out.append(make_para(anchor, text_el(title)))
        elif kind == 'image':
            match = re.search(r'图\s*(\d+-\d+)', blk[1])
            if match:
                caption_parts = [part.strip() for part in blk[1].split('|', 1)]
                placeholder = '!图' + match.group(1)
                if len(caption_parts) == 2 and caption_parts[1]:
                    placeholder += '||' + caption_parts[1]
                out.append(make_para(A_BODY, text_el(placeholder)))
        elif kind == 'table_caption':
            caption = re.sub(r'^表\s*(\d+-\d+)\s*', r'表\1 ', blk[1]).strip()
            out.append(make_para(A_TABLE_TITLE, text_el(caption)))
        elif kind == 'table_caption_en':
            out.append(make_para(A_TABLE_TITLE, text_el(blk[1].strip())))
        elif kind in ('p', 'quote'):
            out.append(make_para(A_BODY, tokenize(blk[1])))
        elif kind == 'li':
            _, text, indent, ordered = blk
            prefix = '' if ordered else '• ' + '　' * indent
            out.append(make_para(A_BODY, tokenize(prefix + text)))
        elif kind == 'code':
            out.append(make_code_para(blk[1]))
        elif kind == 'table':
            rows = blk[1]
            aligns = blk[2]
            if not rows:
                continue
            ncol = max(len(r) for r in rows)
            tbl = d.add_table(rows=len(rows), cols=ncol)
            tbl.style = 'Table Grid'
            tbl.autofit = True
            for ri, row in enumerate(rows):
                for ci in range(ncol):
                    cell = tbl.rows[ri].cells[ci]
                    cell.text = ''
                    p = cell.paragraphs[0]
                    for seg, bold, italic, code in tokenize(row[ci] if ci < len(row) else ''):
                        run = p.add_run(seg)
                        run.bold = bold
                        run.italic = italic
                        if ri == 0:
                            run.bold = True
            format_table(tbl, aligns)
            body.remove(tbl._tbl)
            out.append(tbl._tbl)
    return out

PLACEHOLDER = make_para(A_BODY, text_el('（本节正文待导入）'))

# ---------- 章名迁移（2026-09-27 主线重构；幂等：旧标题不存在则跳过） ----------
# 旧第4章"wpw 系统设计与实现" -> 新第4章"wpw 系统需求分析"；
# 旧第5章"美食推荐系统设计与实现" -> 新第5章"wpw 系统设计与实现"；
# 旧第6章"实验设计与评估" -> 新第6章"系统测试与结果分析"。
chapter_renames = [
    ('wpw 系统设计与实现', 'wpw 系统需求分析'),
    ('美食推荐系统设计与实现', 'wpw 系统设计与实现'),
    ('实验设计与评估', '系统测试与结果分析'),
    # 历史遗留标题兜底
    ('面向上下文工程方法的 wpw 系统设计与实现', 'wpw 系统设计与实现'),
    ('上下文工程工具wpw的设计与实现', 'wpw 系统设计与实现'),
    ('相关技术', '相关技术与理论基础'),
    ('面向AI辅助开发的上下文工程方法', '面向 AI 辅助开发的上下文工程方法'),
]
already_current = (
    has_para('wpw 系统需求分析', 'Heading 1')
    and has_para('wpw 系统设计与实现', 'Heading 1')
)
if not already_current:
    for old, new in chapter_renames:
        hit = next((p for p in paras if p.style.name == 'Heading 1' and p.text.strip() == old), None)
        if hit is not None:
            hit.text = new

# ---------- 中英文摘要 ----------
abstract_source = open(MD0, encoding='utf-8').read().strip()
cn_source, en_source = re.split(r'^##\s+ABSTRACT\s*$', abstract_source, maxsplit=1, flags=re.M)
cn_abstract, cn_keywords = re.split(r'^关键词：', cn_source.strip(), maxsplit=1, flags=re.M)
en_abstract, en_keywords = re.split(r'^Key Words:\s*', en_source.strip(), maxsplit=1, flags=re.M)

def first_after(text, style, target_style):
    index = next(i for i, p in enumerate(paras) if p.text.strip() == text and p.style.name == style)
    return next(p for p in paras[index + 1:] if p.style.name == target_style)

cn_para = first_after('摘  要', 'u标题', 'u正文')
cn_para.text = cn_abstract.strip()
cn_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
en_para = first_after('ABSTRACT', 'u标题', 'u正文')
en_para.text = en_abstract.strip()
en_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

def set_keywords(p, label, value):
    for run in list(p.runs):
        run._r.getparent().remove(run._r)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.left_indent = Pt(0)
    p.paragraph_format.line_spacing = 1.3
    label_run = p.add_run(label)
    label_run.bold = True
    value_run = p.add_run(value)
    for run in (label_run, value_run):
        run.font.name = 'Times New Roman'
        run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '宋体')
        run.font.size = Pt(12)

set_keywords(next(p for p in paras if p.text.strip().startswith('关键词：')), '关键词：', cn_keywords.strip())
set_keywords(next(p for p in paras if p.text.strip().startswith('Key Words:')), 'Key Words: ', en_keywords.strip())
print('abstracts synchronized')

def set_header(header, text):
    p = header.paragraphs[0]
    for extra in header.paragraphs[1:]:
        header._element.remove(extra._p)
    for run in list(p.runs):
        run._r.getparent().remove(run._r)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run(text)
    run.font.name = 'Times New Roman'
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '宋体')
    run.font.size = Pt(10.5)

d.settings.odd_and_even_pages_header_footer = True
update_fields = d.settings.element.find(qn('w:updateFields'))
if update_fields is None:
    update_fields = OxmlElement('w:updateFields')
    d.settings.element.append(update_fields)
update_fields.set(qn('w:val'), 'true')
for section in d.sections[3:]:
    section.header.is_linked_to_previous = False
    section.even_page_header.is_linked_to_previous = False
    set_header(section.header, '北京科技大学硕士学位论文')
    set_header(section.even_page_header, '面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现')
print('running headers synchronized')

# ---------- 封面/题名页/数据集表题目同步（2026-09-27 新题目；幂等） ----------
CN_TITLE = '面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现'
EN_TITLE = ('Research and System Implementation of a Graph-Driven Context '
            'Engineering Method for AI-Assisted Software Development')
OLD_CN_T1 = '基于大模型的美食推荐系统设计与实现'
OLD_CN_T2 = '——面向AI辅助开发的上下文工程方法研究'
OLD_EN_T1 = 'Design and Implementation of a Large Language Model-Based Food Recommendation System'
OLD_EN_T2 = '——A Context Engineering Approach for AI-Assisted Software Development'

def sync_title_paras():
    done = 0
    for p in paras:
        t = p.text.strip()
        if t.startswith('论文题目：') and (OLD_CN_T1 in t or CN_TITLE in t):
            if t != '论文题目：' + CN_TITLE:
                set_text(p, '论文题目：' + CN_TITLE)
                done += 1
        elif t == OLD_CN_T2:
            set_text(p, '')
            done += 1
        elif t == OLD_CN_T1:
            set_text(p, CN_TITLE)
            done += 1
        elif t == OLD_EN_T1 or t == OLD_EN_T1 + ' ' + OLD_EN_T2:
            set_text(p, EN_TITLE)
            done += 1
        elif 'A Context Engineering Approach for AI-Assisted Software Development' in t:
            set_text(p, '')
            done += 1
    return done

def set_text(p, text):
    runs = p.runs
    rpr = copy.deepcopy(runs[0]._r.find(qn('w:rPr'))) if runs and runs[0]._r.find(qn('w:rPr')) is not None else None
    for r in list(runs):
        r._r.getparent().remove(r._r)
    run = p.add_run(text)
    if rpr is not None:
        run._r.insert(0, rpr)

print('title paragraphs synchronized:', sync_title_paras())

# 学位论文数据集表中的中英文题目
for tbl in d.tables:
    try:
        c0 = tbl.rows[1].cells[0].text
        if OLD_CN_T1 in c0 or CN_TITLE in c0:
            if CN_TITLE not in c0:
                tbl.rows[1].cells[0].text = CN_TITLE
                tbl.rows[1].cells[2].text = EN_TITLE
                print('dataset table title synchronized')
            break
    except IndexError:
        continue

def clear_paragraph_text(p):
    """Remove visible template text while preserving page/section/field controls."""
    for text_node in list(p._p.iter(qn('w:t'))):
        text_node.getparent().remove(text_node)

# ---------- 清除学校模板中的示例说明，保留可选清单页及其分节结构 ----------
front_start = next((i for i, p in enumerate(paras) if p.text.strip() == '插图和附表清单（如有）'), None)
front_end = next((i for i, p in enumerate(paras) if p.style.name == 'Heading 1' and p.text.strip() == '引言'), None)
cleared = 0
if front_start is not None and front_end is not None:
    for p in paras[front_start + 1:front_end]:
        if p.text.strip() == '符号清单（如有）':
            continue
        clear_paragraph_text(p)
        cleared += 1
print('front-matter template paragraphs cleared:', cleared)

# 清除后置模板示例；保留附录/致谢/作者简历标题、正式声明和数据集页结构。
back_cleared = 0
for p in paras:
    if p.text.strip().startswith('（附录内容待导入：'):
        clear_paragraph_text(p)
        back_cleared += 1
ack_start = next(i for i, p in enumerate(paras) if p.text.strip() == '致  谢')
bio_start = next(i for i, p in enumerate(paras) if p.text.strip() == '作者简历及在学研究成果')
declaration_start = next(i for i, p in enumerate(paras) if p.text.strip() == '独创性说明')
for p in paras[ack_start + 1:bio_start] + paras[bio_start + 1:declaration_start]:
    if p.text.strip():
        clear_paragraph_text(p)
        back_cleared += 1
print('back-matter template paragraphs cleared:', back_cleared)

# ---------- 第 1—7 章重建（2026-09-27 新结构；章标题已在上方迁移完毕） ----------
b1 = parse_md(MD1)
e1 = blocks_to_elements(b1)
print('ch1 elements:', len(e1), 'removed:', rebuild('引言', '相关技术与理论基础', e1))

b2 = parse_md(MD2)
e2 = blocks_to_elements(b2)
print('ch2 elements:', len(e2), 'removed:', rebuild('相关技术与理论基础', '面向 AI 辅助开发的上下文工程方法', e2))

b3 = parse_md(MD3)
e3 = blocks_to_elements(b3)
print('ch3 elements:', len(e3), 'removed:', rebuild('面向 AI 辅助开发的上下文工程方法', 'wpw 系统需求分析', e3))

b4 = parse_md(MD4)
e4 = blocks_to_elements(b4)
print('ch4 elements:', len(e4), 'removed:', rebuild('wpw 系统需求分析', 'wpw 系统设计与实现', e4))

b5 = parse_md(MD5)
e5 = blocks_to_elements(b5)
print('ch5 elements:', len(e5), 'removed:', rebuild('wpw 系统设计与实现', '系统测试与结果分析', e5))

d.save(DOCX)
print('saved.')
