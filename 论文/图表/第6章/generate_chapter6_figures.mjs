/** Canonical 1800 px / 48 px thesis layouts. Requires Python 3, Pillow and Matplotlib (Chapter 6). */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const all=["6-1", "6-2", "6-3", "6-4", "6-5"];
const supplied=process.argv.slice(2);
const names=supplied.length ? supplied : (process.env.ONLY ? process.env.ONLY.split(',').map(s=>s.trim()) : all);
const selected=names.map(name=>{
  const match=/^(?:\u56fe)?(6-\d+)(?:-|$)/.exec(name);
  if (!match || !all.includes(match[1])) throw new Error(`Unknown figure: ${name}`);
  return match[1];
});
const windows=process.platform==='win32';
for (const [script,keys] of [["render_later_thesis_figures.py", ["6-2"]], ["render_thesis_experiment_charts.py", ["6-1", "6-3", "6-4", "6-5"]]]) {
  const chosen=selected.filter(key=>keys.includes(key));
  if (!chosen.length) continue;
  const result=spawnSync(windows?'py':'python3', [...(windows?['-3']:[]),'-X','utf8',path.join(root,'scripts',script),...chosen],
    {cwd:root,stdio:'inherit',windowsHide:true});
  if (result.error) throw result.error;
  if (result.status!==0) process.exit(result.status ?? 1);
}
