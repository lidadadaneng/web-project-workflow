import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const output = path.resolve('论文/图表/第3章/子图裁剪示意图-初稿');
const W = 1900;
const H = 1000;
const c = {
  ink: '#273842', muted: '#5d707b', edge: '#607681',
  blue: '#2c709e', green: '#4e896c', red: '#b65349',
};
const layer = {
  C: ['#eee5f8', '#8462ab'],
  L1: ['#e2effb', '#4e88bf'],
  L2: ['#e7f3e0', '#639b53'],
  L3: ['#fff0d9', '#c28b3d'],
};
const out = [];
const esc = value => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const attrs = values => Object.entries(values)
  .map(([key, value]) => key + '="' + esc(value) + '"').join(' ');

function el(tag, values, content) {
  out.push('<' + tag + ' ' + attrs(values)
    + (content === undefined ? '/>' : '>' + esc(content) + '</' + tag + '>'));
}

function text(x, y, value, size = 18, fill = c.ink, weight = 400, anchor = 'middle') {
  el('text', { x, y, fill, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor }, value);
}

function edge(d, kind = 'normal') {
  const cut = kind === 'cut';
  const search = kind === 'search';
  el('path', {
    d, fill: 'none',
    stroke: cut ? c.red : search ? c.blue : c.edge,
    'stroke-width': cut ? 2.8 : 2.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    ...(cut ? { 'stroke-dasharray': '8 6' } : {}),
    'marker-end': 'url(#' + (cut ? 'red-arrow' : search ? 'blue-arrow' : 'edge-arrow') + ')',
  });
}

function node({ x, y, width, name, meta, type, state = 'kept' }) {
  const removed = state === 'cut';
  if (state === 'anchor' || removed) {
    el('rect', {
      x: x - width / 2 - 10, y: y - 51, width: width + 20, height: 102, rx: 51,
      fill: 'none', stroke: removed ? c.red : c.blue,
      'stroke-width': 2.8, 'stroke-dasharray': '8 6',
    });
  }
  el('rect', {
    x: x - width / 2, y: y - 41, width, height: 82, rx: 40,
    fill: removed ? '#fbf0ee' : layer[type][0],
    stroke: removed ? c.red : layer[type][1],
    'stroke-width': state === 'anchor' ? 3.2 : 2.3,
  });
  text(x, y - 3, name, 23, removed ? c.red : c.ink, 600);
  text(x, y + 25, meta, 18, removed ? c.red : c.muted);
}

out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
out.push('<title>加权双向 BFS 子图裁剪：图节点与裁剪范围</title>');
out.push('<desc>从两个锚点沿入边和出边逐层扩展；绿色虚线范围为保留子图，红圈节点被裁剪。</desc>');
out.push('<defs>');
for (const [id, fill] of [['edge-arrow', c.edge], ['blue-arrow', c.blue], ['red-arrow', c.red]]) {
  out.push('<marker ' + attrs({
    id, markerWidth: 10, markerHeight: 10, refX: 9, refY: 5,
    orient: 'auto', markerUnits: 'userSpaceOnUse',
  }) + '><path ' + attrs({ d: 'M 0 0 L 10 5 L 0 10 Z', fill }) + '/></marker>');
}
out.push('</defs>');
el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' });
text(950, 49, '加权双向 BFS 子图裁剪（节点级示意）', 32, c.ink, 600);
text(950, 86, '两个锚点双向逐层扩展；边权 w(e) ≥ 0.70，最近锚点深度 d(v) ≤ 3，节点数 |V′| ≤ 100', 20, c.muted);

// Green contour: the selected subgraph G′.
el('rect', {
  x: 105, y: 126, width: 1420, height: 650, rx: 34,
  fill: '#f1f8f3', 'fill-opacity': 0.66, stroke: c.green,
  'stroke-width': 3.8, 'stroke-dasharray': '14 9',
});
text(140, 165, '保留子图 G′', 25, c.green, 600, 'start');
text(140, 194, '锚点及满足裁剪约束的关联节点', 17, c.muted, 400, 'start');

// Graph edges are drawn before nodes so labels stay unobstructed.
edge('M 770 256 L 770 316');
text(866, 297, 'business_map · 0.85', 18, c.muted, 400, 'start');
edge('M 770 398 L 770 474');
text(740, 445, 'contain · 0.90', 18, c.muted, 400, 'end');
edge('M 770 556 L 770 623');
text(844, 599, 'contain · 0.90', 18, c.muted, 400, 'start');

