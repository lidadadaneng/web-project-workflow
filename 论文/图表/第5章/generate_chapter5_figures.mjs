import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Run: node 论文/图表/第5章/generate_chapter5_figures.mjs [basename ...]
const outDir = path.dirname(fileURLToPath(import.meta.url));
const ink = '#303840', gray = '#737d86', accent = '#f1f5f8';
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const figures = [];
let f;
function begin(base, w, h, description) {
  f = { base, w, h, description, shapes: [], svg: [] };
  f.svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(description)}</title><defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L11,6 L0,12 Z" fill="${ink}"/></marker><marker id="erArrow" markerWidth="20" markerHeight="20" refX="18" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L18,10 L0,20 Z" fill="${ink}"/></marker><marker id="open" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11" fill="none" stroke="${ink}" stroke-width="2"/></marker><style>text{font-family:'Microsoft YaHei',sans-serif;fill:${ink};font-weight:400} .label{paint-order:stroke;stroke:#fff;stroke-width:9px;stroke-linejoin:round}</style></defs><rect width="${w}" height="${h}" fill="#fff"/>`);
}
function end() { f.svg.push('</svg>'); figures.push(f); }
function rect(x,y,w,h,{fill='#fff',dashed=false,stroke=ink}={}) {
  f.shapes.push({kind:'rect',x,y,w,h,fill,dashed,stroke});
  f.svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"${dashed?' stroke-dasharray="10 7"':''}/>`);
}
function text(x,y,content,size=32,{anchor='middle',width,white=false,weight=400}={}) {
  const lines=(Array.isArray(content)?content:[content]).flatMap(s=>String(s).split('\\n')), line=size*1.3;
  const textWidth = width ?? Math.max(...lines.map(s=>Array.from(s).reduce((n,c)=>n+(/[\x00-\x7f]/.test(c)?0.59:1),0)))*size+26;
  f.shapes.push({kind:'text',x,y,lines,size,anchor,w:textWidth,h:lines.length*line+8,white});
  const start=y-(lines.length-1)*line/2;
  lines.forEach((s,i)=>f.svg.push(`<text x="${x}" y="${start+i*line}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="central"${white?' class="label"':''}>${esc(s)}</text>`));
}
function box(x,y,w,h,lines,size=34,opts={}) { rect(x,y,w,h,opts); text(x+w/2,y+h/2,lines,size,{width:w-30}); }
function moduleBox(x,y,w,h,title,{titleSize=35,fill='#fff'}={}) {
  rect(x,y,w,h,{fill});
  text(x+w/2,y+h/2,title,titleSize,{width:w-30,weight:600});
}
function route(points,{arrow=true,dashed=false,open=false,startArrow=false,stroke=ink}={}) {
  f.shapes.push({kind:'path',points,arrow,dashed,open,startArrow,stroke});
  f.svg.push(`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="2"${dashed?' stroke-dasharray="9 6"':''}${arrow?` marker-end="url(#${open?'open':'arrow'})"`:''}${startArrow?' marker-start="url(#arrow)"':''}/>`);
}
function arrow(x1,y1,x2,y2,opts={}) { route([[x1,y1],[x2,y2]],opts); }
function frame(x,y,w,h,title,size=28) {
  rect(x,y,w,h,{fill:'none',dashed:true,stroke:gray});
  // The title has its own white band, avoiding a label on the dashed border.
  text(x+26,y+27,title,size,{anchor:'start',white:true,weight:600});
}

// Figure 5-1: a clean layered architecture with bidirectional contracts between layers.
begin('图5-1-wpw系统总体架构',1900,1200,'wpw 分层系统架构与层间数据流');
frame(45,30,1810,210,'应用层',34);
moduleBox(105,105,500,110,'AI 编程智能体',{titleSize:40});
moduleBox(700,105,500,110,'可视化控制台',{titleSize:40});
moduleBox(1295,105,500,110,'开发者',{titleSize:40});

