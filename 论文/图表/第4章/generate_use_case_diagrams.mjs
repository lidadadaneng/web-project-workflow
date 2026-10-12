import fs from 'node:fs/promises';
import nodePath from 'node:path';
import sharp from 'sharp';

const outDir = nodePath.resolve('论文/图表/第4章');
const ink = '#27313a';
const gray = '#59636c';
const border = '#8f9aa2';
const paper = '#ffffff';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svgStart(w, h, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
  <defs>
    <marker id="assoc-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4.5 L0,9 Z" fill="${gray}"/></marker>
    <marker id="include-arrow" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L10,5.5 L1,10" fill="white" stroke="${gray}" stroke-width="1.3"/></marker>
    <style>.cn{font-family:"Microsoft YaHei","Noto Sans CJK SC",SimSun,sans-serif;fill:${ink};}.muted{fill:${gray};}.boundary{fill:none;stroke:${border};stroke-width:2;stroke-dasharray:12 8;}.uc{fill:#fff;stroke:${gray};stroke-width:2;}</style>
  </defs><rect width="${w}" height="${h}" fill="${paper}"/>`;
}
function svgEnd() { return '</svg>'; }
function t(x, y, text, size = 24, opts = {}) {
  const { anchor = 'middle', weight = 500, cls = '', fill, italic = false } = opts;
  const style = `font-size:${size}px;font-weight:${weight};${fill ? `fill:${fill};` : ''}${italic ? 'font-style:italic;' : ''}`;
  return `<text class="cn ${cls}" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" style="${style}">${esc(text)}</text>`;
}
function multi(x, y, lines, size = 23, opts = {}) {
  const { line = 1.24, anchor = 'middle', weight = 500, cls = '', fill } = opts;
  const h = size * line;
  const start = y - (lines.length - 1) * h / 2;
  return lines.map((s, i) => t(x, start + i * h, s, size, { anchor, weight, cls, fill })).join('');
}
function rect(x, y, w, h, cls = 'uc', rx = 10, extra = '') { return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${extra}/>`; }
function ellipse(cx, cy, rx, ry, lines, opts = {}) {
  const { size = 22, weight = 500, cls = 'uc' } = opts;
  return `<ellipse class="${cls}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>${multi(cx, cy, lines, size, { weight })}`;
}
function line(x1, y1, x2, y2, opts = {}) {
  const { dashed = false, arrow = false, marker = 'assoc-arrow', width = 2, color = gray } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dashed ? 'stroke-dasharray="8 6"' : ''} ${arrow ? `marker-end="url(#${marker})"` : ''}/>`;
}
function boundary(x, y, w, h, title) { return `${rect(x, y, w, h, 'boundary', 12)}${t(x + 24, y + 26, title, 26, { anchor: 'start', weight: 650, cls: 'muted' })}`; }
function actor(x, y, name) {
  return `<g stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"><circle cx="${x}" cy="${y - 54}" r="17" fill="white"/><path d="M${x} ${y - 36} V${y + 18} M${x - 34} ${y - 14} H${x + 34} M${x} ${y + 18} L${x - 25} ${y + 54} M${x} ${y + 18} L${x + 25} ${y + 54}"/></g>${t(x, y + 82, name, 24, { weight: 600 })}`;
}
function relationLabel(x, y, text, size = 17) {
  const width = Math.max(76, text.length * size * 0.62 + 14);
  return `<rect x="${x - width / 2}" y="${y - size * 0.62}" width="${width}" height="${size * 1.24}" rx="4" fill="white" opacity="0.96"/>` + t(x, y, text, size, { cls: 'muted', italic: true });
}

