from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1800, 1060
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
REG = r"C:\Windows\Fonts\msyh.ttc"
BOLD = r"C:\Windows\Fonts\msyhbd.ttc"

def f(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REG, size)

def center(text, xy, font, fill="#27313a"):
    b = d.textbbox((0, 0), text, font=font)
    d.text((xy[0]-(b[2]-b[0])/2, xy[1]-(b[3]-b[1])/2), text, font=font, fill=fill)

def arrow(points, fill="#59636c", width=4, head=14):
    d.line(points, fill=fill, width=width, joint="curve")
    x1,y1 = points[-2]; x2,y2 = points[-1]
    a = math.atan2(y2-y1, x2-x1)
    p1 = (x2-head*math.cos(a-.48), y2-head*math.sin(a-.48))
    p2 = (x2-head*math.cos(a+.48), y2-head*math.sin(a+.48))
    d.polygon([(x2,y2), p1, p2], fill=fill)

center("现有研究覆盖范围与本文定位", (900,47), f(32,True))
center("Coverage of Existing Research and the Position of This Thesis", (900,80), f(19), "#52616d")
d.rounded_rectangle((70,145,655,725), radius=18, fill="#f1f5f8", outline="#91a0ad", width=3)
d.rounded_rectangle((1145,145,1730,725), radius=18, fill="#f0f6f5", outline="#8da6a4", width=3)
center("需求侧（规格与追踪）", (362,185), f(28,True))
center("代码侧（图谱与检索）", (1437,185), f(28,True))
d.line((112,222,613,222), fill="#b8c2ca", width=2)
d.line((1187,222,1688,222), fill="#b4c7c4", width=2)

def card(x1,y1,x2,y2,title,en,line1,line2,outline):
    d.rounded_rectangle((x1,y1,x2,y2), radius=10, fill="white", outline=outline, width=2)
    cx=(x1+x2)//2
    center(title,(cx,y1+42),f(27,True))
    center(en,(cx,y1+80),f(22),"#52616d")
    center(line1,(cx,y1+124),f(22))
    center(line2,(cx,y1+157),f(18),"#5c6973")

card(112,258,613,442,"规格制品","Spec Kit · OpenSpec · Superpowers","保存“要做什么”，约束开发流程","规范、变更与执行阶段可检查","#aab6bf")
card(112,484,613,668,"追踪链接","TRIAD · 信息检索 · 需求追踪","恢复需求—代码之间的对应关系","多用于一次性分析或链接恢复","#aab6bf")
card(1187,258,1688,442,"代码图谱","KGCompass · RIG · Athale","描述代码结构与仓库制品关系","文件、类、函数、Issue 与依赖","#a8bab8")
card(1187,484,1688,668,"检索片段","RAG · RepoHyper · CodeSearch","按相似度汇集任务相关上下文","任务之间不直接传递项目认识","#a8bab8")

# Dashed center diagnosis panel
d.rounded_rectangle((718,250,1082,617), radius=16, fill="white", outline="#8d959b", width=3)
for x in range(734,1067,22):
    d.line((x,250,min(x+11,1067),250), fill="#8d959b", width=3)
    d.line((x,617,min(x+11,1067),617), fill="#8d959b", width=3)
for y in range(269,600,22):
    d.line((718,y,718,min(y+11,600)), fill="#8d959b", width=3)
    d.line((1082,y,1082,min(y+11,600)), fill="#8d959b", width=3)
center("业务能力层缺失", (900,337), f(27,True))
d.line((775,365,1025,365), fill="#c0c5c8", width=2)
center("需求语义与代码结构", (900,414), f(22))
center("缺少稳定的挂靠点", (900,451), f(22))
center("演化联系断裂", (900,516), f(22), "#6a737a")
center("后续任务需要重新搜索和理解", (900,552), f(18), "#6a737a")
arrow([(613,692),(700,692),(724,700),(780,744)], width=3)
arrow([(1187,692),(1100,692),(1076,700),(1020,744)], width=3)

# Proposed method panel
d.rounded_rectangle((110,760,1690,1000), radius=18, fill="#eaf2fb", outline="#315f8d", width=4)
center("本文方法：Capability 层 + 持续维护的知识链", (900,805), f(28,True), "#244e79")
center("Spec-driven Capability–Code knowledge model with incremental evolution", (900,838), f(19), "#52616d")
d.line((156,866,1644,866), fill="#9bb6d1", width=2)
chain=[(165,900,373,958,"Spec 需求规格"),(465,900,715,958,"Capability 业务能力"),(807,900,992,958,"Code 代码结构"),(1084,900,1274,958,"Evolution 演化"),(1366,900,1626,958,"Context 任务上下文")]
for x1,y1,x2,y2,label in chain:
    d.rounded_rectangle((x1,y1,x2,y2), radius=9, fill="white", outline="#6d95ba", width=2)
    center(label,((x1+x2)//2,(y1+y2)//2),f(24,True),"#244e79")
for a,b in [((380,929),(450,929)),((722,929),(792,929)),((999,929),(1069,929)),((1280,929),(1351,929))]:
    arrow([a,b], fill="#315f8d", width=3, head=12)
center("以业务能力为语义锚点，连接需求、代码、项目演化与任务级上下文", (900,975), f(18), "#4d6984")

out=r"F:\project\web-project-workflow\论文\图表\第1章\图1-1-现有研究覆盖范围与本文定位.png"
img.save(out,"PNG",optimize=True)
print(out)