frame(45,345,1810,210,'服务层',34);
moduleBox(75,420,320,110,'工作流服务',{titleSize:35});
moduleBox(435,420,320,110,'知识图谱服务',{titleSize:35,fill:accent});
moduleBox(795,420,320,110,'上下文服务',{titleSize:35,fill:accent});
moduleBox(1155,420,320,110,'知识演化服务',{titleSize:35});
moduleBox(1515,420,320,110,'数据访问服务',{titleSize:35});

frame(45,660,1810,205,'知识与过程数据层',34);
moduleBox(110,730,360,105,'过程制品',{titleSize:35});
moduleBox(545,730,360,105,'能力规范',{titleSize:35});
moduleBox(980,730,360,105,'图谱与向量索引',{titleSize:35});
moduleBox(1415,730,360,105,'归档与配置',{titleSize:35});

frame(45,970,1810,170,'基础设施层',34);
moduleBox(180,1030,360,82,'项目源码',{titleSize:33});
moduleBox(620,1030,360,82,'Git 历史',{titleSize:33});
moduleBox(1060,1030,360,82,'解析与向量服务',{titleSize:33});
moduleBox(1500,1030,280,82,'本地运行环境',{titleSize:30});

// The central arrows emphasize contracts, while the aligned boxes show ownership.
route([[950,240],[950,345]],{startArrow:true});
text(1120,292.5,['阶段操作','上下文与状态返回'],36,{weight:500});
route([[950,555],[950,660]],{startArrow:true});
text(1120,607.5,['状态与知识数据','本地文件读写'],36,{weight:500});
route([[950,865],[950,970]],{startArrow:true});
text(1120,917.5,['源码与 Git','构建图谱与索引'],36,{weight:500});
end();

// Figure 5-2: module/function hierarchy, without workflow arrows or call semantics.
begin('图5-2-系统功能图',1910,1090,'wpw 系统及五个模块的功能分解');
box(730,35,450,105,'wpw 系统',43,{fill:accent});
route([[955,140],[955,212]],{arrow:false});
route([[225,212],[1705,212]],{arrow:false});
const functionsByModule=[
  ['工作流管理',[
    '需求创建与初始化','阶段门禁与\n依赖检查','阶段制品模板下发',
    '阶段状态更新与恢复','任务实施与进度同步','归档与工作区迁移'
  ]],
  ['图谱构建',[
    '能力规范解析','源码结构解析','业务映射合成','图谱本地存储','向量索引构建'
  ]],
  ['上下文生成',[
    '锚点检索与选择','子图扩展与裁剪','骨架抽取与序列化','Token 预算控制\n与分档压缩'
  ]],
  ['增量维护',[
    '文件哈希差异识别','变更局部重建','能力规范增量更新',
    '归档驱动的\n能力沉淀','版本兼容检查\n与全量回退'
  ]],
  ['可视化控制台',[
    '工作流看板与\n阶段操作','图谱可视化与统计','上下文生成演示',
    '知识库与归档浏览','Token 统计与\n模型对话'
  ]]
];
functionsByModule.forEach(([module,items],index)=>{
  const x=55+370*index, middle=x+170, spine=x+5;
  route([[middle,212],[middle,255]],{arrow:false});
  box(x+20,255,300,96,module,36,{fill:accent});
  route([[x+20,303],[spine,303],[spine,400+110*(items.length-1)+47]],{arrow:false});
  items.forEach((item,i)=>{
    const y=400+i*110;
    route([[spine,y+47],[x+20,y+47]],{arrow:false});
    box(x+20,y,300,94,item.split('\n'),31);
  });
});
end();

// Figure 5-3: Chen-notation logical ER diagram. A portrait-oriented,
// central vertical spine keeps the requirement and capability in the middle.
begin('图5-3-系统逻辑ER图',2100,2570,'wpw 系统逻辑实体关系图');

