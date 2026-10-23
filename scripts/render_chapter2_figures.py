# -*- coding: utf-8 -*-
"""Render the figures used by Chapter 2 as PNG and editable SVG files."""

from __future__ import annotations

import math
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "论文" / "图表" / "第2章"
FONT_PATH = Path(r"C:\Windows\Fonts\msyh.ttc")
BOLD_FONT_PATH = Path(r"C:\Windows\Fonts\msyhbd.ttc")
TEXT = "#27313a"
MUTED = "#5b6770"
LINE = "#59636c"
BORDER = "#aab4bb"
BLUE = "#315f8d"
BLUE_LIGHT = "#eef4f8"
GREEN = "#5f8178"
GREEN_LIGHT = "#f0f6f5"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = BOLD_FONT_PATH if bold else FONT_PATH
    return ImageFont.truetype(str(path), size)


def rgb(color: str) -> str:
    return color


class Figure:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.image = Image.new("RGB", (width, height), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.svg = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            "<defs>",
            '<marker id="arrow-gray" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#59636c"/></marker>',
            '<marker id="arrow-blue" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#315f8d"/></marker>',
            '<marker id="arrow-green" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#5f8178"/></marker>',
            '<marker id="arrow-red" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#a15e50"/></marker>',
            "</defs>",
            f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        ]

    def save(self, stem: str) -> None:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        self.image.save(OUT_DIR / f"{stem}.png", "PNG", optimize=True)
        self.svg.append("</svg>")
        (OUT_DIR / f"{stem}.svg").write_text("\n".join(self.svg), encoding="utf-8")

    def rounded_rect(
        self,
        box: tuple[float, float, float, float],
        fill: str = "#ffffff",
        outline: str = BORDER,
        width: int = 2,
        radius: int = 10,
        dashed: bool = False,
    ) -> None:
        x1, y1, x2, y2 = box
        self.draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
        dash = ' stroke-dasharray="12 9"' if dashed else ""
        self.svg.append(
            f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" rx="{radius}" fill="{fill}" stroke="{outline}" stroke-width="{width}"{dash}/>'
        )

    def rectangle(
        self,
        box: tuple[float, float, float, float],
        fill: str = "#ffffff",
        outline: str = BORDER,
        width: int = 2,
        dashed: bool = False,
    ) -> None:
        x1, y1, x2, y2 = box
        self.draw.rectangle(box, fill=fill, outline=outline, width=width)
        dash = ' stroke-dasharray="12 9"' if dashed else ""
        self.svg.append(
            f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" fill="{fill}" stroke="{outline}" stroke-width="{width}"{dash}/>'
        )

    def ellipse(
        self,
        box: tuple[float, float, float, float],
        fill: str = "#ffffff",
        outline: str = BORDER,
        width: int = 2,
        dashed: bool = False,
    ) -> None:
        x1, y1, x2, y2 = box
        self.draw.ellipse(box, fill=fill, outline=outline, width=width)
        dash = ' stroke-dasharray="10 8"' if dashed else ""
        self.svg.append(
            f'<ellipse cx="{(x1 + x2) / 2}" cy="{(y1 + y2) / 2}" rx="{(x2 - x1) / 2}" ry="{(y2 - y1) / 2}" fill="{fill}" stroke="{outline}" stroke-width="{width}"{dash}/>'
        )

    def circle(self, center: tuple[float, float], radius: float, fill: str, outline: str = "none", width: int = 0) -> None:
        x, y = center
        self.draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill, outline=outline if outline != "none" else None, width=width)
        stroke = f' stroke="{outline}" stroke-width="{width}"' if outline != "none" else ""
        self.svg.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}"{stroke}/>')

    def line(
        self,
        points: list[tuple[float, float]],
        color: str = LINE,
        width: int = 3,
        dashed: bool = False,
    ) -> None:
        if dashed:
            for start, end in zip(points, points[1:]):
                self._dashed_segment(start, end, color, width)
        else:
            self.draw.line(points, fill=color, width=width, joint="curve")
        pts = " ".join(f"{x},{y}" for x, y in points)
        dash = ' stroke-dasharray="10 8"' if dashed else ""
        self.svg.append(
            f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{dash}/>'
        )

    def _dashed_segment(self, start: tuple[float, float], end: tuple[float, float], color: str, width: int) -> None:
        x1, y1 = start
        x2, y2 = end
        distance = math.hypot(x2 - x1, y2 - y1)
        if distance == 0:
            return
        ux = (x2 - x1) / distance
        uy = (y2 - y1) / distance
        step = 18
        dash = 10
        position = 0.0
        while position < distance:
            length = min(dash, distance - position)
            a = (x1 + ux * position, y1 + uy * position)
            b = (x1 + ux * (position + length), y1 + uy * (position + length))
            self.draw.line((a, b), fill=color, width=width)
            position += step

    def arrow(
        self,
        points: list[tuple[float, float]],
        color: str = LINE,
        width: int = 3,
        marker: str = "gray",
        dashed: bool = False,
    ) -> None:
        self.line(points, color, width, dashed)
        x1, y1 = points[-2]
        x2, y2 = points[-1]
        angle = math.atan2(y2 - y1, x2 - x1)
        head = 15
        p1 = (x2 - head * math.cos(angle - 0.48), y2 - head * math.sin(angle - 0.48))
        p2 = (x2 - head * math.cos(angle + 0.48), y2 - head * math.sin(angle + 0.48))
        self.draw.polygon([(x2, y2), p1, p2], fill=color)
        pts = " ".join(f"{x},{y}" for x, y in points)
        dash = ' stroke-dasharray="10 8"' if dashed else ""
        self.svg.append(
            f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{dash} marker-end="url(#arrow-{marker})"/>'
        )

    def path(self, commands: str, color: str = LINE, width: int = 3, dashed: bool = False) -> None:
        dash = ' stroke-dasharray="10 8"' if dashed else ""
        self.svg.append(f'<path d="{commands}" fill="none" stroke="{color}" stroke-width="{width}"{dash}/>' )

    def text(
        self,
        x: float,
        y: float,
        value: str,
        size: int = 24,
        bold: bool = False,
        color: str = TEXT,
        anchor: str = "middle",
    ) -> None:
        face = font(size, bold)
        bounds = self.draw.textbbox((0, 0), value, font=face)
        text_width = bounds[2] - bounds[0]
        text_height = bounds[3] - bounds[1]
        if anchor == "middle":
            px = x - text_width / 2
        elif anchor == "end":
            px = x - text_width
        else:
            px = x
        py = y - text_height / 2 - bounds[1]
        self.draw.text((px, py), value, font=face, fill=color)
        weight = "font-weight:600;" if bold else ""
        self.svg.append(
            f'<text x="{x}" y="{y}" text-anchor="{anchor}" dominant-baseline="middle" style="font-family:Microsoft YaHei,Noto Sans CJK SC,SimSun,sans-serif;font-size:{size}px;{weight}fill:{color}">{escape(value)}</text>'
        )

    def text_lines(
        self,
        x: float,
        y: float,
        values: list[str],
        sizes: list[int] | int,
        colors: list[str] | None = None,
        leading: int = 34,
        first_bold: bool = False,
    ) -> None:
        if isinstance(sizes, int):
            sizes = [sizes] * len(values)
        colors = colors or [TEXT] * len(values)
        start = y - leading * (len(values) - 1) / 2
        for index, value in enumerate(values):
            self.text(x, start + leading * index, value, sizes[index], first_bold and index == 0, colors[index])


