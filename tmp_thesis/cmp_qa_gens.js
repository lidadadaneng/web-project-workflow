const fs = require('fs');
const base = 'E:/project/web-project-workflow/论文/';
const sets = [
  ['v1 原始 100 题', base + '关键词召回实验数据/qa_runs_autonomous_scored.json'],
  ['v4 迭代·聚焦前 100 题', base + '关键词召回实验数据_v4/iterations/qa_before_query_focus/qa_runs_autonomous_scored.json'],
  ['v4 迭代·聚焦后 100 题', base + '关键词召回实验数据_v4/iterations/qa_query_focused_one_read/qa_runs_autonomous_scored.json'],
  ['v4 正式 32 题', base + '关键词召回实验数据_v4/qa_runs_autonomous_scored.json'],
];
const CONDS = ['non_kg', 'wpw_map', 'wpw_gen', 'full_wpw'];
const isSubset32 = tid => {
  const m = /^Q([2-5])-(\d+)$/.exec(tid);
  return !!m && Number(m[2]) <= 8;
};
for (const [label, f] of sets) {
  if (!fs.existsSync(f)) { console.log(label, '文件不存在'); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const all = {}, sub = {};
  for (const c of CONDS) {
    const v = j.filter(r => r.condition === c);
    if (!v.length) continue;
    all[c] = v.filter(r => r.judge_pass === true).length + '/' + v.length;
    const s = v.filter(r => isSubset32(r.task_id));
    sub[c] = s.filter(r => r.judge_pass === true).length + '/' + s.length;
  }
  const med = c => {
    const v = j.filter(r => r.condition === c).map(r => r.cumulative_context_tokens).filter(x => typeof x === 'number').sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) / 2)] : '-';
  };
  console.log(label);
  console.log('   全部题  盲评通过:', JSON.stringify(all));
  console.log('   同 32 题 盲评通过:', JSON.stringify(sub));
  console.log('   上下文 Token 中位数:', CONDS.map(c => c + '=' + med(c)).join(' '));
}