function chenLine(points,{stroke=ink,width=3}={}) {
  f.shapes.push({kind:'path',points,arrow:false,stroke});
  f.svg.push(`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
}
function chenEntity(x,y,w,h,title) {
  rect(x,y,w,h,{fill:'#f8fafc',stroke:ink});
  text(x+w/2,y+h/2,title,46,{width:w-28,weight:600});
}
function ellipseBoundary(cx,cy,rx,ry,target) {
  const dx=target[0]-cx,dy=target[1]-cy;
  const scale=1/Math.sqrt((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry));
  return [cx+dx*scale,cy+dy*scale];
}
function diamondBoundary(cx,cy,w,h,target) {
  const dx=target[0]-cx,dy=target[1]-cy;
  const scale=1/(Math.abs(dx)/(w/2)+Math.abs(dy)/(h/2));
  return [cx+dx*scale,cy+dy*scale];
}
function chenAttribute(cx,cy,rx,ry,label,target) {
  if(target) chenLine([ellipseBoundary(cx,cy,rx,ry,target),target]);
  f.svg.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${ink}" stroke-width="3"/>`);
  text(cx,cy,label,36,{width:rx*2-20});
}
function chenDiamond(cx,cy,w,h,label) {
  const pts=[[cx,cy-h/2],[cx+w/2,cy],[cx,cy+h/2],[cx-w/2,cy]];
  f.svg.push(`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="#fff" stroke="${ink}" stroke-width="3"/>`);
  text(cx,cy,label,34,{width:w-30,weight:600});
}
function chenCard(x,y,label) { text(x,y,label,34,{white:true,weight:700}); }
function chenRelation(a,b,diamond,label,cardA,cardB,{offsetA=[0,-18],offsetB=[0,-18]}={}) {
  const [cx,cy,w=190,h=110]=diamond;
  const edgeA=diamondBoundary(cx,cy,w,h,a),edgeB=diamondBoundary(cx,cy,w,h,b);
  chenLine([a,edgeA]);
  chenLine([edgeB,b]);
  chenCard(a[0]+(edgeA[0]-a[0])*0.32+offsetA[0],a[1]+(edgeA[1]-a[1])*0.32+offsetA[1],cardA);
  chenCard(b[0]+(edgeB[0]-b[0])*0.32+offsetB[0],b[1]+(edgeB[1]-b[1])*0.32+offsetB[1],cardB);
  chenDiamond(cx,cy,w,h,label);
}

// Requirements, capability specifications and nodes share the central axis.
// Process entities flank the requirement; graph entities occupy the lower half.
chenEntity(190,330,340,110,'阶段制品');
chenEntity(1570,330,340,110,'计划任务');
chenEntity(190,860,340,110,'归档记录');
chenEntity(1530,860,420,110,'Token 消耗');
chenEntity(870,480,360,110,'需求实例');
chenEntity(850,1190,400,110,'能力规范');
chenEntity(870,1770,360,110,'图谱节点');
chenEntity(200,1730,360,110,'图谱元数据');
chenEntity(1450,2210,400,110,'图谱边');

chenRelation([530,385],[870,535],[700,460],'包含','n','1');
chenRelation([1570,385],[1230,535],[1400,460],'包含','n','1');
chenRelation([930,590],[530,915],[700,760],'归档','1','1');
chenRelation([1170,590],[1530,915],[1400,760],'记录','1','n');
chenRelation([1050,590],[1050,1190],[1050,960],'沉淀','n','m',{offsetA:[40,0],offsetB:[40,0]});
chenRelation([1050,1300],[1050,1770],[1050,1535],'生成','1','1',{offsetA:[40,0],offsetB:[40,0]});
chenRelation([560,1785],[870,1825],[705,1785],'构建','1','n');
chenRelation([940,1880],[1495,2210],[1190,2040,230,120],'起点引用','1','n');
chenRelation([1230,1825],[1740,2210],[1660,2010,230,120],'终点引用','1','n');

// The second build relationship travels around the graph area rather than
// crossing node attributes or the two endpoint-reference relationships.
chenLine([[380,1840],[380,2300],[705,2300]]);
chenLine([[895,2300],[1450,2265]]);
chenDiamond(800,2300,190,110,'构建');
chenCard(420,1910,'1');
chenCard(1380,2245,'n');