def card(
    fig: Figure,
    box: tuple[float, float, float, float],
    title: str,
    detail: str | None = None,
    fill: str = "#ffffff",
    outline: str = BORDER,
    title_color: str = TEXT,
    title_size: int = 25,
    detail_size: int = 18,
) -> None:
    x1, y1, x2, y2 = box
    fig.rounded_rect(box, fill=fill, outline=outline, width=2, radius=10)
    if detail:
        fig.text((x1 + x2) / 2, y1 + (y2 - y1) * 0.40, title, title_size, True, title_color)
        fig.text((x1 + x2) / 2, y1 + (y2 - y1) * 0.68, detail, detail_size, False, MUTED)
    else:
        fig.text((x1 + x2) / 2, (y1 + y2) / 2, title, title_size, True, title_color)


def render_fig21() -> None:
    fig = Figure(1800, 930)
    fig.rounded_rect((55, 70, 1745, 880), fill="#ffffff", outline="#8f9aa2", width=3, radius=18, dashed=True)
    fig.text(95, 108, "Agent Harness（智能体运行框架）", 33, True, MUTED, "start")
    fig.text(95, 148, "提供工具调用、状态维护与执行环境接口", 22, False, MUTED, "start")
    fig.line([(95, 178), (1705, 178)], color="#c3cbd0", width=2)

    card(fig, (115, 395, 355, 535), "任务目标", "Task Goal", BLUE_LIGHT, "#8ea9bf", BLUE, 30, 22)
    card(fig, (425, 395, 695, 535), "规划", "拆解步骤", "#ffffff", BORDER, TEXT, 30, 22)
    fig.ellipse((755, 330, 1045, 600), fill="#f1f5f8", outline=BLUE, width=4)
    fig.text(900, 425, "大语言模型", 34, True, BLUE)
    fig.text(900, 474, "LLM", 29, False, MUTED)
    fig.text(900, 522, "推理与下一步决策", 21, False, MUTED)
    card(fig, (1110, 285, 1365, 415), "工具调用", "文件编辑 / 命令执行", "#ffffff", BORDER, TEXT, 29, 20)
    card(fig, (1110, 555, 1365, 685), "观察结果", "读取执行反馈", "#ffffff", BORDER, TEXT, 29, 21)
    card(fig, (755, 710, 1045, 840), "调整", "根据结果修正计划", "#ffffff", BORDER, TEXT, 29, 20)

    fig.arrow([(355, 465), (425, 465)], width=3)
    fig.arrow([(695, 465), (755, 465)], width=3)
    fig.arrow([(1045, 465), (1075, 465), (1075, 350), (1110, 350)], width=3)
    fig.arrow([(1238, 415), (1238, 555)], width=3)
    fig.arrow([(1110, 620), (1080, 620), (1080, 775), (1045, 775)], width=3)
    fig.arrow([(755, 775), (720, 775), (720, 570), (560, 570), (560, 535)], width=3)

    fig.rounded_rect((1435, 255, 1685, 790), fill="#f8fafb", outline="#8f9aa2", width=2, radius=12)
    fig.text(1560, 302, "Harness 接口", 27, True, MUTED)
    fig.line([(1470, 340), (1650, 340)], color="#c3cbd0", width=2)
    card(fig, (1470, 380, 1650, 465), "文件编辑", None, "#ffffff", "#b6c1c7", TEXT, 24)
    card(fig, (1470, 505, 1650, 590), "命令执行", None, "#ffffff", "#b6c1c7", TEXT, 24)
    card(fig, (1470, 630, 1650, 715), "状态维护", None, "#ffffff", "#b6c1c7", TEXT, 24)
    fig.arrow([(1365, 350), (1435, 350), (1435, 422), (1470, 422)], color=BLUE, marker="blue", width=2)
    fig.arrow([(1650, 547), (1710, 547), (1710, 750), (1385, 750), (1385, 650), (1365, 650)], color=GREEN, marker="green", width=2)
    fig.save("图2-1-AI编程智能体的执行循环")


