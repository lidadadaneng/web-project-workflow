from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont


W, H = 1800, 990
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "论文" / "图表" / "第1章"
PNG_OUT = OUT_DIR / "图1-1-现有研究覆盖范围与本文定位.png"
SVG_OUT = OUT_DIR / "图1-1-现有研究覆盖范围与本文定位.svg"

REG = r"C:\Windows\Fonts\msyh.ttc"
BOLD = r"C:\Windows\Fonts\msyhbd.ttc"


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REG, size)


img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)


def center(text, xy, size, fill="#27313a", bold=False):
    f = font(size, bold)
    box = d.textbbox((0, 0), text, font=f)
    d.text((xy[0] - (box[2] - box[0]) / 2, xy[1] - (box[3] - box[1]) / 2), text, font=f, fill=fill)


def arrow(points, fill="#59636c", width=4, head=14):
    d.line(points, fill=fill, width=width, joint="curve")
    x1, y1 = points[-2]
    x2, y2 = points[-1]
    angle = math.atan2(y2 - y1, x2 - x1)
    p1 = (x2 - head * math.cos(angle - 0.48), y2 - head * math.sin(angle - 0.48))
    p2 = (x2 - head * math.cos(angle + 0.48), y2 - head * math.sin(angle + 0.48))
    d.polygon([(x2, y2), p1, p2], fill=fill)


