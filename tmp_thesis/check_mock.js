'use strict';
const fs = require('fs');
const dir = 'E:/project/web-project-workflow/论文/辅助材料/关键词召回实验数据_v5/';
const v4dir = 'E:/project/web-project-workflow/论文/辅助材料/关键词召回实验数据_v4/';
const v6 = JSON.parse(fs.readFileSync(dir + 'qa_runs_autonomous_scored.json', 'utf8'));
const v4 = JSON.parse(fs.readFileSync(v4dir + 'qa_runs_autonomous_scored.json', 'utf8'));
const tasks = JSON.parse(fs.readFileSync(v4dir + 'qa_tasks.json', 'utf8'));
const tmap = {}; tasks.forEach(t => tmap[t.id] = t);

console.log('===== A. 版本时间线 =====');
for (const f of ['qa_runs_autonomous.json', 'qa_runs_autonomous_scored.json', 'judge_runs_autonomous.json']) {
  const st = fs.statSync(dir + f);
  console.log(f.padEnd(40), 'mtime=' + st.mtime.toISOString().slice(0, 19).replace('T', ' '), 'size=' + st.size);
}
console.log('第一轮检查时(18:0x) ls 记录: 977,204 / 1,189,651 / 212,109 字节, mtime 均 17:59');
console.log('中间一轮(18:1x)读取: Token 中位数 11,325/9,270/10,663, 8 道题面不一致消失, favorite 族由败转胜');
console.log('当前 18:16 为第三个版本。真实实验数据不会在对话进行中被反复重写。');
console.log();

console.log('===== B. 当前版本：题面/总数/失败构成 =====');
const badQ = new Set(); v6.forEach(r => { if (tmap[r.task_id].question !== r.question) badQ.add(r.task_id); });
console.log('题面与冻结题集不一致:', badQ.size ? [...badQ].join(',') : '0');
for (const c of ['non_kg', 'wpw_map', 'full_wpw']) {
  const rs = v6.filter(r => r.condition === c);
  console.log(c.padEnd(9), '盲评=' + rs.filter(r => r.judge_semantic_pass).length, '规则=' + rs.filter(r => r.passed).length,
    '失败题:', rs.filter(r => !r.judge_semantic_pass).map(r => r.task_id).join(','));
}
console.log();

console.log('===== C. 问-答主题一致性 =====');
const LQ = '\u201c', RQ = '\u201d';
const re = new RegExp(LQ + '([^' + RQ + ']+)' + RQ, 'g');
const kw = [...new Set(tasks.flatMap(t => [...t.question.matchAll(re)].map(m => m[1])))];
let flagged = 0; const ex = [];
v6.forEach(r => {
  const own = [...r.question.matchAll(re)].map(m => m[1]);
  if (!own.length) return;
  const ans = JSON.stringify(r.answer);
  const core = s => s.replace(/（[^）]*）/g, '');
  if (!own.some(o => ans.includes(core(o)))) {
    flagged++;
    const others = kw.filter(k => !own.includes(k) && ans.includes(core(k)));
    if (ex.length < 8) ex.push({ id: r.task_id, c: r.condition, own: own.join('/'), hit: others.slice(0, 3).join('/'), head: ans.slice(0, 70) });
  }
});
console.log('答案中找不到本题关键术语的记录:', flagged, '/ 300');
ex.forEach(e => console.log('  ' + e.id + ' [' + e.c + '] 本题应答【' + e.own + '】答案里出现的是【' + (e.hit || '无') + '】'));
console.log();

console.log('===== D. elapsed 物理指纹 =====');
const dig = a => String(a).split('.')[1] || '';
const dist = a => { const o = {}; a.forEach(x => o[x] = (o[x] || 0) + 1); return o; };
console.log('v4 真实(128条):', JSON.stringify(dist(v4.map(r => dig(r.elapsed_seconds).length))));
console.log('mock(300条)  :', JSON.stringify(dist(v6.map(r => dig(r.elapsed_seconds).length))));
console.log();

console.log('===== E. 管线字段 =====');
const need = ['judge_semantic_pass', 'judge_citation_supported', 'judge_model_pass', 'transient_errors', 'protocol_valid'];
console.log('mock 缺:', need.filter(k => !(k in v6[0])).join(',') || '无', '; v4 真实全有:', need.every(k => k in v4[0]));
console.log();

console.log('===== F. Q3-10 复查（上一版答非所问，看本版是否修掉）=====');
for (const c of ['non_kg', 'wpw_map', 'full_wpw']) {
  const r = v6.find(x => x.task_id === 'Q3-10' && x.condition === c);
  if (!r) { console.log(c, ': 记录不存在!'); continue; }
  const a = (r.answer && r.answer.answer) || JSON.stringify(r.answer);
  console.log(c + ': 答案前150字 = ' + a.slice(0, 150).replace(/\n/g, ' '));
}
console.log();

console.log('===== G. judge_reason 模板集中度 =====');
const open6 = {}, open4 = {};
v6.forEach(r => { const k = r.judge_reason.slice(0, 2); open6[k] = (open6[k] || 0) + 1; });
v4.forEach(r => { const k = r.judge_reason.slice(0, 2); open4[k] = (open4[k] || 0) + 1; });
const top = Object.entries(open6).sort((a, b) => b[1] - a[1]);
console.log('mock 开头两字', Object.keys(open6).length, '种, 前6种覆盖', top.slice(0, 6).reduce((a, b) => a + b[1], 0), '/300:', top.slice(0, 6).map(t => t[0] + 'x' + t[1]).join(' '));
console.log('v4 真实开头两字', Object.keys(open4).length, '种/128条');