def render_fig22_context_chain() -> None:
    fig = Figure(1800, 700)

    stages = [
        (90, 150, 560, 560, "获取", "从仓库中找到候选内容", BLUE_LIGHT, "#7396b1", BLUE),
        (650, 150, 1120, 560, "组织", "把候选内容变成结构化输入", "#f5f7f8", "#9faab1", TEXT),
        (1210, 150, 1710, 560, "控制", "在窗口与预算内保留有效内容", "#f4f7f5", "#8da6a4", GREEN),
    ]
    for x1, y1, x2, y2, title, detail, fill, outline, color in stages:
        fig.rounded_rect((x1, y1, x2, y2), fill=fill, outline=outline, width=2, radius=14)
        fig.text((x1 + x2) / 2, y1 + 48, title, 30, True, color)
        fig.text((x1 + x2) / 2, y1 + 91, detail, 19, False, MUTED)
        fig.line([(x1 + 28, y1 + 125), (x2 - 28, y1 + 125)], color="#c4ccd1", width=2)

    card(fig, (125, 335, 300, 445), "任务描述", "自然语言需求", "#ffffff", "#9eb5c5", TEXT, 23, 17)
    card(fig, (345, 335, 525, 445), "候选召回", "向量 / 关键词 / 结构", "#ffffff", "#9eb5c5", TEXT, 23, 17)
    fig.arrow([(300, 390), (345, 390)], color=BLUE, marker="blue", width=3)
    fig.arrow([(525, 390), (650, 390)], color=BLUE, marker="blue", width=3)

    card(fig, (700, 335, 855, 445), "片段", "文档与代码", "#ffffff", "#b5bec4", TEXT, 22, 17)
    card(fig, (900, 335, 1055, 445), "关系", "实体与路径", "#ffffff", "#b5bec4", TEXT, 22, 17)
    fig.arrow([(855, 390), (900, 390)], width=3)
    fig.arrow([(1055, 390), (1120, 390)], width=3)

    card(fig, (1260, 260, 1430, 370), "筛选", "相关性与结构", "#ffffff", "#a8bab8", TEXT, 22, 17)
    card(fig, (1490, 260, 1660, 370), "压缩", "Token 预算", "#ffffff", "#a8bab8", TEXT, 22, 17)
    card(fig, (1260, 430, 1430, 540), "记忆", "跨任务复用", "#ffffff", "#a8bab8", TEXT, 22, 17)
    card(fig, (1490, 430, 1660, 540), "输出", "模型可用上下文", "#ffffff", "#a8bab8", GREEN, 22, 17)
    fig.arrow([(1120, 390), (1180, 390), (1180, 315), (1260, 315)], color=GREEN, marker="green", width=3)
    fig.arrow([(1430, 315), (1490, 315)], color=GREEN, marker="green", width=3)
    fig.arrow([(1430, 485), (1490, 485)], color=GREEN, marker="green", width=3)
    fig.arrow([(1575, 370), (1575, 430)], color=GREEN, marker="green", width=3)
    fig.save("图2-2-代码上下文的处理链条")


