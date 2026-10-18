# -*- coding: utf-8 -*-
"""Render Figure 1-2 as a reproducible PNG and editable SVG."""
from pathlib import Path
from xml.sax.saxutils import escape
import math
from PIL import Image, ImageDraw, ImageFont
W,H=1800,1460
ROOT=Path(__file__).resolve().parents[1]
OUT_DIR=ROOT/'论文'/'图表'/'第1章'
PNG_OUT=OUT_DIR/'图1-2-核心研究内容.png'; SVG_OUT=OUT_DIR/'图1-2-核心研究内容.svg'
FONT=r'C:\Windows\Fonts\msyh.ttc'; BOLD=r'C:\Windows\Fonts\msyhbd.ttc'
TEXT='#27313a'; MUTED='#4d5963'; LINE='#59636c'; BORDER='#aab6bf'
img=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(img)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">','<defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L12,6 L0,12 Z" fill="#59636c"/></marker></defs>','<style>.cn{font-family:"Microsoft YaHei","Noto Sans CJK SC","SimSun",sans-serif;fill:#27313a}</style>',f'<rect width="{W}" height="{H}" fill="#fff"/>']
def f(size,bold=False): return ImageFont.truetype(BOLD if bold else FONT,size)
def rect(box,fill='#fff',outline=BORDER,width=2,radius=10,dashed=False):
 x1,y1,x2,y2=box; d.rounded_rectangle(box,radius=radius,fill=fill,outline=outline,width=width); dash=' stroke-dasharray="10 8"' if dashed else ''; svg.append(f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" rx="{radius}" fill="{fill}" stroke="{outline}" stroke-width="{width}"{dash}/>')
def text(x,y,value,size=24,bold=False,color=TEXT,anchor='middle'):
 face=f(size,bold); raster_anchor={'middle':'mm','start':'lm','end':'rm'}[anchor]; d.text((x,y),value,font=face,fill=color,anchor=raster_anchor); weight='font-weight:600;' if bold else ''; svg.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" dominant-baseline="middle" class="cn" style="font-size:{size}px;{weight}fill:{color}">{escape(value)}</text>')
def lines(cx,cy,values,sizes,colors=None,leading=36,first_bold=True,bold_rows=None):
 colors=colors or [TEXT]*len(values); top=cy-leading*(len(values)-1)/2
 for i,value in enumerate(values): text(cx,top+leading*i,value,sizes[i],bold=(i in bold_rows if bold_rows is not None else first_bold and i==0),color=colors[i])
def arrow(points,color=LINE,width=3):
 d.line(points,fill=color,width=width,joint='curve'); pts=' '.join(f'{x},{y}' for x,y in points); svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" marker-end="url(#arrow)"/>'); x1,y1=points[-2]; x2,y2=points[-1]; angle=math.atan2(y2-y1,x2-x1); head=14; p1=(x2-head*math.cos(angle-.48),y2-head*math.sin(angle-.48)); p2=(x2-head*math.cos(angle+.48),y2-head*math.sin(angle+.48)); d.polygon([(x2,y2),p1,p2],fill=color)
rect((40,28,1760,870),outline='#8f9aa2',radius=14); text(72,68,'上下文工程方法（第3章）',40,True,MUTED,'start')
rect((72,106,1728,268),outline='#aab4bb',radius=10); text(96,135,'六阶段流程约束架构',34,True,MUTED,'start')
stages=['BRD','PRD','Design','Plan','Test','Apply']; sx,sy,sw,sh,gap=84,170,242,76,36
for i,stage in enumerate(stages):
 x1=sx+i*(sw+gap); rect((x1,sy,x1+sw,sy+sh),fill='#f7f9fa',radius=7); text(x1+sw/2,sy+sh/2,stage,42,True)
 if i<len(stages)-1: arrow([(x1+sw+5,sy+sh/2),(x1+sw+gap-7,sy+sh/2)],width=3)
boxes=[(72,330,310,595),(350,330,650,595),(690,310,1030,615),(1070,330,1430,595),(1470,330,1728,595)]
for i,box in enumerate(boxes): rect(box,fill='#f1f5f8' if i==2 else '#fff',outline='#315f8d' if i==2 else BORDER,width=4 if i==2 else 2,radius=12 if i==2 else 10)
lines(191,462,['输入','能力规范 Spec','项目源码'],[40,32,34],leading=58)
lines(500,462,['能力—代码','双层知识组织模型'],[34,34],leading=54,bold_rows=(0,1))
lines(860,462,['项目知识图谱','C 业务能力层','L1–L3 代码结构层'],[40,34,32],['#244e79']*3,leading=58)
lines(1250,440,['图谱驱动的','任务上下文生成'],[36,36],leading=54,bold_rows=(0,1))
text(1250,527,'Token 预算约束',32)
lines(1599,462,['AI 编程智能体','完成开发任务'],[34,32],leading=58)
for left,right in zip(boxes,boxes[1:]): arrow([(left[2]+5,462),(right[0]-8,462)])
arrow([(1599,268),(1599,320)])
rect((72,650,1728,850),fill='#fbfcfd',outline='#c1c8cd',radius=10)
text(96,681,'需求归档与知识演化回流',34,True,MUTED,'start')
rect((1030,716,1430,828)); rect((1470,716,1728,828))
lines(1230,772,['Spec 增量知识演化','更新受影响关联'],[32,32],leading=48)
lines(1599,772,['需求归档','过程知识沉淀'],[36,32],leading=48)
arrow([(1599,600),(1599,706)])
arrow([(1462,772),(1438,772)])
arrow([(1028,772),(860,772),(860,625)])
rect((40,910,1760,1110),outline='#8f9aa2',radius=14)
text(72,950,'wpw 系统（第4章需求分析／第5章设计与实现）',36,True,MUTED,'start')
rect((72,984,1728,1086),fill='#f7f9fa',outline='#c0c8ce',radius=8)
lines(900,1035,['AI 层 · CLI 层 · 文件系统层','工作流 · 图谱构建 · 上下文生成 · 增量维护'],[36,32],leading=46)
rect((40,1160,1760,1420),outline='#8f9aa2',radius=14)
text(72,1200,'系统测试与结果分析（第6章）',36,True,MUTED,'start')
rect((72,1234,1728,1396),fill='#f7f9fa',outline='#c0c8ce',radius=8)
lines(900,1315,['以美食推荐系统为统一实验载体','T1–T4 任务与 OpenSpec 对照 · 100 检索任务 · 100 项目问答','非 KG／WPW-Map／完整 wpw 三条件对比'],[36,32,32],leading=48)
arrow([(900,1110),(900,1150)])
svg.append('</svg>'); OUT_DIR.mkdir(parents=True,exist_ok=True); img.save(PNG_OUT,'PNG',optimize=True); SVG_OUT.write_text('\n'.join(svg),encoding='utf-8'); print(PNG_OUT); print(SVG_OUT)

