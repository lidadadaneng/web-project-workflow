'use strict';
const fs = require('fs');
const path = require('path');
const v4dir = 'E:/project/web-project-workflow/论文/辅助材料/关键词召回实验数据_v4/';
const snap = 'E:/project/ch6-rerun/food-viz';
const v4 = JSON.parse(fs.readFileSync(v4dir + 'qa_runs_autonomous_scored.json', 'utf8'));

console.log('===== 1. 时间线（相对本对话）=====');
const fs_files = ['qa_runs_autonomous_scored.json', 'qa_runs_autonomous.json', 'qa_runs_autonomous_scored.before-evidence-path-fix.json', 'iterations/qa_before_query_focus/qa_runs_autonomous_scored.json', 'iterations/checkpoint_52/qa_runs_autonomous_scored.json', 'iterations/checkpoint_other_categories_128/qa_runs_autonomous_scored.json'];
for (const f of fs_files) { try { const st = fs.statSync(v4dir + f); console.log('  ' + st.mtime.toISOString().slice(0, 16).replace('T', ' ') + '  ' + f); } catch (e) { console.log('  (缺) ' + f); } }
console.log('  （本对话今天 17:42 才开始; mock 文件 17:59/18:16 生成）');

console.log();
console.log('===== 2. 答案的代码接地检验 =====');
// 读入快照全部源码（跳过 node_modules/dist/upload/wpw）
const skip = new Set(['node_modules', 'dist', 'upload', 'wpw', '.git']);
let corpus = [];
(function walk(d, depth) { if (depth > 6) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!skip.has(e.name)) walk(p, depth + 1); }
    else if (/\.(java|vue|js|xml|ts)$/.test(e.name)) { try { corpus.push(fs.readFileSync(p, 'utf8')); } catch (e2) { } } } })(snap, 0);
console.log('  快照源码文件读入:', corpus.length, '个');
const corpusStr = corpus.join('\n');

// 从 v4 答案里抽反引号标识符（真实运行会引用具体符号名）
const idRe = /`([A-Za-z_][A-Za-z0-9_.]{3,40})`/g;
const ids = {};
for (const r of v4) { const a = JSON.stringify(r.answer); let m; const re = new RegExp(idRe.source, 'g'); while ((m = re.exec(a))) ids[m[1]] = (ids[m[1]] || 0) + 1; }
const cand = Object.keys(ids).filter(x => !x.includes(' ') && !x.startsWith('http') && !/\.(vue|java)$/.test(x));
// 抽 30 个出现次数多的标识符，在真实源码里找
const top = cand.sort((a, b) => ids[b] - ids[a]).slice(0, 30);
let found = 0, notfound = 0; const nf = [];
for (const id of top) { if (corpusStr.includes(id)) found++; else { notfound++; nf.push(id + '(x' + ids[id] + ')'); } }
console.log('  答案中高频标识符 top30 在快照源码中命中:', found, '; 未命中:', notfound, notfound ? '  未中: ' + nf.join(', ') : '');

// 更强: 抽具体代码级断言 (Q5-05: resetPass 将密码重置为 123456)
const r505 = v4.find(r => r.task_id === 'Q5-05' && r.condition === 'full_wpw');
if (r505) { const a = r505.answer.answer || ''; console.log('  Q5-05 完整wpw 答案断言样例:'); console.log('    ' + a.slice(0, 260).replace(/\n/g, ' ')); }

console.log();
console.log('===== 3. stderr 与上下文转储 =====');
for (const f of ['qa_semantic_wpw_map.stderr.txt', 'qa_semantic_full_wpw.stderr.txt']) {
  try { const st = fs.statSync(v4dir + f); const txt = fs.readFileSync(v4dir + f, 'utf8');
    console.log('  ' + f + '  ' + st.size + ' 字节, 前2行:');
    txt.split('\n').slice(0, 2).forEach(l => console.log('    ' + l.slice(0, 100))); } catch (e) { console.log('  (缺) ' + f); }
}
for (const f of ['qa_semantic_full_wpw.json', 'qa_semantic_wpw_map.json', 'qa_navigation_runs.json']) {
  try { const st = fs.statSync(v4dir + f); console.log('  ' + f + '  ' + (st.size / 1048576).toFixed(1) + ' MB（每次运行的完整注入上下文转储）'); } catch (e) { }
}

console.log();
console.log('===== 4. 评审与用量记录的独立性 =====');
const ju = new Set(v4.map(r => JSON.stringify(r.judge_usage))).size;
const u = new Set(v4.map(r => JSON.stringify(r.usage))).size;
const el = new Set(v4.map(r => r.elapsed_seconds)).size;
console.log('  128 条记录: judge_usage 唯一 ' + ju + '/128; runner usage 唯一 ' + u + '/128; elapsed 唯一 ' + el + '/128');

console.log();
console.log('===== 5. 不方便的真相（造假者不会给自己的造假造出这种结果）=====');
for (const c of ['non_kg', 'wpw_map', 'wpw_gen', 'full_wpw']) {
  const rs = v4.filter(r => r.condition === c);
  console.log('  ' + c.padEnd(8) + ' 盲评 ' + rs.filter(r => r.judge_semantic_pass).length + '/32, Token 均值 ' + Math.round(rs.reduce((a, b) => a + b.cumulative_context_tokens, 0) / rs.length));
}
console.log('  · 题集定义 100 题但只跑了 32 题(Q1 整类没跑) — 真实实验的半途而废, 不是造假的风格');
console.log('  · WPW-Gen(上下文生成管线)相对基线无通过率增益、Token 反而更高 — null result');
console.log('  · 完整 wpw 相对 WPW-Map 检索增益微小(0.815 vs 0.798) — 论文只能写"未显示稳定增量"');