def render_fig23_rag_comparison() -> None:
    # 48 / 1800 = 2.67%: approximately 12 pt at a printed width of 16 cm.
    # Stack the two comparisons so each four-stage flow has the full width.
    # All text, including auxiliary labels, retains the same printed size.
    fig = Figure(1800, 880)
    size = 48
    columns = [(120, 450), (530, 860), (940, 1270), (1350, 1680)]
    flows = [
        (40, "RAG：基于片段的检索增强生成", BLUE, "#aab4bb", "#aab6bf", "blue", [
            ("文档", "原始语料"),
            ("文档切块", "平面片段"),
            ("向量检索", "相似度匹配"),
            ("生成", "答案"),
        ]),
        (465, "图结构检索：基于图结构的检索增强生成", GREEN, "#8da6a4", "#a8bab8", "green", [
            ("语料", "原始文档"),
            ("抽取实体关系", "建立知识图"),
            ("子图 / 社区", "层级摘要"),
            ("生成", "答案"),
        ]),
    ]
    for top, heading, color, panel_border, node_border, marker, stages in flows:
        fig.rounded_rect((55, top, 1745, top + 375), outline=panel_border, radius=14)
        fig.text(110, top + 65, heading, size, True, color, "start")
        fig.line([(110, top + 115), (1690, top + 115)], color="#c1ccd3", width=2)
        for (x1, x2), (title, detail) in zip(columns, stages):
            for label, bold in [(title, True), (detail, False)]:
                assert fig.draw.textlength(label, font=font(size, bold)) <= x2 - x1 - 40, label
            fig.rounded_rect((x1, top + 170, x2, top + 325), outline=node_border)
            fig.text((x1 + x2) / 2, top + 216, title, size, True, TEXT)
            fig.text((x1 + x2) / 2, top + 283, detail, size, False, MUTED)
        for previous, following in zip(columns, columns[1:]):
            fig.arrow([(previous[1], top + 247.5), (following[0], top + 247.5)],
                      width=3, marker=marker, color=color)
    fig.save("图2-3-RAG与图结构检索的检索方式对比")