def panel(box, fill, outline, title):
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=18, fill=fill, outline=outline, width=3)
    center(title, ((x1 + x2) // 2, y1 + 55), 32, bold=True)
    d.line((x1 + 42, y1 + 92, x2 - 42, y1 + 92), fill=outline, width=2)


def card(box, title, text, outline):
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=10, fill="white", outline=outline, width=2)
    cx = (x1 + x2) // 2
    center(title, (cx, y1 + 48), 31, bold=True)
    center(text, (cx, y1 + 105), 27)


# Research landscape. The figure caption supplies the title, so the canvas starts with content.
panel((70, 70, 655, 620), "#f1f5f8", "#91a0ad", "需求侧（规格与追踪）")
panel((1145, 70, 1730, 620), "#f0f6f5", "#8da6a4", "代码侧（图谱与检索）")
card((112, 190, 613, 350), "规格制品", "保存需求规格，约束开发流程", "#aab6bf")
card((112, 390, 613, 550), "追踪链接", "建立需求与代码的对应关系", "#aab6bf")
card((1187, 190, 1688, 350), "代码图谱", "描述代码结构和仓库关系", "#a8bab8")
card((1187, 390, 1688, 550), "检索片段", "按相似度汇集任务相关上下文", "#a8bab8")

# The missing semantic bridge between requirements and implementation.
d.rounded_rectangle((718, 175, 1082, 550), radius=16, fill="white", outline="#8d959b", width=3)
for x in range(734, 1067, 22):
    d.line((x, 175, min(x + 11, 1067), 175), fill="#8d959b", width=3)
    d.line((x, 550, min(x + 11, 1067), 550), fill="#8d959b", width=3)
for y in range(194, 533, 22):
    d.line((718, y, 718, min(y + 11, 533)), fill="#8d959b", width=3)
    d.line((1082, y, 1082, min(y + 11, 533)), fill="#8d959b", width=3)
center("业务能力层缺失", (900, 255), 31, bold=True)
d.line((775, 290, 1025, 290), fill="#c0c5c8", width=2)
center("需求语义与代码结构", (900, 350), 28)
center("缺少稳定的连接", (900, 390), 28)
center("知识难以持续复用", (900, 465), 27, fill="#59636c")

arrow([(613, 565), (700, 565), (724, 580), (780, 660)], width=4)
arrow([(1187, 565), (1100, 565), (1076, 580), (1020, 660)], width=4)

# Proposed method: one Chinese heading and the durable knowledge chain.
d.rounded_rectangle((110, 670, 1690, 940), radius=18, fill="#eaf2fb", outline="#315f8d", width=4)
center("本文方法：以业务能力连接需求与代码", (900, 725), 35, fill="#244e79", bold=True)
d.line((156, 770, 1644, 770), fill="#9bb6d1", width=2)

chain = [
    (165, 820, 390, 895, "需求规格"),
    (470, 820, 720, 895, "业务能力"),
    (800, 820, 1030, 895, "代码结构"),
    (1110, 820, 1335, 895, "演化记录"),
    (1415, 820, 1635, 895, "任务上下文"),
]
for x1, y1, x2, y2, label in chain:
    d.rounded_rectangle((x1, y1, x2, y2), radius=9, fill="white", outline="#6d95ba", width=2)
    center(label, ((x1 + x2) // 2, (y1 + y2) // 2), 29, fill="#244e79", bold=True)

for start, end in [((397, 857), (455, 857)), ((727, 857), (785, 857)), ((1037, 857), (1095, 857)), ((1342, 857), (1400, 857))]:
    arrow([start, end], fill="#315f8d", width=4, head=13)

OUT_DIR.mkdir(parents=True, exist_ok=True)
img.save(PNG_OUT, "PNG", optimize=True)


def svg_text(text, x, y, size, weight="400", fill=None):
    attrs = f'class="cn" font-size="{size}px" font-weight="{weight}"'
    if fill:
        attrs += f' fill="{fill}"'
    return f'<text x="{x}" y="{y}" text-anchor="middle" {attrs}>{text}</text>'


svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="990" viewBox="0 0 1800 990">',
    '<defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#315f8d"/></marker><style>.cn{font-family:"Microsoft YaHei","Noto Sans CJK SC","SimSun",sans-serif;fill:#27313a}</style></defs>',
    '<rect width="1800" height="990" fill="#ffffff"/>',
    '<rect x="70" y="70" width="585" height="550" rx="18" fill="#f1f5f8" stroke="#91a0ad" stroke-width="3"/>',
    '<rect x="1145" y="70" width="585" height="550" rx="18" fill="#f0f6f5" stroke="#8da6a4" stroke-width="3"/>',
    svg_text("需求侧（规格与追踪）", 362, 136, 32, weight="600"),
    svg_text("代码侧（图谱与检索）", 1437, 136, 32, weight="600"),
    '<line x1="112" y1="162" x2="613" y2="162" stroke="#91a0ad" stroke-width="2"/><line x1="1187" y1="162" x2="1688" y2="162" stroke="#8da6a4" stroke-width="2"/>',
]
for x, title, body, stroke in [(112, "规格制品", "保存需求规格，约束开发流程", "#aab6bf"), (112, "追踪链接", "建立需求与代码的对应关系", "#aab6bf"), (1187, "代码图谱", "描述代码结构和仓库关系", "#a8bab8"), (1187, "检索片段", "按相似度汇集任务相关上下文", "#a8bab8")]:
    y = 190 if title in ("规格制品", "代码图谱") else 390
    cx = 362 if x == 112 else 1437
    svg += [f'<rect x="{x}" y="{y}" width="501" height="160" rx="10" fill="#ffffff" stroke="{stroke}" stroke-width="2"/>', svg_text(title, cx, y + 58, 31, weight="600"), svg_text(body, cx, y + 116, 27)]
svg += [
    '<rect x="718" y="175" width="364" height="375" rx="16" fill="#ffffff" stroke="#8d959b" stroke-width="3" stroke-dasharray="11 9"/>',
    svg_text("业务能力层缺失", 900, 266, 31, weight="600"),
    '<line x1="775" y1="290" x2="1025" y2="290" stroke="#c0c5c8" stroke-width="2"/>',
    svg_text("需求语义与代码结构", 900, 360, 28), svg_text("缺少稳定的连接", 900, 400, 28), svg_text("知识难以持续复用", 900, 475, 27, fill="#59636c"),
    '<path d="M613 565 C700 565,724 580,780 660" fill="none" stroke="#59636c" stroke-width="4" marker-end="url(#arrow)"/><path d="M1187 565 C1100 565,1076 580,1020 660" fill="none" stroke="#59636c" stroke-width="4" marker-end="url(#arrow)"/>',
    '<rect x="110" y="670" width="1580" height="270" rx="18" fill="#eaf2fb" stroke="#315f8d" stroke-width="4"/>',
    svg_text("本文方法：以业务能力连接需求与代码", 900, 737, 35, weight="600", fill="#244e79"),
    '<line x1="156" y1="770" x2="1644" y2="770" stroke="#9bb6d1" stroke-width="2"/>',
]
for x1, y1, x2, y2, label in chain:
    svg += [f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" rx="9" fill="#ffffff" stroke="#6d95ba" stroke-width="2"/>', svg_text(label, (x1 + x2) // 2, 866, 29, weight="600", fill="#244e79")]
for x1, x2 in [(397, 455), (727, 785), (1037, 1095), (1342, 1400)]:
    svg.append(f'<line x1="{x1}" y1="857" x2="{x2}" y2="857" stroke="#315f8d" stroke-width="4" marker-end="url(#arrow)"/>')
svg.append('</svg>')
SVG_OUT.write_text("\n".join(svg), encoding="utf-8")
print(PNG_OUT)
print(SVG_OUT)