// Attribute bubbles sit in dedicated bands, with room between every ellipse.
chenAttribute(210,130,120,44,'changeId',[270,330]);
chenAttribute(480,130,100,44,'phase',[450,330]);
chenAttribute(1600,130,105,44,'taskId',[1650,330]);
chenAttribute(1870,130,100,44,'状态',[1840,330]);

chenAttribute(910,260,120,44,'changeId',[950,480]);
chenAttribute(1190,260,100,44,'状态',[1150,480]);

chenAttribute(200,1080,120,44,'archiveId',[270,970]);
chenAttribute(490,1080,120,44,'归档时间',[450,970]);
chenAttribute(1590,1080,135,44,'输入 Token',[1630,970]);
chenAttribute(1900,1080,135,44,'输出 Token',[1850,970]);

chenAttribute(570,1245,145,44,'capabilityId',[850,1245]);
chenAttribute(1530,1245,125,44,'Purpose',[1250,1245]);
chenAttribute(1460,1420,150,44,'Requirements',[1210,1300]);

chenAttribute(210,1520,110,44,'buildId',[290,1730]);
chenAttribute(490,1520,100,44,'版本',[470,1730]);
chenAttribute(1450,1670,110,44,'nodeId',[1230,1800]);
chenAttribute(720,1990,100,44,'名称',[920,1880]);

chenAttribute(1370,2470,100,44,'type',[1500,2320]);
chenAttribute(1660,2470,100,44,'权重',[1650,2320]);
chenAttribute(1950,2470,125,44,'证据来源',[1800,2320]);
end();

function diamond(cx,cy,w,h,label,size=31) {
  const pts=[[cx,cy-h/2],[cx+w/2,cy],[cx,cy+h/2],[cx-w/2,cy]];
  f.svg.push(`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="#fff" stroke="${ink}" stroke-width="2"/>`);
  text(cx,cy,label,size,{width:w-35,weight:600});
}
function circle(cx,cy,r,label,{fill='#fff',stroke=ink,size=30,double=false,dashed=false,weight=500}={}) {
  f.svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${double?4:2}"${dashed?' stroke-dasharray="8 6"':''}/>`);
  if(double) f.svg.push(`<circle cx="${cx}" cy="${cy}" r="${r-9}" fill="none" stroke="${stroke}" stroke-width="2"/>`);
  text(cx,cy,label,size,{width:r*1.6,weight});
}
function nodeArrow(x1,y1,r1,x2,y2,r2,opts={}) {
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  arrow(x1+ux*r1,y1+uy*r1,x2-ux*(r2+7),y2-uy*(r2+7),opts);
}

// Figure 5-4: workflow engine services and their persistent artifacts.
begin('图5-4-工作流引擎实现架构',1800,1060,'工作流引擎由统一命令入口调度规则、状态、模板任务和上下文服务');
box(610,35,580,95,'阶段命令与 AI 编排',40,{fill:accent});
arrow(900,130,900,230);
frame(55,230,1690,590,'工作流引擎',36);
box(625,290,550,90,'统一命令入口',38,{fill:accent});
route([[900,380],[900,415],[250,415],[250,465]],{arrow:false});
route([[900,415],[900,465]]);route([[900,415],[1550,415],[1550,465]]);
box(90,465,320,115,['Schema 注册表','阶段与依赖规则'],34);
box(740,465,320,115,['依赖检查','门禁与警告'],34);
box(1390,465,320,115,['状态服务','完成 · 跳过 · 拍板'],32);
route([[900,415],[545,415],[545,645]]);route([[900,415],[1255,415],[1255,645]]);
box(350,645,390,115,['模板与任务服务','模板定位 · Plan 解析'],32);
box(1060,645,390,115,['上下文适配','锚点 · 参数 · 告警'],32);
frame(55,860,1690,155,'持久化制品',34);
box(140,915,420,70,'阶段文档与 Plan 任务',31);
box(690,915,420,70,'图谱上下文',31);
box(1240,915,420,70,'状态快照  .wpw.yaml',31);
arrow(545,760,350,915);
route([[1255,760],[1255,835],[900,835],[900,915]]);
route([[1550,580],[1550,835],[1450,835],[1450,915]]);
end();