function overall() {
  const w = 1360, h = 760; let s = svgStart(w, h, 'wpw 系统总体用例图');
  s += boundary(205, 32, 950, 695, 'wpw 系统');
  s += actor(92, 365, '开发者') + actor(1265, 365, 'AI 编程智能体');
  const ys = [135, 255, 375, 495, 615];
  const uses = ['工作流管理', '图谱构建', '上下文生成', '增量维护', '可视化控制台'];
  ys.forEach((y, i) => { s += ellipse(680, y, 210, 40, [uses[i]], { size: 30 }); });
  ys.forEach((y) => { s += line(126, 351, 470, y, { arrow: true, width: 1.8 }); });
  [135, 375, 495].forEach((y) => { s += line(1231, 351, 890, y, { arrow: true, width: 1.8 }); });
  return s + svgEnd();
}

function workflow() {
  const w = 1400, h = 790; let s = svgStart(w, h, '工作流管理模块用例图');
  s += boundary(205, 32, 990, 725, '工作流管理模块');
  s += actor(92, 390, '开发者') + actor(1300, 390, 'AI 编程智能体');
  const ys = [130, 255, 380, 505, 630];
  const developerUses = ['创建需求实例', '确认阶段制品', '推进阶段', '拍板技术方案', '归档需求'];
  const otherUses = ['生成阶段制品', '标记任务进度', '检查阶段依赖', '跳过可选阶段', '恢复中断现场'];
  ys.forEach((y, i) => {
    s += ellipse(480, y, 160, 40, [developerUses[i]], { size: 28 });
    s += ellipse(930, y, 160, 40, [otherUses[i]], { size: 28 });
  });
  ys.forEach((y) => { s += line(126, 376, 320, y, { arrow: true, width: 1.8 }); });
  [130, 255, 630].forEach((y) => { s += line(1266, 376, 1090, y, { arrow: true, width: 1.8 }); });
  s += line(640, 380, 770, 380, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(770, 505, 640, 380, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += relationLabel(705, 347, '«include»');
  s += relationLabel(727, 463, '«extend»');
  return s + svgEnd();
}

function graph() {
  const w = 1280, h = 760; let s = svgStart(w, h, '图谱构建模块用例图');
  s += boundary(195, 32, 970, 695, '图谱构建模块');
  s += actor(90, 365, '开发者');
  const ys = [135, 255, 375, 495, 615];
  const uses = ['构建或重建图谱', '解析源码结构', '解析能力规范', '生成业务映射边', '保存图谱索引'];
  ys.forEach((y, i) => { s += ellipse(475, y, 165, 40, [uses[i]], { size: 28 }); });
  s += ellipse(925, 195, 165, 40, ['预检源码文件'], { size: 28 });
  s += ellipse(925, 495, 165, 40, ['汇聚多源证据'], { size: 28 });
  ys.forEach((y) => { s += line(124, 351, 310, y, { arrow: true, width: 1.8 }); });
  s += line(640, 135, 760, 195, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(640, 495, 760, 495, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += relationLabel(692, 132, '«include»');
  s += relationLabel(700, 463, '«include»');
  return s + svgEnd();
}

function context() {
  const w = 1360, h = 760; let s = svgStart(w, h, '上下文生成模块用例图');
  s += boundary(205, 32, 950, 695, '上下文生成模块');
  s += actor(92, 350, '开发者') + actor(1265, 350, 'AI 编程智能体');
  s += ellipse(700, 125, 190, 40, ['请求任务上下文'], { size: 30 });
  s += ellipse(480, 295, 175, 40, ['检索或指定锚点'], { size: 29 });
  s += ellipse(480, 455, 175, 40, ['扩展并裁剪子图'], { size: 29 });
  s += ellipse(480, 615, 175, 40, ['序列化任务上下文'], { size: 29 });
  s += ellipse(940, 615, 185, 40, ['预算降级与报错'], { size: 29 });
  s += line(126, 336, 510, 125, { arrow: true, width: 1.8 });
  s += line(1231, 336, 890, 125, { arrow: true, width: 1.8 });
  s += line(650, 163, 580, 262, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(480, 335, 480, 415, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(480, 495, 480, 575, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(755, 615, 655, 615, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += relationLabel(693, 224, '«include»');
  s += relationLabel(570, 375, '«include»');
  s += relationLabel(570, 535, '«include»');
  s += relationLabel(705, 583, '«extend»');
  return s + svgEnd();
}

function incremental() {
  const w = 1360, h = 760; let s = svgStart(w, h, '增量维护模块用例图');
  s += boundary(205, 32, 950, 695, '增量维护模块');
  s += actor(92, 350, '开发者') + actor(1265, 350, 'AI 编程智能体');
  s += ellipse(700, 125, 185, 40, ['触发图谱更新'], { size: 30 });
  s += ellipse(470, 295, 175, 40, ['识别文件变更'], { size: 29 });
  s += ellipse(470, 455, 175, 40, ['局部重建节点与边'], { size: 29 });
  s += ellipse(470, 615, 175, 40, ['重算受影响映射边'], { size: 28 });
  s += ellipse(940, 295, 185, 40, ['全量重建'], { size: 29 });
  s += ellipse(940, 455, 185, 40, ['比对并合并能力规范'], { size: 28 });
  s += line(126, 336, 515, 125, { arrow: true, width: 1.8 });
  s += line(1231, 336, 885, 125, { arrow: true, width: 1.8 });
  s += line(1231, 336, 1125, 455, { arrow: true, width: 1.8 });
  s += line(650, 163, 565, 262, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(470, 335, 470, 415, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(470, 495, 470, 575, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += line(875, 258, 775, 162, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
  s += relationLabel(672, 220, '«include»');
  s += relationLabel(565, 375, '«include»');
  s += relationLabel(565, 535, '«include»');
  s += relationLabel(892, 215, '«extend»');
  return s + svgEnd();
}

function consoleDiagram() {
  const w = 1280, h = 760; let s = svgStart(w, h, '可视化控制台模块用例图');
  s += boundary(195, 32, 970, 695, '可视化控制台模块');
  s += actor(90, 365, '开发者');
  const ys = [120, 222, 324, 426, 528, 630];
  const uses = ['工作流看板与操作', '图谱与知识查看', '演示上下文生成', '配置模型接口', '注入上下文对话', '查看归档与统计'];
  ys.forEach((y, i) => { s += ellipse(475, y, 165, 34, [uses[i]], { size: 27 }); });
  s += ellipse(925, 120, 165, 34, ['回溯历史状态'], { size: 27 });
  s += ellipse(925, 426, 165, 34, ['测试接口连接'], { size: 27 });
  s += ellipse(925, 528, 165, 34, ['双栏对比回答'], { size: 27 });
  ys.forEach((y) => { s += line(124, 351, 310, y, { arrow: true, width: 1.8 }); });
  [120, 426, 528].forEach((y) => {
    s += line(760, y, 640, y, { dashed: true, arrow: true, marker: 'include-arrow', width: 1.7 });
    s += relationLabel(700, y - 27, '«extend»');
  });
  return s + svgEnd();
}

const figures = [
  ['图4-1-wpw系统总体用例图', overall()],
  ['图4-2-工作流管理模块用例图', workflow()],
  ['图4-3-图谱构建模块用例图', graph()],
  ['图4-4-上下文生成模块用例图', context()],
  ['图4-5-增量维护模块用例图', incremental()],
  ['图4-6-可视化控制台模块用例图', consoleDiagram()],
];

await fs.mkdir(outDir, { recursive: true });
// Pass one or more basenames to regenerate only selected figures.
const selected = new Set(process.argv.slice(2));
for (const [base, markup] of figures) {
  if (selected.size && !selected.has(base)) continue;
  const svgPath = nodePath.join(outDir, `${base}.svg`);
  const pngPath = nodePath.join(outDir, `${base}.png`);
  await fs.writeFile(svgPath, markup, 'utf8');
  await sharp(Buffer.from(markup)).png({ compressionLevel: 9 }).toFile(pngPath);
  console.log(`created ${svgPath}`);
  console.log(`created ${pngPath}`);
}
