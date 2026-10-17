const fs = require('fs');
const files = ['E:/project/web-project-workflow/论文/附录.md', 'E:/project/web-project-workflow/论文/6.系统测试与结果分析.md'];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let block = null, bad = 0, tables = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\|/.test(l)) {
      const n = (l.match(/\|/g) || []).length;
      if (block === null) { block = { n, rows: 1 }; tables++; }
      else if (n !== block.n) { console.log(f.split('/').pop(), '列数不一致 line', i + 1, '期望', block.n, '实际', n, '|', l.slice(0, 100)); bad++; }
      else block.rows++;
    } else block = null;
  }
  console.log(f.split('/').pop(), '表格数:', tables, '异常行:', bad);
}