// Figure 5-5: three-stage artifact flow. Side branches are kept outside the main line.
begin('图5-5-阶段制品生成与确认流程',2100,780,'阶段制品依次经过准备、生成和收尾三个阶段');
frame(30,35,630,680,'准备',38);frame(735,35,630,680,'生成',38);frame(1440,35,630,680,'收尾',38);
box(70,285,215,105,'检查依赖',34);
diamond(390,338,165,120,'可继续？',29);
box(490,285,140,105,['模板与','前序制品'],30);
arrow(285,338,307,338);arrow(473,338,490,338);text(480,303,'是',28,{white:true});
box(245,535,290,95,'提示缺失前置',32);
arrow(390,398,390,535);text(425,465,'否',28);
box(775,285,220,105,'生成草稿',34);
diamond(1090,338,165,120,'确认？',30);
box(1190,285,145,105,'确认制品',31);
arrow(995,338,1007,338);arrow(1173,338,1190,338);text(1182,303,'是',28,{white:true});
route([[1090,398],[1090,535],[885,535],[885,390]],{arrow:true});text(985,568,'修改意见',29);
box(1475,285,170,105,'保存文档',33);
box(1690,285,170,105,'更新状态',33);
box(1905,285,130,105,'返回结果',31);
arrow(1645,338,1690,338);arrow(1860,338,1905,338);
route([[630,338],[775,338]]);route([[1335,338],[1475,338]]);
text(390,670,'CLI 负责确定性检查',29);text(1050,670,'AI 生成 · 开发者确认',29);text(1755,670,'保存后才记录完成',29);
end();

// Sequence diagrams reserve a separate row for every label; message lines sit below text.
function sequence(base,names,description,build,{gap=470,msgSize=31}={}) {
  const width=(names.length-1)*gap+360;
  begin(base,width,100,description);
  const xs=names.map((_,i)=>180+i*gap), body=[];
  let y=180;
  const seq={
    msg(a,b,label,{ret=false,step=76,size=msgSize}={}) {
      const lineY=y+27;
      if(a===b) {
        text(xs[a]+115,y,label,size,{anchor:'start'});
        route([[xs[a],lineY],[xs[a]+90,lineY],[xs[a]+90,lineY+34],[xs[a],lineY+34]],{open:true});
        y+=step+24;
      } else {
        const labelX=(xs[a]+xs[b])/2+(Math.abs(a-b)>1?gap*0.50:0);
        text(labelX,y,label,size);
        arrow(xs[a],lineY,xs[b],lineY,{dashed:ret,open:ret});
        y+=step;
      }
    },
    alt(branches) {
      const top=y-16,old=f.svg.length,oldShapes=f.shapes.length;
      branches.forEach(([condition,fn],i)=>{
        if(i) { arrow(30,y+5,width-30,y+5,{arrow:false,dashed:true,stroke:gray});y+=52; }
        text(135,y+12,`[${condition}]`,29,{anchor:'start',weight:600});
        y+=52;fn(seq);
      });
      const elements=f.svg.splice(old),shapes=f.shapes.splice(oldShapes);
      rect(30,top,width-60,y-top+5,{fill:'none',stroke:gray});
      box(30,top,76,42,'alt',28);
      f.svg.push(...elements);f.shapes.push(...shapes);y+=38;
    },
    loop(condition,fn) {
      const top=y-16,old=f.svg.length,oldShapes=f.shapes.length;
      text(145,y+12,`[${condition}]`,29,{anchor:'start',weight:600});y+=52;fn(seq);
      const elements=f.svg.splice(old),shapes=f.shapes.splice(oldShapes);
      rect(30,top,width-60,y-top+5,{fill:'none',stroke:gray});box(30,top,92,42,'loop',28);
      f.svg.push(...elements);f.shapes.push(...shapes);y+=38;
    }
  };
  build(seq);
  const h=y+25;
  body.push(...f.svg.splice(1));const oldShapes=f.shapes.splice(0);
  xs.forEach(x=>arrow(x,135,x,h-30,{arrow:false,dashed:true,stroke:gray}));
  f.svg.push(...body);f.shapes.push(...oldShapes);
  names.forEach((name,i)=>box(xs[i]-160,25,320,110,name,35));
  f.h=h;f.svg[0]=f.svg[0].replace(`height="100" viewBox="0 0 ${width} 100"`,`height="${h}" viewBox="0 0 ${width} ${h}"`).replace('height="100" fill="#fff"',`height="${h}" fill="#fff"`);
  end();
}

