import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outDir = path.resolve('论文/图表/第3章');
const font = 'Microsoft YaHei, Noto Sans CJK SC, SimSun, sans-serif';
const C = {
  ink: '#27313a', muted: '#59636c', border: '#aab4bb', frame: '#8f9aa2',
  blue: '#315f8d', blueFill: '#eef4f8', green: '#5f8178', greenFill: '#eef5f2',
  red: '#a15e50', redFill: '#fbf0ee', paper: '#ffffff', soft: '#f7f9fa',
};

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const lines = (x, y, values, opts = {}) => {
  const { size = 24, fill = C.ink, weight = 400, anchor = 'middle', gap = 1.35, cls = '' } = opts;
  return values.map((v, i) => `<text x="${x}" y="${y + i * size * gap}" text-anchor="${anchor}" dominant-baseline="middle" class="${cls}" style="font-size:${size}px;font-weight:${weight};fill:${fill}">${esc(v)}</text>`).join('');
};
const rect = (x, y, w, h, opts = {}) => {
  const { fill = C.paper, stroke = C.border, sw = 2, r = 10, dash = '' } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
};
const ellipse = (cx, cy, rx, ry, opts = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${opts.fill || C.paper}" stroke="${opts.stroke || C.border}" stroke-width="${opts.sw || 2}"/>`;
const line = (x1, y1, x2, y2, opts = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${opts.stroke || C.muted}" stroke-width="${opts.sw || 3}"${opts.dash ? ` stroke-dasharray="${opts.dash}"` : ''} ${opts.marker === false ? '' : `marker-end="url(#${opts.marker || 'arrow'})"`}/>`;
const pathEl = (d, opts = {}) => `<path d="${d}" fill="none" stroke="${opts.stroke || C.muted}" stroke-width="${opts.sw || 3}" stroke-linejoin="round" stroke-linecap="round"${opts.dash ? ` stroke-dasharray="${opts.dash}"` : ''} ${opts.marker === false ? '' : `marker-end="url(#${opts.marker || 'arrow'})"`}/>`;
const card = (x, y, w, h, title, sub = [], opts = {}) => {
  const titleSize = opts.titleSize || 28;
  const subSize = opts.subSize || 19;
  const subGap = subSize * 1.22;
  const total = sub.length ? titleSize + 10 + subGap * sub.length : titleSize;
  const titleY = y + h / 2 - total / 2 + titleSize / 2;
  const subY = titleY + titleSize / 2 + 10 + subSize / 2;
  return rect(x, y, w, h, opts)
    + lines(x + w / 2, titleY, [title], { size: titleSize, fill: opts.titleFill || C.ink, weight: 650 })
    + (sub.length ? lines(x + w / 2, subY, sub, { size: subSize, fill: opts.subFill || C.muted, gap: 1.22 }) : '');
};
const frame = (x, y, w, h, title) => rect(x, y, w, h, { fill: C.paper, stroke: C.frame, sw: 2, r: 14, dash: '12 9' }) + lines(x + 24, y + 30, [title], { size: 27, fill: C.muted, weight: 650, anchor: 'start' });
const header = (id, width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="${C.muted}"/></marker><marker id="blueArrow" markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="${C.blue}"/></marker><marker id="greenArrow" markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="${C.green}"/></marker><marker id="redArrow" markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="${C.red}"/></marker><style>.cn{font-family:${font};}</style></defs><rect width="${width}" height="${height}" fill="${C.paper}"/>`;
const footer = () => '</svg>';

function fig31() {
  const w = 1800, h = 720;
  let s = header('3-1', w, h);
  s += frame(45, 36, 1710, 650, '');
  s += rect(76, 86, 1648, 108, { fill: C.soft, stroke: C.border, sw: 2, r: 10 });
  s += lines(98, 112, ['六阶段流程约束架构'], { size: 28, fill: C.muted, weight: 650, anchor: 'start' });
  const stages = ['BRD', 'PRD', 'Design', 'Plan', 'Test', 'Apply'];
  stages.forEach((t, i) => { const x = 80 + i * 280; s += card(x, 132, 210, 48, t, [], { titleSize: 27, fill: '#fff', stroke: C.border, sw: 1.8, r: 7 }); if (i < stages.length - 1) s += line(x + 210, 156, x + 265, 156, { sw: 2.2 }); });
  s += pathEl('M900 194 V210', { stroke: C.muted, marker: false, sw: 2.4 });
  s += rect(76, 210, 1648, 46, { fill: '#f7f9fa', stroke: C.border, sw: 2, r: 9 });
  s += lines(900, 233, ['阶段制品与状态'], { size: 24, fill: C.muted, weight: 650 });
  s += lines(98, 280, ['需求与代码知识组织'], { size: 26, fill: C.muted, weight: 650, anchor: 'start' });
  s += pathEl('M900 256 V296', { stroke: C.blue, marker: 'blueArrow', sw: 2.5 });
  s += card(75, 315, 245, 130, '输入知识', [], { fill: '#fff', titleSize: 34 });
  s += card(360, 315, 300, 130, '双层知识模型', [], { fill: C.blueFill, stroke: '#7396b1', titleFill: C.blue, titleSize: 34 });
  s += card(710, 300, 390, 170, '项目知识图谱', [], { fill: C.blueFill, stroke: C.blue, sw: 3, titleFill: C.blue, titleSize: 39 });
  s += card(1150, 315, 300, 130, '上下文生成', [], { fill: C.greenFill, stroke: C.green, titleFill: C.green, titleSize: 34 });
  s += card(1495, 315, 235, 130, 'AI 编程智能体', [], { fill: '#fff', titleSize: 31 });
  s += line(320, 380, 360, 380); s += line(660, 380, 710, 380); s += line(1100, 380, 1150, 380); s += line(1450, 380, 1495, 380);
  s += rect(700, 500, 420, 130, { fill: '#fbfcfd', stroke: C.border, sw: 2, r: 10 });
  s += lines(910, 530, ['Spec 增量知识演化'], { size: 30, fill: C.ink, weight: 650 });
  s += lines(910, 578, ['冷启动 → 归档沉淀 → 增量更新'], { size: 24, fill: C.muted, weight: 550 });
  s += pathEl('M1612 445 V525 H1120', { stroke: C.green, marker: 'greenArrow', sw: 3 });
  s += pathEl('M700 565 H675 V405 H710', { stroke: C.blue, marker: 'blueArrow', sw: 3 });
  return s + footer();
}

function fig32() {
  const w = 1700, h = 940;
  let s = header('3-2', w, h);
  s += frame(45, 34, 1610, 870, '六阶段流程约束架构');
  s += rect(78, 92, 1550, 150, { fill: C.soft, stroke: C.border, sw: 2, r: 10 });
  s += lines(102, 119, ['系统控制与门禁'], { size: 25, fill: C.muted, weight: 650, anchor: 'start' });
  const controls = ['强依赖检查', '弱依赖读取', '拍板门禁'];
  controls.forEach((title, i) => { const x = 115 + i * 505; s += card(x, 148, 455, 67, title, [], { titleSize: 26, fill: '#fff', r: 8 }); });
  s += lines(860, 286, ['主流程'], { size: 25, fill: C.muted, weight: 650 });
  const stages = ['BRD', 'PRD', 'Design', 'Plan', 'Test', 'Apply'];
  stages.forEach((title, i) => { const x = 90 + i * 255; s += card(x, 330, 205, 106, title, [], { titleSize: 31, fill: i === 5 ? C.blueFill : '#fff', stroke: i === 5 ? C.blue : C.border, sw: i === 5 ? 3 : 2, titleFill: i === 5 ? C.blue : C.ink }); if (i < stages.length - 1) s += line(x + 205, 383, x + 244, 383); });
  s += card(570, 472, 180, 62, 'Explore', [], { titleSize: 24, fill: '#fff', dash: '8 6', stroke: C.muted, r: 8 });
  s += card(570, 560, 180, 52, '用户拍板', [], { titleSize: 20, fill: C.soft, r: 8 });
  s += pathEl('M605 436 V468', { sw: 2 }); s += pathEl('M660 534 V553', { sw: 2 }); s += pathEl('M750 586 H840 V436', { sw: 2 });
  s += rect(78, 650, 1550, 205, { fill: '#fbfcfd', stroke: C.border, sw: 2, r: 10 });
  s += lines(102, 680, ['状态留痕与知识反馈'], { size: 25, fill: C.muted, weight: 650, anchor: 'start' });
  const artifacts = ['阶段制品', '任务上下文', '代码交付', '需求归档'];
  artifacts.forEach((title, i) => { const x = 120 + i * 375; s += card(x, 724, 300, 75, title, [], { titleSize: 26, fill: '#fff' }); if (i < artifacts.length - 1) s += line(x + 300, 762, x + 355, 762); });
  s += pathEl('M1515 436 V675 H1395 V724', { stroke: C.green, marker: 'greenArrow', sw: 3 });
  return s + footer();
}

function fig33() {
  const w = 1700, h = 900;
  let s = header('3-3', w, h);
  s += lines(850, 42, ['能力-代码双层四层本体'], { size: 36, fill: C.ink, weight: 650 });
  s += frame(80, 95, 1540, 190, 'C 层：业务能力');
  s += frame(80, 325, 1540, 480, '');
  s += lines(110, 352, ['L1–L3 层：代码结构'], { size: 28, fill: C.muted, weight: 650, anchor: 'start' });
  const xs = [410, 850, 1290];
  ['用户认证', '订单管理', '商品管理'].forEach((title, i) => { s += card(xs[i] - 140, 155, 280, 82, title, [], { titleSize: 31, fill: C.blueFill, stroke: '#7396b1', titleFill: C.blue }); });
  const rows = [
    ['L1 模块', ['auth 模块', 'order 模块', 'catalog 模块'], 380, 82, C.soft],
    ['L2 文件', ['login.vue', 'order.service.ts', 'product-list.vue'], 515, 82, '#fff'],
    ['L3 元素', ['handleLogin()', 'createOrder()', 'loadProducts()'], 650, 82, '#fff'],
  ];
  rows.forEach(([label, vals, y, hh, fill]) => { s += lines(110, y + hh / 2, [label], { size: 24, fill: C.muted, weight: 650, anchor: 'start' }); vals.forEach((v, i) => { s += card(xs[i] - 140, y, 280, hh, v, [], { titleSize: 27, fill }); }); });
  xs.forEach((x) => { s += line(x, 237, x, 380, { stroke: C.blue, marker: 'blueArrow', sw: 2.8 }); s += line(x, 462, x, 515, { sw: 2.5 }); s += line(x, 597, x, 650, { sw: 2.5 }); });
  s += line(550, 556, 710, 556, { sw: 2.5 }); s += lines(630, 532, ['import'], { size: 23, fill: C.muted });
  s += line(550, 691, 710, 691, { sw: 2.5 }); s += lines(630, 667, ['call'], { size: 23, fill: C.muted });
  s += rect(100, 830, 1520, 48, { fill: C.soft, stroke: C.border, sw: 1.5, r: 8 });
  s += lines(850, 854, ['蓝色：business_map（业务映射）　　灰色：结构关系'], { size: 24, fill: C.muted });
  return s + footer();
}

function fig34() {
  const w = 1200, h = 1380;
  let s = header('3-4', w, h);
  s += lines(600, 44, ['business_map 生成流程'], { size: 36, fill: C.ink, weight: 650 });
  s += card(385, 85, 430, 90, '能力规范', [], { titleSize: 32, fill: C.blueFill, stroke: '#7396b1', titleFill: C.blue });
  s += line(600, 175, 600, 220, { sw: 2.6 });
  s += card(385, 220, 430, 90, '候选召回', [], { titleSize: 32 });
  s += line(600, 310, 600, 355, { sw: 2.6 });
  s += rect(250, 350, 700, 340, { fill: '#fbfcfd', stroke: C.frame, sw: 2, r: 12 });
  s += lines(600, 390, ['四类证据计算'], { size: 32, fill: C.muted, weight: 650 });
  const evidence = [['doc-extract', '文档提取', '0.85'], ['name-match', '命名匹配', '0.45–0.70'], ['semantic', '语义匹配', 'Top-K / 余弦相似度'], ['git-history', 'Git 历史追溯', '频次归一化']];
  evidence.forEach((a, i) => {
    const x = 290 + (i % 2) * 320;
    const y = 420 + Math.floor(i / 2) * 125;
    const sub = i === 2
      ? [a[0] + ' · Top-K', '余弦相似度']
      : [a[0] + ' · ' + a[2]];
    s += card(x, y, 300, 112, a[1], sub, {
      titleSize: 26, subSize: 25, fill: '#fff', r: 8,
    });
  });
  s += line(600, 690, 600, 740, { sw: 2.6 });
  s += card(385, 740, 430, 100, 'noisy-OR', ['W = 1 − ∏(1 − wi)'], { titleSize: 32, subSize: 22, fill: C.greenFill, stroke: C.green, titleFill: C.green });
  s += line(600, 840, 600, 885, { sw: 2.6 });
  s += card(385, 885, 430, 100, '确定溯源', ['structure > doc > git'], { titleSize: 31, subSize: 22 });
  s += line(600, 985, 600, 1025, { sw: 2.6 });
  s += `<polygon points="600,1025 700,1095 600,1165 500,1095" fill="#fff" stroke="${C.border}" stroke-width="2"/>`;
  s += lines(600, 1090, ['W ≥ 0.30?'], { size: 27, fill: C.ink, weight: 650 });
  s += pathEl('M600 1165 V1190 H310 V1210', { stroke: C.blue, marker: 'blueArrow', sw: 2.6 });
  s += pathEl('M600 1190 H890 V1210', { stroke: C.red, marker: 'redArrow', sw: 2.6 });
  s += lines(430, 1180, ['是'], { size: 25, fill: C.blue, weight: 650 });
  s += lines(770, 1180, ['否'], { size: 25, fill: C.red, weight: 650 });
  s += card(120, 1210, 380, 90, '生成 business_map 边', [], { titleSize: 29, fill: C.blueFill, stroke: C.blue, titleFill: C.blue });
  s += card(700, 1210, 380, 90, '丢弃候选', [], { titleSize: 29, fill: C.redFill, stroke: C.red, titleFill: C.red });
  return s + footer();
}

function fig35() {
  const w = 1050, h = 1120;
  let s = header('3-5', w, h);
  s += lines(525, 42, ['图谱驱动的任务上下文生成流水线'], { size: 40, fill: C.ink, weight: 650 });

  const flow = [
    ['任务描述 q', 'Token 预算 B'],
    ['锚点选择'],
    ['子图裁剪'],
    ['骨架抽取'],
    ['符号化序列化'],
  ];
  const cardX = 275, cardW = 500, cardH = 92;
  flow.forEach((a, i) => {
    const y = 82 + i * 120;
    s += card(cardX, y, cardW, cardH, a[0], a.slice(1), {
      titleSize: 36, subSize: 26,
      fill: i === 4 ? C.greenFill : i === 1 ? C.blueFill : '#fff',
      stroke: i === 4 ? C.green : i === 1 ? '#7396b1' : C.border,
      sw: i === 1 || i === 4 ? 3 : 2,
      titleFill: i === 1 ? C.blue : i === 4 ? C.green : C.ink,
    });
    if (i < flow.length - 1) s += line(525, y + cardH, 525, y + 120, { sw: 2.4 });
  });

  s += line(525, 654, 525, 700, { sw: 2.4 });
  s += `<polygon points="525,700 645,770 525,840 405,770" fill="#fff" stroke="${C.border}" stroke-width="2"/>`;
  s += lines(525, 754, ['tokens(C)'], { size: 30, fill: C.ink, weight: 650 });
  s += lines(525, 790, ['≤ B ?'], { size: 30, fill: C.ink, weight: 650 });

  s += card(665, 725, 300, 90, '输出上下文 C', [], { titleSize: 32, fill: C.greenFill, stroke: C.green, titleFill: C.green });
  s += pathEl('M645 770 H665', { stroke: C.green, marker: 'greenArrow', sw: 2.6 });
  s += lines(655, 735, ['是'], { size: 26, fill: C.green, weight: 650 });

  s += card(225, 930, 600, 135, '五级降级链', ['压缩档位 → 减节点 → 减深度', '提边权 → 仅保留锚点'], { titleSize: 34, subSize: 27, gap: 1.3, fill: C.redFill, stroke: C.red, titleFill: C.red });
  s += pathEl('M525 840 V895 H525 V930', { stroke: C.red, marker: 'redArrow', sw: 2.5 });
  s += lines(575, 875, ['否 / 超预算'], { size: 26, fill: C.red, weight: 650, anchor: 'start' });

  s += pathEl('M225 997 H100 V366 H275', { stroke: C.red, marker: 'redArrow', sw: 2.5 });
  s += lines(165, 895, ['返回子图裁剪'], { size: 26, fill: C.red, weight: 650 });
  return s + footer();
}

const figures = [
  ['图3-1-方法总体框架', fig31()],
  ['图3-2-六阶段流程约束架构', fig32()],
  ['图3-3-能力代码双层本体模型', fig33()],
  ['图3-4-business_map生成流程', fig34()],
  ['图3-5-图谱驱动任务上下文生成流水线', fig35()],
];

await fs.mkdir(outDir, { recursive: true });
for (const [name, svg] of figures) {
  const svgPath = path.join(outDir, `${name}.svg`);
  const pngPath = path.join(outDir, `${name}.png`);
  await fs.writeFile(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log(`created ${svgPath}`);
}
