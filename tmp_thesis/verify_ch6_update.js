#!/usr/bin/env node
/** verify_ch6_update.js — 第 6 章/附录/第 7 章 v5 更新后的逐数对账 */
const fs = require('fs');
const sc = JSON.parse(fs.readFileSync('论文/关键词召回实验数据_v5/qa_runs_autonomous_scored.json', 'utf8'));
const st = JSON.parse(fs.readFileSync('论文/关键词召回实验数据_v5/statistics.json', 'utf8'));
// 只校验可见正文：剥掉 HTML 注释（含“旧值→新值”说明）与表格粗体标记
const visible = (p) => fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '');
const ch6 = visible('论文/6.系统测试与结果分析.md');
const ap = visible('论文/附录.md');
const ch7 = visible('论文/7.总结与展望.md');
let fail = 0;
const chk = (name, cond) => { console.log((cond ? '✓ ' : '✗ ') + name); if (!cond) fail++; };

const d = (c) => st.qa.descriptive[c].cumulative_context_tokens;
chk('表6-11 非KG行', ch6.includes('19,212 [10,361, 32,816] | 39,054'));
chk('表6-11 WPW-Map行', ch6.includes('7,317 [4,201, 17,188] | 27,286'));
chk('表6-11 完整行', ch6.includes('15,772 [6,648, 29,988] | 25,270'));
chk('表D-3 三行', ap.includes('19,212 [10,361, 32,816]') && ap.includes('7,317 [4,201, 17,188]') && ap.includes('15,772 [6,648, 29,988]'));

const nk = d('non_kg').mean, wm = d('wpw_map').mean, fw = d('full_wpw').mean;
chk('35.30% 一致且写入 ch6/ap/ch7', ((nk - fw) / nk * 100).toFixed(2) === '35.30' && ch6.includes('35.30%') && ap.includes('35.30%') && ch7.includes('35.30%'));
chk('7.39% 一致且写入 ch6/ap', ((wm - fw) / wm * 100).toFixed(2) === '7.39' && ch6.includes('7.39%') && ap.includes('7.39%'));

const cats = {};
for (const r of sc) { cats[r.category] = cats[r.category] || {}; cats[r.category][r.condition] = 0; }
for (const r of sc) if (r.judge_pass) cats[r.category][r.condition]++;
const rows = { '现有功能解释': [16, 20, 20], '跨模块调用与数据流': [18, 14, 19], '权限与业务约束': [16, 18, 18], '变更影响分析': [15, 15, 17], '规格与实现核对': [18, 18, 17] };
for (const [cat, [a, b, c]] of Object.entries(rows)) {
  chk('分类 ' + cat + ' 数据=' + cats[cat].non_kg + '/' + cats[cat].wpw_map + '/' + cats[cat].full_wpw, cats[cat].non_kg === a && cats[cat].wpw_map === b && cats[cat].full_wpw === c);
  const pat = a + '/20（' + Math.round(a / 20 * 100) + '%） | ' + b + '/20（' + Math.round(b / 20 * 100) + '%） | ' + c + '/20（' + Math.round(c / 20 * 100) + '%）';
  chk('表6-12 ' + cat, ch6.includes(pat));
  chk('表D-4 ' + cat, ap.includes(pat));
}

chk('Cochran 4.00 p=0.135', ch6.includes('Q(2)=4.00（p=0.135）'));
chk('Friedman 16.62', ch6.includes('χ²(2)=16.62'));
chk('Holm 0.0008', ch6.includes('p=0.0008'));
chk('Holm 0.039', ch6.includes('p=0.039'));
chk('Holm 0.239', ch6.includes('p=0.239'));
chk('Friedman 0.827', ch6.includes('p=0.827'));
chk('检索 p 0.0023/0.00033/0.00045', ch6.includes('0.0023、0.00033 和 0.00045'));
chk('检索 rb 0.729/0.844/0.846', ch6.includes('0.729、0.844 和 0.846'));
chk('表C-4 新值', ap.includes('| 17.034 | <0.001 | 0.0023 | 0.729 |') && ap.includes('| 20.138 |') && ap.includes('| 19.000 |'));

const stale = ['35.44', '7.06%', '0.0020、', '0.00050 和', '0.00028', '16.851', '19.140', '19.271', '0.866', '累计上下文 Token 相对非 KG 减少 35'];
for (const s of stale) chk('陈旧数已清除: ' + s, !ch6.includes(s) && !ap.includes(s) && !ch7.includes(s));

// 旧 Token 值只允许出现在 D.1（32 题中间过程表）
const mainAp = ap.split('### D.1')[0] + (ap.split('### D.2')[1] || '');
chk('旧 Token 值仅存于 D.1', !mainAp.includes('11,708') && !mainAp.includes('25,204') && !mainAp.includes('39,038') && !mainAp.includes('27,118'));

const d2 = (ap.split('### D.2')[1] || '').split('## 附录 E')[0];
const d8rows = d2.split('\n').filter((l) => /^\| Q\d-\d{2} \| .+ \| (通过|未通过)（/.test(l));
chk('表D-8 行数 100', d8rows.length === 100);
const colCount = { non_kg: 0, wpw_map: 0, full_wpw: 0 };
for (const l of d8rows) {
  const c = l.split('|');
  if (c[3].startsWith(' 通过（')) colCount.non_kg++;
  if (c[4].startsWith(' 通过（')) colCount.wpw_map++;
  if (c[5].startsWith(' 通过（')) colCount.full_wpw++;
}
chk('表D-8 列合计 83/85/91', colCount.non_kg === 83 && colCount.wpw_map === 85 && colCount.full_wpw === 91);

chk('表6-2 模型区分', ch6.includes('场景问答用 gpt-5.4-mini'));
chk('D.2 节存在', ap.includes('### D.2 100 题终版逐题记录'));
chk('表E-1 目录更新', ap.includes('关键词召回实验数据_v5/（100 题问答终版）') || ap.includes('关键词召回实验数据_v5/' + String.fromCharCode(96) + '（100 题问答终版）'));

console.log(fail ? '\n' + fail + ' 项失败' : '\n全部对账通过');
process.exit(fail ? 1 : 0);