sequence('图5-6-阶段制品生成与确认时序图',['开发者','AI 编程智能体','CLI',['文件系统','工作区与状态']],
  '依赖检查通过后生成并确认阶段制品，最后由 CLI 更新状态',s=>{
    s.msg(0,1,'提出阶段目标');s.msg(1,2,'检查阶段门禁');s.msg(2,3,'读取状态与前序制品');s.msg(3,2,'返回阶段输入',{ret:true});
    s.alt([
      ['依赖未满足',s=>s.msg(2,1,'返回缺失前置',{ret:true})],
      ['依赖满足',s=>{
        s.msg(2,1,'返回模板、输入与警告',{ret:true});
        s.loop('草稿尚未确认',s=>{s.msg(1,0,'提交草稿');s.msg(0,1,'确认或提出修改')});
        s.msg(1,3,'保存确认后的文档');s.msg(1,2,'标记阶段完成');s.msg(2,3,'原子更新状态');s.msg(2,1,'返回新状态',{ret:true});
      }]
    ]);
  });

// Figure 5-7: the main DAG and its two optional branches.
begin('图5-7-DAG驱动的阶段门禁',1900,860,'强依赖构成工作流主链，可选阶段提供探索与测试输入');
text(950,55,'强依赖主链',38,{weight:600});
const dagNodes=[['BRD',70],['PRD',410],['Design',790],['Plan',1170],['Apply',1550]];
dagNodes.forEach(([name,x])=>box(x,205,280,105,name,38,{fill:name==='Apply'?accent:'#fff'}));
for(let i=0;i<dagNodes.length-1;i++) arrow(dagNodes[i][1]+280,257,dagNodes[i+1][1],257);
box(500,505,280,105,['Explore','可跳过'],35);
diamond(930,558,190,125,'已拍板？',30);
box(1220,505,280,105,['Test','可跳过'],35);
arrow(550,310,600,505);arrow(780,558,835,558);
route([[930,495],[930,400],[930,310]],{dashed:true,open:true});text(1015,410,'可选输入',29);
arrow(1070,310,1280,505);arrow(1310,310,1360,505);
route([[1500,558],[1690,558],[1690,310]],{dashed:true,open:true});text(1590,525,'测试输入',29);
box(165,705,360,80,'实线：强依赖',30);
box(770,705,360,80,'虚线：可选输入',30);
box(1375,705,360,80,'缺失时告警但不阻塞',30);
end();

// Figure 5-8: a concrete L3 node instance, kept separate from the field definition tables.
begin('图5-8-L3节点JSON实例',1900,970,'Java 服务方法对应的 L3 节点 JSON 实例');
rect(55,35,1790,900,{fill:'#f8fafc'});
const l3JsonExample = [
  '{',
  '  "id": "elem:a17c9e2d4f80",',
  '  "level": "L3",',
  '  "type": "function",',
  '  "name": "OrderService.createOrder",',
  '  "attrs": {',
  '    "filePath": "src/main/java/com/example/order/OrderService.java",',
  '    "signature": "OrderResult createOrder(CreateOrderRequest request)",',
  '    "params": [{ "name": "request", "type": "CreateOrderRequest" }],',
  '    "returnType": "OrderResult",',
  '    "parentName": "OrderService",',
  '    "annotations": ["@Transactional"],',
  '    "lineStart": 42,',
  '    "lineEnd": 67',
  '  },',
  '  "createdAt": 1787483793182,',
  '  "updatedAt": 1787483793182',
  '}'
];
l3JsonExample.forEach((line,index)=>f.svg.push(`<text x="100" y="${82+index*48}" font-family="'Consolas','Courier New',monospace" font-size="36" xml:space="preserve">${esc(line)}</text>`));
end();