edge('M 275 341 Q 300 400 365 474');
text(190, 408, 'import · 0.75', 17, c.muted, 400, 'start');
edge('M 475 515 L 664 515');
edge('M 646 476 L 486 476', 'search');
text(570, 456, '沿入边回溯', 18, c.blue, 600);
text(570, 549, 'auth.guard.ts → login.vue', 16, c.muted);

edge('M 876 515 L 1020 515');
edge('M 890 476 L 1006 476', 'search');
text(948, 456, '沿出边扩展', 18, c.blue, 600);
text(948, 549, 'login.vue → auth.api.ts', 16, c.muted);
edge('M 1250 550 Q 1282 582 1320 623');
text(1336, 585, 'import · 0.75', 17, c.muted, 400, 'start');

edge('M 1446 664 L 1582 664', 'cut');
text(1515, 625, 'import · 0.75', 17, c.muted);
text(1515, 678, '×', 35, c.red, 600);
edge('M 770 706 L 770 816', 'cut');
text(770, 778, '×', 35, c.red, 600);
text(864, 785, 'call · 0.60', 19, c.red, 600, 'start');

node({ x: 770, y: 215, width: 230, name: 'user-auth', meta: 'C · 锚点 · d=0', type: 'C', state: 'anchor' });
node({ x: 770, y: 357, width: 210, name: 'auth 模块', meta: 'L1 · d=1', type: 'L1' });
node({ x: 770, y: 515, width: 212, name: 'login.vue', meta: 'L2 · d=1', type: 'L2' });
node({ x: 770, y: 664, width: 256, name: 'handleLogin()', meta: 'L3 · 锚点 · d=0', type: 'L3', state: 'anchor' });
node({ x: 275, y: 300, width: 250, name: 'route.config.ts', meta: 'L2 · d=3', type: 'L2' });
node({ x: 365, y: 515, width: 220, name: 'auth.guard.ts', meta: 'L2 · d=2', type: 'L2' });
node({ x: 1135, y: 515, width: 230, name: 'auth.api.ts', meta: 'L2 · d=2', type: 'L2' });
node({ x: 1320, y: 664, width: 252, name: 'token.service.ts', meta: 'L2 · d=3', type: 'L2' });
node({ x: 1730, y: 664, width: 250, name: 'common-http.ts', meta: 'L2 · 候选节点', type: 'L2', state: 'cut' });
node({ x: 770, y: 858, width: 257, name: 'refreshToken()', meta: 'L3 · 候选节点', type: 'L3', state: 'cut' });

text(1730, 743, '裁剪：d=4 > 3', 19, c.red, 600);
text(770, 939, '裁剪：w=0.60 < 0.70', 19, c.red, 600);

// Compact rule note.
el('rect', {
  x: 1560, y: 126, width: 285, height: 208, rx: 16,
  fill: '#f8fafb', stroke: '#a7b5bc', 'stroke-width': 1.8,
});
text(1583, 160, '裁剪判定', 21, c.ink, 600, 'start');
text(1583, 195, 'w(e) < 0.70 → 剔除', 17, c.red, 500, 'start');
text(1583, 226, 'd(v) > 3 → 剔除', 17, c.red, 500, 'start');
text(1583, 257, '|V′| ≤ 100', 17, c.muted, 400, 'start');
text(1583, 298, '候选按 score(v)', 17, c.blue, 500, 'start');
text(1583, 322, '= 0.6·sem + 0.4·struct 排序', 16, c.muted, 400, 'start');

// Legend.
text(110, 837, '图例', 20, c.ink, 600, 'start');
el('rect', { x: 110, y: 861, width: 34, height: 24, rx: 12, fill: layer.C[0], stroke: c.blue, 'stroke-width': 2.5 });
text(154, 880, '锚点', 17, c.ink, 400, 'start');
el('rect', { x: 245, y: 861, width: 34, height: 24, rx: 12, fill: '#fbf0ee', stroke: c.red, 'stroke-width': 2.5, 'stroke-dasharray': '6 4' });
text(290, 880, '红圈：裁剪节点', 17, c.ink, 400, 'start');
el('line', { x1: 438, y1: 873, x2: 486, y2: 873, stroke: c.green, 'stroke-width': 3, 'stroke-dasharray': '10 7' });
text(499, 880, '绿圈：保留子图 G′', 17, c.ink, 400, 'start');
text(110, 935, '关系箭头表示图谱边方向；蓝色箭头表示从锚点出发的双向 BFS 遍历', 17, c.muted, 400, 'start');

out.push('</svg>');
const source = out.join('\n');
await fs.writeFile(output + '.svg', source, 'utf8');
await sharp(Buffer.from(source)).png().toFile(output + '.png');
console.log(output + '.svg');
console.log(output + '.png');
