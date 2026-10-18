import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outDir = path.dirname(fileURLToPath(import.meta.url));
const ink = '#263238';
const muted = '#66747a';
const grid = '#d8dfe1';
const soft = '#f4f7f7';
const accent = '#5f8888';
const accentLight = '#e3eeee';
const neutral = '#9aa5a8';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const figures = [];

function figure(base, width, height, description, body) {
  const defs = `<defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L11 6 L0 12 Z" fill="${ink}"/></marker>
    <style>text{font-family:'Microsoft YaHei','SimHei',sans-serif} .muted{fill:${muted}} .small{font-size:23px} .label{font-size:29px} .main{font-size:36px;font-weight:600} .value{font-size:42px;font-weight:600}</style>
  </defs>`;
  figures.push({ base, width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${esc(description)}</title>${defs}<rect width="100%" height="100%" fill="#fff"/>${body}</svg>` });
}

function text(x, y, value, size = 28, opts = {}) {
  const { anchor = 'middle', fill = ink, weight = 400, lineHeight = size * 1.3, family = null } = opts;
  const lines = Array.isArray(value) ? value : [value];
  const start = y - ((lines.length - 1) * lineHeight) / 2;
  return `<text x="${x}" y="${start}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}" font-weight="${weight}" fill="${fill}"${family ? ` style="font-family:${family}"` : ''}>${lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join('')}</text>`;
}

function rect(x, y, w, h, opts = {}) {
  const { fill = '#fff', stroke = grid, width = 2, radius = 4 } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
}

function line(x1, y1, x2, y2, opts = {}) {
  const { stroke = ink, width = 2, arrow = false } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
}

// 6-1: connect the task-level outcome to, but distinguish it from, scenario evidence.
{
  let s = '';
  s += rect(42, 54, 500, 674, { fill: soft, stroke: grid });
  s += text(292, 108, '开发任务对比', 34, { weight: 600 });
  s += text(292, 157, '12 个任务 · 模型总 Token', 26, { fill: muted });
  s += text(164, 246, 'OpenSpec', 26, { fill: muted });
  s += text(407, 246, 'WPW', 26, { fill: muted });
  s += text(164, 310, '111.47', 45, { weight: 600 });
  s += text(407, 310, '68.16', 45, { weight: 600, fill: accent });
  s += text(164, 349, '百万 Token', 23, { fill: muted });
  s += text(407, 349, '百万 Token', 23, { fill: muted });
  s += line(95, 396, 489, 396, { stroke: grid });
  s += text(292, 452, '总用量减少', 28, { fill: muted });
  s += text(292, 515, '38.86%', 54, { weight: 600, fill: accent });
  s += text(292, 567, 'T1—T3：40.37%', 25, { fill: muted });
  s += text(292, 668, '开发实验只记录任务总量', 24, { fill: muted });

  s += rect(585, 202, 296, 372, { fill: '#fff', stroke: grid });
  s += text(733, 252, ['场景实验提供', '机制证据'], 29, { weight: 600 });
  s += text(733, 337, ['更准的文件定位', '更紧凑的初始上下文供给'], 25, { fill: muted });
  s += line(602, 413, 862, 413, { stroke: grid });
  s += text(733, 467, ['解释当前项目中的', 'Token 下降'], 26, { weight: 600, fill: accent });
  s += line(585, 390, 542, 390, { arrow: true, width: 3, stroke: accent });
  s += line(924, 390, 881, 390, { arrow: true, width: 3, stroke: accent });

  s += rect(924, 54, 510, 318, { fill: soft, stroke: grid });
  s += text(1179, 108, '检索定位（100 个查询）', 31, { weight: 600 });
  s += text(1179, 175, '完整 WPW 相对非 KG', 24, { fill: muted });
  s += text(1179, 238, 'Recall@5', 25, { fill: muted });
  s += text(1179, 284, '0.692  vs  0.483', 33, { weight: 600 });
  s += text(1179, 335, 'Recall@10  0.815  ·  Precision@10  0.185', 23, { fill: accent, weight: 600 });

  s += rect(924, 410, 510, 318, { fill: soft, stroke: grid });
  s += text(1179, 464, '问答与上下文（100 个问题）', 30, { weight: 600 });
  s += text(1179, 526, '盲评通过率', 24, { fill: muted });
  s += text(1179, 576, '91%  vs  83%', 34, { weight: 600 });
  s += text(1179, 640, '平均初始上下文 Token', 24, { fill: muted });
  s += text(1179, 687, '3,698  vs  2,690（−27.3%）', 29, { fill: accent, weight: 600 });

  s += text(738, 790, '两组实验测量对象不同；该证据链是当前条件下的机制解释，不构成普遍因果结论。', 24, { fill: muted });
  figure('图6-1-本章证据链', 1476, 832, '开发任务总 Token 与场景实验机制证据链', s);
}

// 6-2: paired bars for the eight T1-T3 tasks; the task table remains the source of exact values.
{
  const tasks = [
    ['T1-1', '注册登录', 7154327, 4341714, '39.31%'],
    ['T1-2', '分类与美食', 11162207, 3549765, '68.20%'],
    ['T2-1', '个性推荐', 5953742, 4489079, '24.60%'],
    ['T2-2', '购物与订单', 13874175, 9723130, '29.92%'],
    ['T3-1', '收藏', 6804127, 4151806, '38.98%'],
    ['T3-2', '评论', 10068110, 5945317, '40.95%'],
    ['T3-3', '美食资讯', 6746634, 4221184, '37.43%'],
    ['T3-4', '个人中心', 9377821, 6000527, '36.01%'],
  ];
  const w = 1940, h = 980, plot = { x: 118, y: 205, w: 1700, h: 540 };
  let s = '';
  const y = v => plot.y + plot.h - (v / 15_000_000) * plot.h;
  for (const tick of [0, 5, 10, 15]) {
    const yy = y(tick * 1_000_000);
    s += line(plot.x, yy, plot.x + plot.w, yy, { stroke: grid, width: 1.5 });
    s += text(plot.x - 18, yy, String(tick), 24, { anchor: 'end', fill: muted });
  }
  s += text(plot.x, plot.y - 42, '模型总 Token（百万）', 24, { anchor: 'start', fill: muted });
  s += rect(720, 66, 24, 24, { fill: neutral, stroke: neutral, radius: 2 });
  s += text(758, 79, 'OpenSpec', 25, { anchor: 'start' });
  s += rect(940, 66, 24, 24, { fill: accent, stroke: accent, radius: 2 });
  s += text(978, 79, 'WPW', 25, { anchor: 'start' });

  const slot = plot.w / tasks.length, barW = 40, gap = 9;
  tasks.forEach(([id, short, base, wpw, reduction], i) => {
    const cx = plot.x + slot * (i + 0.5);
    const x1 = cx - barW - gap / 2, x2 = cx + gap / 2;
    const y1 = y(base), y2 = y(wpw);
    s += `<rect x="${x1}" y="${y1}" width="${barW}" height="${plot.y + plot.h - y1}" fill="${neutral}"/>`;
    s += `<rect x="${x2}" y="${y2}" width="${barW}" height="${plot.y + plot.h - y2}" fill="${accent}"/>`;
    s += text(cx, Math.min(y1, y2) - 28, `−${reduction}`, 25, { weight: 700, fill: accent });
    s += text(cx, plot.y + plot.h + 39, [id, short], 24, { lineHeight: 29 });
  });
  s += text(plot.x + plot.w / 2, 882, '柱顶标注为 WPW 相对 OpenSpec 的减少比例', 25, { fill: muted });
  figure('图6-1-T1-T3八任务模型总Token对比', w, h, 'T1至T3八个开发任务的模型总 Token 对比', s);
}

// 6-3: two matched cohorts, with each task set fanning out to the same three conditions.
{
  const w = 1300, h = 980;
  const boldFont = `'Microsoft YaHei','SimHei',sans-serif`;
  let s = '';
  const panels = [
    { y: 60, label: '检索子实验', title: '100 个信息需求', hint: '文件级 Gold' },
    { y: 455, label: '问答子实验', title: '100 个项目问题', hint: '必答事实与盲评规则' },
  ];
  for (const panel of panels) {
    const y = panel.y;
    s += text(54, y + 20, panel.label, 32, { anchor: 'start', weight: 700, family: boldFont });
    s += rect(70, y + 70, 370, 220, { fill: soft, stroke: grid, width: 2.5 });
    s += text(255, y + 148, panel.title, 35, { weight: 700, family: boldFont });
    s += text(255, y + 211, panel.hint, 27, { fill: muted, weight: 600, family: boldFont });
    const bx = 650, bw = 590, bh = 100;
    const ys = [y + 38, y + 153, y + 268];
    const names = ['非 KG', 'WPW-Map', '完整 WPW'];
    const settings = ['关闭代码结构图与映射', '保留结构图；关闭 business_map', '保留结构图与 business_map'];
    const mid = ys[1] + bh / 2;
    s += line(440, mid, 525, mid, { stroke: ink, width: 3 });
    s += line(525, ys[0] + bh / 2, 525, ys[2] + bh / 2, { stroke: ink, width: 3 });
    ys.forEach((yy, i) => {
      s += line(525, yy + bh / 2, bx, yy + bh / 2, { stroke: ink, width: 2.5, arrow: true });
      s += rect(bx, yy, bw, bh, { fill: i === 2 ? accentLight : '#fff', stroke: i === 2 ? accent : grid, width: 2.5 });
      s += text(bx + bw / 2, yy + 31, names[i], 32, { weight: 700, family: boldFont });
      s += text(bx + bw / 2, yy + 72, settings[i], 26, { fill: muted, weight: 600, family: boldFont });
    });
  }
  s += line(72, 865, 1228, 865, { stroke: grid, width: 2 });
  s += text(w / 2, 922, '同题配对  ·  题集与评分规则固定  ·  每题每条件运行一次  ·  问答盲评独立评分', 27, { fill: muted, weight: 600, family: boldFont });
  figure('图6-2-题集与条件配对示意', w, h, '检索与问答题集在三种条件下进行配对比较', s);
}

// 6-4: grouped horizontal bars make condition differences visible by query category.
{
  const categories = ['精确标识定位', '业务关键词定位', '同义或非代码命名表达', '组合条件定位'];
  const conditions = [
    { name: '非 KG', color: neutral },
    { name: 'WPW-Map', color: '#7296a0' },
    { name: '完整 WPW', color: accent },
  ];
  const recall = [[1, 1, 1], [.480, .747, .740], [.353, .690, .730], [.633, .757, .790]];
  const precision = [[.100, .100, .100], [.128, .208, .208], [.100, .200, .208], [.176, .220, .224]];
  const w = 1500, h = 1380;
  let s = '';
  const legendX = [440, 680, 990];
  conditions.forEach((condition, i) => {
    s += rect(legendX[i], 38, 30, 30, { fill: condition.color, stroke: condition.color, radius: 2 });
    s += text(legendX[i] + 45, 53, condition.name, 31, { anchor: 'start' });
  });
  const panels = [
    { title: 'Recall@10', values: recall, max: 1, ticks: [0, .25, .5, .75, 1], titleY: 126, plotY: 190 },
    { title: 'Precision@10', values: precision, max: .25, ticks: [0, .05, .10, .15, .20, .25], titleY: 756, plotY: 820 },
  ];
  panels.forEach(panel => {
    const plotX = 390, plotY = panel.plotY, plotW = 950, groupH = 112, barH = 24, rowStep = 30;
    const axisY = plotY + groupH * categories.length - 8;
    s += text(w / 2, panel.titleY, panel.title, 42, { weight: 600 });
    panel.ticks.forEach(tick => {
      const xx = plotX + (tick / panel.max) * plotW;
      s += line(xx, plotY - 14, xx, axisY, { stroke: grid, width: 1.4 });
      s += text(xx, axisY + 37, tick.toFixed(2), 27, { fill: muted });
    });
    s += line(plotX, axisY, plotX + plotW, axisY, { stroke: muted, width: 1.6 });
    categories.forEach((category, i) => {
      const groupY = plotY + i * groupH;
      s += text(plotX - 27, groupY + rowStep + 16, category, 31, { anchor: 'end' });
      if (i > 0) s += line(55, groupY - 11, 1445, groupY - 11, { stroke: grid, width: 1.2 });
      panel.values[i].forEach((value, j) => {
        const y = groupY + j * rowStep;
        const barW = (value / panel.max) * plotW;
        s += `<rect x="${plotX}" y="${y + 4}" width="${barW}" height="${barH}" rx="2" fill="${conditions[j].color}"/>`;
        s += text(plotX + barW + 12, y + barH / 2 + 4, value.toFixed(3), 29, { anchor: 'start', weight: 600 });
      });
    });
  });
  figure('图6-3-按查询类别的检索结果', w, h, '不同查询类别下三种检索条件的 Recall@10 与 Precision@10', s);
}

// 6-5: initial context supplied before the agent starts; tool output is excluded.
{
  const dataPath = path.resolve(outDir, '../../辅助材料/关键词召回实验数据_v5/qa_runs_autonomous_scored.json');
  const runs = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const groups = [
    { id: 'non_kg', label: '非 KG', color: neutral },
    { id: 'wpw_map', label: 'WPW-Map', color: '#849596' },
    { id: 'full_wpw', label: '完整 WPW', color: accent },
  ].map(group => ({ ...group, values: runs.filter(run => run.condition === group.id).map(run => run.context_tokens + run.navigation_tokens).sort((a, b) => a - b) }));
  if (groups.some(group => group.values.length !== 100)) throw new Error('Expected 100 scored QA runs per condition');
  const quantile = (values, p) => {
    const index = (values.length - 1) * p, lower = Math.floor(index), fraction = index - lower;
    return values[lower] * (1 - fraction) + values[Math.ceil(index)] * fraction;
  };
  const summary = groups.map(group => {
    const { values } = group;
    const q1 = quantile(values, .25), median = quantile(values, .5), q3 = quantile(values, .75);
    const lowerFence = q1 - 1.5 * (q3 - q1), upperFence = q3 + 1.5 * (q3 - q1);
    return { ...group, q1, median, q3, mean: values.reduce((a, b) => a + b, 0) / values.length, low: values.find(v => v >= lowerFence), high: [...values].reverse().find(v => v <= upperFence), max: values.at(-1) };
  });
  const w = 1450, h = 820, plot = { x: 150, y: 80, w: 1130, h: 610 }, max = 20_000;
  const py = value => plot.y + plot.h - (value / max) * plot.h;
  let s = '';
  for (const tick of [0, 5000, 10000, 15000, 20000]) {
    const yy = py(tick);
    s += line(plot.x, yy, plot.x + plot.w, yy, { stroke: grid, width: 1.5 });
    s += text(plot.x - 18, yy, tick.toLocaleString('en-US'), 22, { anchor: 'end', fill: muted });
  }
  summary.forEach((group, index) => {
    const cx = plot.x + 230 + index * 335, boxW = 112;
    const q1y = py(group.q1), q3y = py(group.q3), medy = py(group.median);
    s += line(cx, py(group.high), cx, q3y, { stroke: ink, width: 2.5 });
    s += line(cx, q1y, cx, py(group.low), { stroke: ink, width: 2.5 });
    s += line(cx - 26, py(group.high), cx + 26, py(group.high), { stroke: ink, width: 2.5 });
    s += line(cx - 26, py(group.low), cx + 26, py(group.low), { stroke: ink, width: 2.5 });
    s += `<rect x="${cx - boxW / 2}" y="${q3y}" width="${boxW}" height="${q1y - q3y}" fill="${group.color}" fill-opacity=".26" stroke="${group.color}" stroke-width="3"/>`;
    s += line(cx - boxW / 2, medy, cx + boxW / 2, medy, { stroke: ink, width: 4 });
    s += `<circle cx="${cx}" cy="${py(group.mean)}" r="6" fill="#fff" stroke="${group.color}" stroke-width="3"/>`;
    const outliers = group.values.filter(v => v < group.low || v > group.high);
    outliers.forEach((value, i) => {
      const jitter = ((i * 17) % 31) - 15;
      s += `<circle cx="${cx + jitter}" cy="${py(value)}" r="4.5" fill="${group.color}" fill-opacity=".72"/>`;
    });
    s += text(cx, 748, group.label, 30, { weight: 700 });
  });
  figure('图6-4-三条件初始上下文Token箱线图', w, h, '三种条件下初始上下文 Token 的逐题分布', s);
}

// 6-6: a matrix preserves the mixed direction across question categories.
{
  const rows = [
    ['现有功能解释', [.80, 1.00, 1.00]],
    ['跨模块调用与数据流', [.90, .70, .95]],
    ['权限与业务约束', [.80, .90, .90]],
    ['变更影响分析', [.75, .75, .85]],
    ['规格与实现核对', [.90, .90, .85]],
  ];
  const cols = ['非 KG', 'WPW-Map', '完整 WPW'];
  let s = '';
  const x0 = 570, y0 = 174, cellW = 250, rowH = 112;
  cols.forEach((col, i) => s += text(x0 + cellW * (i + .5), 102, col, 28, { fill: muted }));
  rows.forEach(([label, values], i) => {
    const yy = y0 + i * rowH;
    s += text(520, yy + rowH / 2, label, 26, { anchor: 'end' });
    const best = Math.max(...values);
    values.forEach((value, j) => {
      const xx = x0 + j * cellW;
      const opacity = .08 + ((value - .7) / .3) * .34;
      s += `<rect x="${xx + 5}" y="${yy + 5}" width="${cellW - 10}" height="${rowH - 10}" rx="3" fill="${accent}" fill-opacity="${opacity.toFixed(3)}" stroke="${value === best ? accent : grid}" stroke-width="${value === best ? 4 : 1.5}"/>`;
      s += text(xx + cellW / 2, yy + rowH / 2 - 4, `${Math.round(value * 100)}%`, 34, { weight: 600 });
      s += text(xx + cellW / 2, yy + rowH / 2 + 31, `${Math.round(value * 20)}/20`, 20, { fill: muted });
    });
  });
  s += text(944, 790, '粗边框表示该问题类型的最高通过率（并列最高均标出）。', 23, { fill: muted });
  figure('图6-6-问题类型与条件问答通过率热力图', 1420, 850, '不同问题类型下三种条件的盲评问答通过率', s);
}

// 6-5: shared-scale dumbbell plots make the size and significance of each comparison visible.
{
  let s = '';
  const comparisons = [
    { x: 55, pair: '非 KG（BM25）  →  WPW-Map', before: [.483, .617, .126], after: [.666, .798, .182], p: ['0.0032', '0.00077', '0.00045'], color: '#39745b', fill: '#edf5ef' },
    { x: 975, pair: 'WPW-Map  →  完整 WPW', before: [.666, .798, .182], after: [.692, .815, .185], p: ['0.238', '0.608', '0.487'], color: muted, fill: '#f4f6f6' },
  ];
  const metrics = [
    { label: 'Recall@5', delta: '+0.183 / +0.026' },
    { label: 'Recall@10', delta: '+0.181 / +0.017' },
    { label: 'Precision@10', delta: '+0.056 / +0.003' },
  ];
  const plotX = x => x + 185, plotW = 485, mapX = (x, value) => plotX(x) + value * plotW;
  s += `<circle cx="520" cy="43" r="9" fill="#fff" stroke="${ink}" stroke-width="3"/>`;
  s += text(542, 43, '比较前', 23, { anchor: 'start' });
  s += `<circle cx="690" cy="43" r="9" fill="${ink}" stroke="${ink}" stroke-width="2"/>`;
  s += text(712, 43, '比较后', 23, { anchor: 'start' });
  s += line(875, 43, 925, 43, { stroke: '#39745b', width: 5 });
  s += text(938, 43, 'Holm p < 0.05', 23, { anchor: 'start' });
  s += line(1115, 43, 1165, 43, { stroke: muted, width: 5 });
  s += text(1178, 43, 'Holm p ≥ 0.05', 23, { anchor: 'start' });
  comparisons.forEach((item) => {
    s += rect(item.x, 88, 870, 800, { fill: '#fff', stroke: grid, width: 2 });
    s += text(item.x + 34, 145, item.pair, 30, { anchor: 'start', weight: 700, fill: ink });
    metrics.forEach((metric, i) => {
      const y = 310 + i * 170;
      const x1 = mapX(item.x, item.before[i]), x2 = mapX(item.x, item.after[i]);
      s += text(item.x + 32, y - 48, metric.label, 26, { anchor: 'start', weight: 700 });
      s += line(plotX(item.x), y + 48, plotX(item.x) + plotW, y + 48, { stroke: grid, width: 1.5 });
      s += line(x1, y + 10, x2, y + 10, { stroke: item.color, width: 8 });
      s += `<circle cx="${x1}" cy="${y + 10}" r="10" fill="#fff" stroke="${item.color}" stroke-width="4"/>`;
      s += `<circle cx="${x2}" cy="${y + 10}" r="10" fill="${item.color}" stroke="${item.color}" stroke-width="3"/>`;
      const close = Math.abs(x2 - x1) < 55;
      s += text(close ? x1 - 14 : x1, y - 20, item.before[i].toFixed(3), 22, { anchor: close ? 'end' : 'middle', weight: 600 });
      s += text(close ? x2 + 14 : x2, y - 20, item.after[i].toFixed(3), 22, { anchor: close ? 'start' : 'middle', weight: 600 });
      s += text(item.x + 32, y + 76, `p = ${item.p[i]}`, 24, { anchor: 'start', fill: muted });
      s += text(item.x + 836, y + 4, metric.delta.split(' / ')[comparisons.indexOf(item)], 24, { anchor: 'end', weight: 700, fill: item.color });
    });
    for (const tick of [0, .25, .5, .75, 1]) {
      const xx = mapX(item.x, tick);
      s += line(xx, 800, xx, 810, { stroke: muted, width: 1.5 });
      s += text(xx, 835, tick.toFixed(2), 22, { fill: muted });
    }
    s += line(plotX(item.x), 800, plotX(item.x) + plotW, 800, { stroke: muted, width: 1.5 });
  });
  figure('图6-5-场景检索的机制对比', 1900, 920, '场景检索的机制对比哑铃图', s);
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((name) => name.trim())) : null;
for (const fig of figures) {
  if (only && !only.has(fig.base)) continue;
  await fs.writeFile(path.join(outDir, `${fig.base}.svg`), fig.svg, 'utf8');
  await sharp(Buffer.from(fig.svg)).resize(fig.width * 2, fig.height * 2).png().toFile(path.join(outDir, `${fig.base}.png`));
  console.log(`${fig.base}: ${fig.width} x ${fig.height} -> PNG ${fig.width * 2} x ${fig.height * 2}`);
}