// Figure 5-9: actual graph nodes, with the retained subgraph visibly enclosed.
begin('图5-9-加权双向BFS子图扩展示意',1900,1080,'从多个锚点沿入边和出边扩展，并裁除低权重或超深度节点');
f.svg.push(`<ellipse cx="950" cy="535" rx="680" ry="390" fill="#f8fafc" stroke="${ink}" stroke-width="3" stroke-dasharray="12 8"/>`);
text(950,105,'裁剪后保留的任务子图',40,{weight:600});
const edges=[
  [500,350,760,300],[760,300,980,410],[980,410,1250,300],[1250,300,1450,405],
  [500,350,600,590],[600,590,890,650],[890,650,1120,600],[1120,600,1370,690],
  [980,410,1120,600],[760,300,890,650],[1450,405,1370,690]
];
edges.forEach(e=>nodeArrow(e[0],e[1],e[0]===980||e[0]===1120?82:72,e[2],e[3],e[2]===980||e[2]===1120?82:72,{open:true}));
circle(500,350,68,'上游');circle(760,300,72,'L2');circle(980,410,82,'锚点 A',{double:true,fill:accent,size:31,weight:600});
  circle(1250,300,72,'L3');circle(1450,405,68,'下游');circle(600,590,72,'L1');circle(890,650,72,'L2');
circle(1120,600,82,'锚点 B',{double:true,fill:accent,size:31,weight:600});circle(1370,690,72,'L3');
// Excluded nodes remain visible outside the boundary, explaining why they are pruned.
  nodeArrow(500,350,68,90,535,55,{dashed:true,open:true,stroke:gray});circle(90,535,55,'X',{stroke:gray,size:30});
text(155,620,['边权低于阈值','不再扩展'],28,{width:250});
  nodeArrow(1450,405,68,1800,210,55,{dashed:true,open:true,stroke:gray});circle(1800,210,55,'X',{stroke:gray,size:30});
text(1690,110,['超过最大深度','予以裁除'],28,{width:300});
text(950,990,['双向扩展：同时访问入边与出边','合并规则：到最近锚点的距离'],31,{weight:500});
end();

sequence('图5-10-任务上下文生成时序图',[
  ['调用方','AI / 控制台'],['上下文流水线','CLI context'],'向量索引','图谱存储'],
  '锚点经双向扩展、相关性裁剪和预算压缩后形成任务上下文',s=>{
    s.msg(0,1,'提交任务与 Token 预算');
    s.alt([
      ['自然语言任务',s=>{s.msg(1,2,'检索候选锚点');s.msg(2,1,'返回锚点与得分',{ret:true})}],
      ['已指定锚点',s=>s.msg(1,1,'采用给定锚点')]
    ]);
    s.msg(1,3,'读取入边与出边邻域');s.msg(3,1,'返回候选子图',{ret:true});
    s.msg(1,1,'评分裁剪并抽取骨架');
    s.loop('结果超过预算',s=>s.msg(1,1,'收紧规模、深度和阈值'));
    s.alt([
      ['满足预算',s=>s.msg(1,0,'返回结构化上下文',{ret:true})],
      ['最小结果仍超预算',s=>s.msg(1,0,'返回预算不足提示',{ret:true})]
    ]);
  });

