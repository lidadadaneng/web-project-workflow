# -*- coding: utf-8 -*-
"""Render the updated Figure 1-2 as PNG and editable SVG."""

from pathlib import Path
from xml.sax.saxutils import escape
import math

from PIL import Image, ImageDraw, ImageFont


W, H = 1800, 1300
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "论文" / "图表" / "第1章"
PNG_OUT = OUT_DIR / "图1-2-核心研究内容.png"
SVG_OUT = OUT_DIR / "图1-2-核心研究内容.svg"
FONT = r"C:\Windows\Fonts\msyh.ttc"
BOLD = r"C:\Windows\Fonts\msyhbd.ttc"

img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1300" viewBox="0 0 1800 1300">',
    '<defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#59636c"/></marker></defs>',
    '<style>.cn{font-family:"Microsoft YaHei","Noto Sans CJK SC","SimSun",sans-serif;fill:#27313a}.stage{font-weight:600}</style>',
    '<rect width="1800" height="1300" fill="#fff"/>',
]


def f(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def rect(box, fill="#fff", outline="#aab6bf", width=2, radius=10, dashed=False):
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    dash = ' stroke-dasharray="10 8"' if dashed else ""
    svg.append(f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" rx="{radius}" fill="{fill}" stroke="{outline}" stroke-width="{width}"{dash}/>')


def text(x, y, value, size=24, bold=False, color="#27313a", anchor="middle"):
    face = f(size, bold)
    b = d.textbbox((0, 0), value, font=face)
    width = b[2] - b[0]
    px = x - width / 2 if anchor == "middle" else (x - width if anchor == "end" else x)
    d.text((px, y - (b[3] - b[1]) / 2), value, font=face, fill=color)
    weight = 'font-weight:600;' if bold else ''
    svg.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" dominant-baseline="middle" class="cn" style="font-size:{size}px;{weight}fill:{color}">{escape(value)}</text>')


def lines(cx, cy, values, sizes, colors=None, leading=36, first_bold=True):
    colors = colors or ["#27313a"] * len(values)
    top = cy - leading * (len(values) - 1) / 2
    for i, value in enumerate(values):
        text(cx, top + leading * i, value, sizes[i], bold=first_bold and i == 0, color=colors[i])


def arrow(points, color="#59636c", width=3):
    d.line(points, fill=color, width=width, joint="curve")
    pts = " ".join(f"{x},{y}" for x, y in points)
    svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" marker-end="url(#arrow)"/>')
    x1, y1 = points[-2]
    x2, y2 = points[-1]
    angle = math.atan2(y2 - y1, x2 - x1)
    head = 14
    p1 = (x2 - head * math.cos(angle - .48), y2 - head * math.sin(angle - .48))
    p2 = (x2 - head * math.cos(angle + .48), y2 - head * math.sin(angle + .48))
    d.polygon([(x2, y2), p1, p2], fill=color)


# 1. Method area: the absolute visual focus of the figure.
rect((40, 28, 1760, 790), fill="#fff", outline="#8f9aa2", width=2, radius=14, dashed=True)
text(72, 68, "上下文工程方法（第3章）", 34, True, "#4d5963", anchor="start")

# Workflow constraint sub-band.
rect((72, 94, 1728, 212), fill="#fff", outline="#aab4bb", width=2, radius=10, dashed=True)
text(96, 119, "六阶段流程约束架构", 27, True, "#4d5963", anchor="start")
stages = ["BRD", "PRD", "Design", "Plan", "Test", "Apply"]
sx, sy, sw, sh, gap = 360, 137, 180, 52, 18
for i, stage in enumerate(stages):
    x1 = sx + i * (sw + gap)
    rect((x1, sy, x1 + sw, sy + sh), fill="#f7f9fa", outline="#aab6bf", width=2, radius=7)
    text(x1 + sw / 2, sy + sh / 2, stage, 28, True, "#27313a")
    if i < len(stages) - 1:
        arrow([(x1 + sw + 5, sy + sh / 2), (x1 + sw + gap - 5, sy + sh / 2)], width=2)

# Main method chain.
boxes = {
    "input": (72, 300, 250, 535),
    "model": (278, 285, 555, 550),
    "graph": (590, 270, 910, 565),
    "context": (945, 285, 1240, 550),
    "task": (1275, 300, 1460, 535),
    "agent": (1495, 300, 1728, 535),
}
for key, box in boxes.items():
    if key == "graph":
        rect(box, fill="#f1f5f8", outline="#315f8d", width=4, radius=12)
    else:
        rect(box, fill="#fff", outline="#aab6bf", width=2, radius=10)

lines(161, 415, ["输入", "能力规范 Spec", "项目源码 · Git 历史"], [32, 23, 20], leading=42)
lines(416, 412, ["① 能力—代码双层", "知识组织模型", "Spec＋四类证据合成关联边"], [23, 23, 18], leading=34)
lines(750, 405, ["项目知识图谱", "C 业务能力层", "L1 · L2 · L3 代码结构层"], [38, 29, 25], ["#244e79"] * 3, leading=48)
lines(1092, 412, ["② 图谱驱动的任务", "上下文生成", "入口扩展子图 · Token 预算分档"], [23, 23, 18], leading=34)
lines(1367, 415, ["任务上下文", "受 Token 预算约束"], [32, 23], leading=47)
lines(1612, 415, ["AI 编程智能体", "完成开发任务"], [31, 23], leading=47)

for a, b in [((255, 418), (273, 418)), ((560, 418), (583, 418)), ((915, 418), (938, 418)), ((1245, 418), (1268, 418)), ((1465, 418), (1488, 418))]:
    arrow([a, b])

# Flow constraint -> agent (the only arrow crossing the workflow sub-band boundary).
arrow([(1612, 212), (1612, 287), (1612, 295)])

# Archive/evolution return lane inside the method area.
rect((72, 580, 1728, 770), fill="#fbfcfd", outline="#c1c8cd", width=2, radius=10, dashed=True)
text(96, 605, "需求归档与知识演化回流", 27, True, "#4d5963", anchor="start")
rect((945, 635, 1255, 748), fill="#fff", outline="#aab6bf", width=2, radius=9)
rect((1495, 635, 1728, 748), fill="#fff", outline="#aab6bf", width=2, radius=9)
lines(1100, 691, ["③ Spec 增量知识演化", "冷启动 · 新需求只更新受影响关联"], [25, 18], leading=38)
lines(1612, 691, ["需求归档", "过程知识沉淀"], [29, 22], leading=42)

# Method-area return arrows.
arrow([(1612, 540), (1612, 625)])
arrow([(1485, 691), (1265, 691)])
arrow([(945, 691), (875, 691), (875, 575)])

# 2. Implementation and validation areas.
rect((40, 835, 1760, 1015), fill="#fff", outline="#8f9aa2", width=2, radius=14)
text(72, 870, "④ wpw 系统实现（第4章）", 31, True, "#4d5963", anchor="start")
rect((72, 895, 1728, 982), fill="#f7f9fa", outline="#c0c8ce", width=2, radius=8)
lines(900, 938, ["AI 层 · CLI 层 · 文件系统层", "工作流 · 图谱构建 · 上下文生成 · 增量维护"], [27, 21], leading=36)

rect((40, 1050, 1760, 1240), fill="#fff", outline="#8f9aa2", width=2, radius=14)
text(72, 1085, "方法验证（第5、6章）", 31, True, "#4d5963", anchor="start")
rect((72, 1110, 1728, 1207), fill="#f7f9fa", outline="#c0c8ce", width=2, radius=8)
lines(900, 1158, ["美食推荐系统开发为载体", "T1–T3 任务比较 · 100 检索任务 · 100 项目问答 · 组件消融"], [28, 22], leading=38)

# Cross-zone interfaces: implementation -> method, implementation -> validation.
arrow([(430, 895), (430, 805), (430, 660), (590, 660), (590, 575)])
arrow([(900, 1018), (900, 1042)])

svg.append("</svg>")
OUT_DIR.mkdir(parents=True, exist_ok=True)
img.save(PNG_OUT, "PNG", optimize=True)
SVG_OUT.write_text("\n".join(svg), encoding="utf-8")
print(PNG_OUT)
print(SVG_OUT)
