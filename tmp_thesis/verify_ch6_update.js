#!/usr/bin/env node
/** verify_ch6_update.js — 第 6 章/附录/第 7 章 v5 更新后的逐数对账 */
const fs = require('fs');
const sc = JSON.parse(fs.readFileSync('论文/辅助材料/关键词召回实验数据_v5/qa_runs_autonomous_scored.json', 'utf8'));
const st = JSON.parse(fs.readFileSync('论文/辅助材料/关键词召回实验数据_v5/statistics.json', 'utf8'));
// 只校验可见正文：剥掉 HTML 注释（含“旧值→新值”说明）与表格粗体标记
const visible = (p) => fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '');
const ch6 = visible('论文/6.系统测试与结果分析.md');
const ap = visible('论文/附录.md');
const ch7 = visible('论文/7.总结与展望.md');
let fail = 0;
const chk = (name, cond) => { console.log((cond ? '✓ ' : '✗ ') + name); if (!cond) fail++; };

const byCond = (c) => sc.filter((r) => r.condition === c);
const meanInit = (c) => byCond(c).reduce((s, r) => s + r.context_tokens + r.navigation_tokens, 0) / byCond(c).length;
const meanInput = (c) => byCond(c).reduce((s, r) => s + r.usage.input_tokens, 0) / byCond(c).length;
chk('表6-10 非KG行', ch6.includes('2,465 [1,770, 4,773] | 3,698 | 87,207'));
chk('表6-10 WPW-Map行', ch6.includes('1,763 [1,058, 2,863] | 2,298 | 86,949'));
chk('表6-10 完整行', ch6.includes('2,091 [1,273, 3,090] | 2,690 | 84,524'));
chk('表D-3 三行', ap.includes('2,465 [1,770, 4,773]') && ap.includes('1,763 [1,058, 2,863]') && ap.includes('2,091 [1,273, 3,090]'));
chk('初始上下文均值与表一致', Math.round(meanInit('non_kg')) === 3698 && Math.round(meanInit('wpw_map')) === 2298 && Math.round(meanInit('full_wpw')) === 2690);
chk('模型输入均值与表一致', Math.round(meanInput('non_kg')) === 87207 && Math.round(meanInput('wpw_map')) === 86949 && Math.round(meanInput('full_wpw')) === 84524);

const cats = {};
for (const r of sc) { cats[r.category] = cats[r.category] || {}; cats[r.category][r.condition] = 0; }
for (const r of sc) if (r.judge_pass) cats[r.category][r.condition]++;
const rows = { '现有功能解释': [16, 20, 20], '跨模块调用与数据流': [18, 14, 19], '权限与业务约束': [16, 18, 18], '变更影响分析': [15, 15, 17], '规格与实现核对': [18, 18, 17] };
for (const [cat, [a, b, c]] of Object.entries(rows)) {
  chk('分类 ' + cat + ' 数据=' + cats[cat].non_kg + '/' + cats[cat].wpw_map + '/' + cats[cat].full_wpw, cats[cat].non_kg === a && cats[cat].wpw_map === b && cats[cat].full_wpw === c);
  const pat = a + '/20（' + Math.round(a / 20 * 100) + '%） | ' + b + '/20（' + Math.round(b / 20 * 100) + '%） | ' + c + '/20（' + Math.round(c / 20 * 100) + '%）';
  chk('表D-4 ' + cat, ap.includes(pat));
}
chk('正文分类别内容已移除', !ch6.includes('表6-11 不同问题类型的问答通过率') && !ch6.includes('逐类数据见附录表D-4') && !ch6.includes('按问题类型拆分'));
chk('正文热力图已移除', !ch6.includes('问题类型 × 条件问答通过率热力图'));
chk('表6-11 已移除', !ch6.includes('表6-11 场景检索的机制对比结果') && !ch6.includes('| 机制与对比 |'));
chk('6.3.2 已移除', !ch6.includes('### 6.3.2') && !ch6.includes('统计口径与有效性限制'));
chk('图6-1 为 T1—T3 对比图', ch6.includes('图6-1 T1—T3 八任务模型总 Token 对比') && !ch6.includes('本章证据链'));
chk('图6-5 为机制对比图', ch6.includes('图6-5 场景检索的机制对比') && !ch6.includes('场景机制消融关系图'));
chk('本章 5 幅插图', ch6.includes('本章共 5 幅插图'));
chk('系统名统一为 WPW', !/完整 wpw|wpw 的|wpw 系统|wpw 与|\| wpw \|/.test(ch6));
for (const f of ['图6-1-T1-T3八任务模型总Token对比.png', '图6-2-题集与条件配对示意.png', '图6-3-按查询类别的检索结果.png', '图6-4-三条件初始上下文Token箱线图.png', '图6-5-场景检索的机制对比.png']) {
  chk('图文件存在 ' + f, fs.existsSync('论文/图表/第6章/' + f));
}

chk('Cochran 公式 6-7', ch6.includes('tag{6-7}') && ch6.includes('Q_{\\mathrm{C}}'));
chk('Cochran 4.00 p=0.135', ch6.includes('Q_{\\mathrm{C}}(2)=4.00') && ch6.includes('p=0.135'));
chk('初始上下文 Friedman 20.48', ch6.includes('chi^2(2)=20.48'));
chk('初始上下文 Holm 0.014', ch6.includes('Holm 校正 $p=0.014$'));
chk('初始上下文 Holm 0.123', ch6.includes('Holm 校正 $p=0.123$'));
chk('模型输入 Friedman 0.98 p=0.613', ch6.includes('chi^2(2)=0.98') && ch6.includes('p=0.613'));
chk('模型总 Token Friedman 0.827', ch6.includes('chi^2(2)=0.38') && ch6.includes('p=0.827'));
chk('检索 p 0.0023/0.00033/0.00045', ch6.includes('0.0023、0.00033 和 0.00045'));
chk('检索 WPW-Map vs 非KG p', ch6.includes('0.0032、0.00077 和 0.00045'));
chk('检索 完整 vs WPW-Map p', ch6.includes('0.238、0.608 和 0.487'));
chk('检索 rb 0.729/0.844/0.846', ch6.includes('0.729、0.844 和 0.846'));
chk('表C-4 新值', ap.includes('| 17.034 | <0.001 | 0.0023 | 0.729 |') && ap.includes('| 20.138 |') && ap.includes('| 19.000 |'));
chk('附录C-4 其余两对', ap.includes('0.0032、0.00077、0.00045') && ap.includes('0.238、0.608、0.487'));

const stale = ['35.44', '7.06%', '0.0020、', '0.00050 和', '0.00028', '16.851', '19.140', '19.271', '0.866', '累计上下文 Token 相对非 KG 减少 35', '35.30', '7.39', 'χ²(2)=16.62', 'p=0.0008', 'p=0.039', 'p=0.239', '19,212', '7,317', '15,772', '27,286', '25,270', '39,054'];
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
chk('表E-1 目录更新', ap.includes('辅助材料/关键词召回实验数据_v5/（100 题问答终版）') || ap.includes('辅助材料/关键词召回实验数据_v5/' + String.fromCharCode(96) + '（100 题问答终版）'));

console.log(fail ? '\n' + fail + ' 项失败' : '\n全部对账通过');
process.exit(fail ? 1 : 0);