sequence('图5-11-归档与能力沉淀时序图',['开发者','AI 编程智能体','CLI',['知识存储','工作区与图谱']],
  '人工确认能力沉淀后归档工作区，并更新项目知识图谱',s=>{
    s.msg(0,1,'确认需求已交付');s.msg(1,3,'读取已确认制品');s.msg(3,1,'返回 PRD、设计与实施记录',{ret:true});
    s.msg(1,1,'合并或新建能力规范');s.msg(1,0,'提交沉淀结果');s.msg(0,1,'确认沉淀内容');
    s.msg(1,2,'执行归档命令');s.msg(2,3,'迁移工作区并检查图谱');
    s.alt([
      ['历史图谱兼容',s=>s.msg(2,3,'增量更新节点、边与映射')],
      ['图谱缺失或不兼容',s=>s.msg(2,3,'执行全量构建')]
    ]);
    s.msg(3,2,'返回知识更新结果',{ret:true});s.msg(2,1,'返回归档摘要',{ret:true});s.msg(1,0,'报告归档位置与结果');
  });

// Figure 5-12: a compact vertical architecture sized for a thesis page.
begin('图5-12-可视化控制台模块架构',1800,1240,'控制台通过统一数据访问层切换同构 mock 与本地数据服务');
frame(40,30,1720,220,'页面层',36);
[['过程\n总览 · 看板 · 归档',80],['知识\n图谱 · 统计 · 知识库',500],['洞察\n上下文 · Token',920],['交互\n对话 · API 配置',1340]].forEach(([v,x])=>box(x,95,380,115,v.split('\n'),31));
arrow(900,250,900,315);
frame(40,315,1720,190,'组件层',36);
[['图谱画布',80],['阶段 DAG',500],['阶段操作抽屉',920],['文档渲染',1340]].forEach(([v,x])=>box(x,380,380,85,v,32));
arrow(900,505,900,570);
frame(40,570,1720,150,'状态层 · Pinia',36);
box(270,625,500,65,'工作流状态',32);box(1030,625,500,65,'对话状态',32);
arrow(900,720,900,785);
box(255,785,1290,105,['统一数据访问层  fetcher','数据结构与 CLI JSON 输出一致'],35,{fill:accent});
route([[650,890],[650,1010]]);route([[1150,890],[1150,1010]]);
frame(40,1010,1720,190,'数据源',36);
box(185,1070,560,85,'同构 mock 数据',33);
box(1055,1070,560,85,'本地数据服务  /api',33);
arrow(745,1113,1055,1113,{startArrow:true,open:true});text(900,1070,'契约一致',29);
end();

sequence('图5-16-工作流看板阶段操作时序图',['开发者',['工作流看板','阶段操作抽屉'],['数据访问层','fetcher'],['数据源','mock / 本地服务']],
  '看板加载同构数据，复用阶段门禁并通过当前数据源持久化状态',s=>{
    s.msg(0,1,'打开工作流看板');s.msg(1,2,'请求需求列表与详情');s.msg(2,3,'按配置读取 mock 或 API');s.msg(3,1,'返回需求状态',{ret:true});
    s.msg(0,1,'点击阶段节点');s.msg(1,1,'按 Schema 判定门禁');
    s.alt([
      ['门禁未通过',s=>s.msg(1,0,'提示缺失前置',{ret:true})],
      ['门禁通过',s=>{s.msg(0,1,'提交阶段操作');s.msg(1,2,'提交状态变更');s.msg(2,3,'浏览器保存或 CLI 原子更新');s.msg(3,2,'返回新状态',{ret:true});s.msg(2,1,'返回更新结果',{ret:true});s.msg(1,1,'记录快照并刷新 DAG');s.msg(1,0,'展示新状态',{ret:true})}]
    ]);
  });

const args=process.argv.slice(2);
const chosen=new Set(args);
const selected=figures.filter(v=>!chosen.size||chosen.has(v.base));
for(const fig of selected) {
  const markup=fig.svg.join('\n');
  await fs.writeFile(path.join(outDir,fig.base+'.svg'),markup,'utf8');
  // 2x PNG retains sharp text and lines when inserted at thesis column width.
  await sharp(Buffer.from(markup)).resize(fig.w*2,fig.h*2).png().toFile(path.join(outDir,fig.base+'.png'));
  console.log(`${fig.base}: ${fig.w} x ${fig.h} (PNG 2x)`);
}