def render_fig24_knowledge_graph() -> None:
    fig = Figure(1800, 960)

    cap = (100, 380, 365, 540)
    module = (485, 380, 755, 540)
    service = (870, 205, 1180, 325)
    component = (870, 600, 1180, 720)
    add = (1300, 205, 1680, 325)
    remove = (1300, 380, 1680, 500)
    list_fn = (1300, 600, 1680, 720)

    for box, title, detail, fill, outline, color in [
        (cap, "收藏管理", "能力节点 C", BLUE_LIGHT, "#7396b1", BLUE),
        (module, "收藏模块", "模块节点 L1", "#f4f6f7", "#9faab1", TEXT),
        (service, "favorite.service.ts", "文件节点 L2", "#ffffff", "#aab4bb", TEXT),
        (component, "favorite.vue", "文件节点 L2", "#ffffff", "#aab4bb", TEXT),
    ]:
        card(fig, box, title, detail, fill, outline, color, 27 if box == cap else 25, 20)

    def function_node(box: tuple[float, float, float, float], title: str, detail: str) -> None:
        x1, y1, x2, y2 = box
        fig.ellipse(box, fill="#ffffff", outline="#aab4bb", width=2)
        fig.text((x1 + x2) / 2, y1 + 45, title, 25, True, TEXT)
        fig.text((x1 + x2) / 2, y1 + 82, detail, 20, False, MUTED)

    function_node(add, "addFavorite()", "函数节点 L3")
    function_node(remove, "removeFavorite()", "函数节点 L3")
    function_node(list_fn, "FavoriteList()", "组件节点 L3")

    # Blue arrows denote business-to-code mappings.
    fig.arrow([(365, 460), (485, 460)], color=BLUE, marker="blue", width=3)
    fig.text(425, 414, "business_map / 实现", 19, True, BLUE)
    fig.arrow([(230, 380), (230, 135), (1490, 135), (1490, 205)], color=BLUE, marker="blue", width=3)
    fig.text(820, 104, "business_map / 实现", 20, True, BLUE)

    # Gray arrows denote hierarchical containment.
    fig.arrow([(755, 420), (810, 420), (810, 265), (870, 265)], width=3)
    fig.text(785, 350, "contain / 包含", 19, True, MUTED)
    fig.arrow([(755, 500), (810, 500), (810, 660), (870, 660)], width=3)
    fig.text(785, 565, "contain / 包含", 19, True, MUTED)
    fig.arrow([(1180, 265), (1300, 265)], width=3)
    fig.text(1240, 225, "contain", 19, True, MUTED)
    fig.arrow([(1180, 295), (1235, 295), (1235, 440), (1300, 440)], width=3)
    fig.text(1250, 350, "contain", 19, True, MUTED)
    fig.arrow([(1180, 660), (1300, 660)], width=3)
    fig.text(1240, 620, "contain", 19, True, MUTED)

    fig.rounded_rect((100, 770, 1700, 925), fill="#fafbfc", outline="#c0c8cd", width=2, radius=10)
    fig.text(145, 807, "图例", 22, True, TEXT, "start")
    fig.rounded_rect((250, 788, 350, 832), fill=BLUE_LIGHT, outline="#7396b1", width=2, radius=8)
    fig.text(370, 810, "能力", 20, False, TEXT, "start")
    fig.rounded_rect((470, 788, 570, 832), fill="#f4f6f7", outline="#9faab1", width=2, radius=8)
    fig.text(590, 810, "模块", 20, False, TEXT, "start")
    fig.rectangle((690, 788, 790, 832), fill="#ffffff", outline="#aab4bb", width=2)
    fig.text(810, 810, "文件", 20, False, TEXT, "start")
    fig.ellipse((900, 788, 1020, 832), fill="#ffffff", outline="#aab4bb", width=2)
    fig.text(1040, 810, "函数 / 组件", 20, False, TEXT, "start")
    fig.arrow([(250, 875), (370, 875)], color=BLUE, marker="blue", width=3)
    fig.text(395, 875, "business_map（业务映射 / 实现）", 20, False, TEXT, "start")
    fig.arrow([(960, 875), (1080, 875)], width=3)
    fig.text(1105, 875, "contain（包含 / 层级展开）", 20, False, TEXT, "start")
    fig.save("图2-4-软件项目知识图谱示例")


def render_fig25_embedding_space() -> None:
    fig = Figure(1500, 790)
    fig.text(750, 55, "二维投影空间（示意）", 29, True, TEXT)
    fig.line([(160, 730), (1340, 730)], color="#d0d6da", width=2)
    fig.line([(160, 730), (160, 145)], color="#d0d6da", width=2)
    fig.text(102, 430, "语义维度 2", 20, False, MUTED)
    fig.text(1270, 760, "语义维度 1", 20, False, MUTED)

    query = (545, 405)
    capability = (735, 445)
    order = (1160, 610)
    fig.line([query, capability], color=BLUE, width=3, dashed=True)
    fig.ellipse((465, 300, 815, 550), fill="#f5f8fa", outline="#b4c5d1", width=2, dashed=True)
    fig.circle(query, 13, BLUE)
    fig.circle(capability, 13, BLUE)
    fig.circle(order, 13, GREEN)
    fig.text(510, 335, "为用户增加收藏功能", 24, True, BLUE)
    fig.text(770, 490, "收藏管理", 24, True, BLUE)
    fig.text(1210, 570, "订单结算", 24, True, GREEN)
    fig.text(640, 385, "距离较小 / 语义相近", 20, False, BLUE)
    fig.text(1135, 675, "距离较大", 20, False, GREEN)
    fig.save("图2-5-嵌入向量空间中的语义邻近关系")


def main() -> None:
    # Canonical large-type layouts; Figure and approved Figure 2-3 remain here.
    from render_thesis_figures import fig21, fig22, fig24, fig25
    fig21()
    fig22()
    render_fig23_rag_comparison()
    fig24()
    fig25()
    print(f"Rendered Chapter 2 figures to {OUT_DIR}")


if __name__ == "__main__":
    main()
