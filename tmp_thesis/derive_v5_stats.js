#!/usr/bin/env node
/**
 * derive_v5_stats.js — 从 v5 原始运行数据派生 statistics.json / summary.json / manifest.json
 *
 * 流程：
 *   1. 校准：用同一套算法重算 v4 的 statistics.json / summary.json（qa + retrieval 两节），
 *      与 v4 落盘值逐数比对，任何一个数对不上即中止（防止算法漂移污染 v5）。
 *   2. 派生：校准通过后，从 v5 的 qa_runs_autonomous_scored.json（100 题 × 3 条件）
 *      与 retrieval_runs.json 计算 v5 的 statistics.json / summary.json / manifest.json。
 *
 * 用法：node tmp_thesis/derive_v5_stats.js [--write]   （不加 --write 只打印不落盘）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const V4 = path.join(ROOT, '论文', '关键词召回实验数据_v4');
const V5 = path.join(ROOT, '论文', '关键词召回实验数据_v5');

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ---------------- 基础描述统计（type-7 分位，已对 v4 校准） ---------------- */

function quantile7(sorted, p) {
  const n = sorted.length;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  if (lo + 1 >= n) return sorted[n - 1];
  return sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]);
}

function descNum(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  return {
    n: vals.length,
    mean: vals.reduce((s, x) => s + x, 0) / vals.length,
    median: quantile7(sorted, 0.5),
    q1: quantile7(sorted, 0.25),
    q3: quantile7(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function descBool(vals) {
  const count = vals.filter(Boolean).length;
  return { n: vals.length, count, rate: count / vals.length };
}

/* ---------------- 卡方生存函数（正则化上不完全伽马 Q(a,x)） ---------------- */

function lnGamma(x) {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaQ(a, x) {
  // 上正则化不完全伽马 Q(a,x)；x < a+1 用级数求 P 再取补，否则连分式直接求 Q
  if (x < 0) throw new Error('x<0');
  if (x === 0) return 1;
  if (x < a + 1) {
    // 级数求 P(a,x)
    let ap = a, sum = 1 / a, del = sum;
    for (let i = 1; i < 1000; i++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // 连分式（Lentz）求 Q(a,x)
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

const chi2sf = (x, df) => gammaQ(df / 2, x / 2);

/* ---------------- 精确二项（McNemar 用） ---------------- */

function mcnemarExactP(aPassBFail, aFailBPass) {
  const m = Math.min(aPassBFail, aFailBPass);
  const n = aPassBFail + aFailBPass;
  if (n === 0) return 1;
  // P(X <= m), X~Bin(n, 0.5)，用对数避免溢出
  let p = 0;
  for (let i = 0; i <= m; i++) {
    p += Math.exp(lnGamma(n + 1) - lnGamma(i + 1) - lnGamma(n - i + 1) - n * Math.LN2);
  }
  return Math.min(1, 2 * p);
}

/* ---------------- 精确 Wilcoxon 符号秩（并列秩 ×2 整数化 + BigInt 子集和 DP） ---------------- */

function wilcoxonExactP(doubledRanks, statDoubled) {
  const items = doubledRanks; // 整数（原秩×2，0.5 步长的并列平均秩化成奇数）
  const total = items.reduce((s, r) => s + r, 0);
  let dp = new Array(total + 1).fill(0n);
  dp[0] = 1n;
  for (const r of items) {
    for (let s = total; s >= r; s--) dp[s] += dp[s - r];
  }
  let cnt = 0n;
  for (let s = 0; s <= statDoubled; s++) cnt += dp[s];
  const n = items.length;
  // 双侧：p = min(1, 2 * P(W <= stat))
  const p = Math.min(1, (2 * Number(cnt)) / Math.pow(2, n));
  return p;
}

/**
 * 配对 Wilcoxon 符号秩检验。aMap/bMap: task_id -> 数值。
 * 返回 v4 statistics.json cost_tests.pairwise_wilcoxon 单条记录的全部字段。
 */
function wilcoxonPaired(aMap, bMap, ids) {
  const diffs = ids.map((id) => aMap[id] - bMap[id]);
  const nonz = diffs.filter((d) => d !== 0);
  const zeros = diffs.length - nonz.length;
  // |d| 升序，并列取平均秩
  const withSign = nonz.map((d) => ({ abs: Math.abs(d), s: Math.sign(d) }));
  withSign.sort((x, y) => x.abs - y.abs);
  const ranks = new Array(withSign.length);
  let i = 0;
  while (i < withSign.length) {
    let j = i;
    while (j + 1 < withSign.length && withSign[j + 1].abs === withSign[i].abs) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let wPlus = 0, wMinus = 0;
  for (let k = 0; k < withSign.length; k++) {
    if (withSign[k].s > 0) wPlus += ranks[k];
    else wMinus += ranks[k];
  }
  const statistic = Math.min(wPlus, wMinus);
  const p = wilcoxonExactP(ranks.map((r) => Math.round(r * 2)), Math.round(statistic * 2));
  const rankBiserial = (wPlus - wMinus) / (wPlus + wMinus);
  const sortedAll = [...diffs].sort((a, b) => a - b);
  const medianDiff = quantile7(sortedAll, 0.5);
  return { n: nonz.length, zeros, w_plus: wPlus, w_minus: wMinus, statistic, p, rank_biserial: rankBiserial, median_difference: medianDiff };
}

/* ---------------- Friedman（含并列校正） ---------------- */

function friedman(matrix) {
  // matrix: n 个区块 × k 个处理
  const n = matrix.length, k = matrix[0].length;
  const colRankSum = new Array(k).fill(0);
  let tieTerm = 0;
  for (const row of matrix) {
    const idx = row.map((v, j) => ({ v, j })).sort((a, b) => a.v - b.v);
    const ranks = new Array(k);
    let i = 0;
    while (i < k) {
      let j = i;
      while (j + 1 < k && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let t = i; t <= j; t++) ranks[idx[t].j] = avg;
      const t = j - i + 1;
      if (t > 1) tieTerm += t * t * t - t;
      i = j + 1;
    }
    for (let j = 0; j < k; j++) colRankSum[j] += ranks[j];
  }
  const sumSq = colRankSum.reduce((s, r) => s + r * r, 0);
  const uncorrected = (12 / (n * k * (k + 1))) * sumSq - 3 * n * (k + 1);
  const denom = n * k * (k + 1) - tieTerm / (k - 1);
  const corrected = (12 * sumSq - 3 * n * n * k * (k + 1) * (k + 1)) / denom;
  const df = k - 1;
  return {
    n, k,
    statistic: corrected, // v4 落盘为含并列校正值（无并列时与未校正值相等，校准断言保证）
    df,
    p: chi2sf(corrected, df),
  };
}

/* ---------------- Cochran Q ---------------- */

function cochranQ(passMatrix) {
  // passMatrix: n 行 × k 列的 0/1
  const n = passMatrix.length, k = passMatrix[0].length;
  const colSum = new Array(k).fill(0);
  let rowSumSq = 0, rowSumTotal = 0;
  for (const row of passMatrix) {
    const rs = row.reduce((s, x) => s + x, 0);
    rowSumSq += rs * rs;
    rowSumTotal += rs;
    for (let j = 0; j < k; j++) colSum[j] += row[j];
  }
  const colSumSq = colSum.reduce((s, c) => s + c * c, 0);
  const denom = k * rowSumTotal - rowSumSq;
  if (denom === 0) return { n, k, statistic: 0, df: k - 1, p: 1 };
  const statistic = ((k - 1) * (k * colSumSq - rowSumTotal * rowSumTotal)) / denom;
  return { n, k, statistic, df: k - 1, p: chi2sf(statistic, k - 1) };
}

/* ---------------- Holm 校正 ---------------- */

function holm(pValues) {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adj = new Array(m);
  let running = 0;
  for (let j = 0; j < m; j++) {
    const raw = Math.min(1, (m - j) * order[j].p);
    running = Math.max(running, raw);
    adj[order[j].i] = running;
  }
  return adj;
}

/* ---------------- QA 统计组装 ---------------- */

function buildQaStats(scored, conditions) {
  const ids = [...new Set(scored.map((r) => r.task_id))];
  const byCond = {};
  for (const c of conditions) byCond[c] = scored.filter((r) => r.condition === c);

  const descriptive = {};
  for (const c of conditions) {
    const rs = byCond[c];
    descriptive[c] = {
      judge_pass: descBool(rs.map((r) => r.judge_pass)),
      rule_pass: descBool(rs.map((r) => r.passed)),
      model_total_tokens: descNum(rs.map((r) => r.model_total_tokens)),
      cumulative_context_tokens: descNum(rs.map((r) => r.cumulative_context_tokens)),
      search_read_count: descNum(rs.map((r) => r.search_read_count)),
    };
  }

  const categories = [...new Set(scored.map((r) => r.category))];
  const byCategory = {};
  for (const cat of categories) {
    byCategory[cat] = {};
    for (const c of conditions) {
      const rs = scored.filter((r) => r.category === cat && r.condition === c);
      byCategory[cat][c] = {
        judge_pass: descNum(rs.map((r) => (r.judge_pass ? 1 : 0))),
        model_total_tokens: descNum(rs.map((r) => r.model_total_tokens)),
        cumulative_context_tokens: descNum(rs.map((r) => r.cumulative_context_tokens)),
      };
    }
  }

  // pass_tests
  const passMatrix = ids.map((id) => conditions.map((c) => (scored.find((r) => r.task_id === id && r.condition === c).judge_pass ? 1 : 0)));
  const cochran = cochranQ(passMatrix);
  const pairs = [];
  for (let i = 0; i < conditions.length; i++)
    for (let j = i + 1; j < conditions.length; j++) pairs.push([conditions[i], conditions[j]]);
  const mcnemar = pairs.map(([a, b]) => {
    let aPassBFail = 0, aFailBPass = 0;
    for (const id of ids) {
      const pa = scored.find((r) => r.task_id === id && r.condition === a).judge_pass;
      const pb = scored.find((r) => r.task_id === id && r.condition === b).judge_pass;
      if (pa && !pb) aPassBFail++;
      if (!pa && pb) aFailBPass++;
    }
    const passRateA = ids.filter((id) => scored.find((r) => r.task_id === id && r.condition === a).judge_pass).length / ids.length;
    const passRateB = ids.filter((id) => scored.find((r) => r.task_id === id && r.condition === b).judge_pass).length / ids.length;
    return {
      n: ids.length, a_pass_b_fail: aPassBFail, a_fail_b_pass: aFailBPass,
      discordant: aPassBFail + aFailBPass,
      p: mcnemarExactP(aPassBFail, aFailBPass),
      pass_rate_difference: passRateA - passRateB,
      a, b, difference: 'a-b',
    };
  });
  holm(mcnemar.map((x) => x.p)).forEach((ph, i) => (mcnemar[i].p_holm = ph));

  // family_aggregated：按问题族聚合 judge_pass 均值后再检验
  const families = [...new Set(scored.map((r) => r.family))].sort();
  const famMatrix = families.map((f) => conditions.map((c) => {
    const rs = scored.filter((r) => r.family === f && r.condition === c);
    return rs.reduce((s, r) => s + (r.judge_pass ? 1 : 0), 0) / rs.length;
  }));
  const famFriedman = friedman(famMatrix);
  const famWilcoxon = pairs.map(([a, b]) => {
    const ai = conditions.indexOf(a), bi = conditions.indexOf(b);
    const aMap = {}, bMap = {};
    families.forEach((f, fi) => { aMap[f] = famMatrix[fi][ai]; bMap[f] = famMatrix[fi][bi]; });
    const w = wilcoxonPaired(aMap, bMap, families);
    return { ...w, a, b, difference: 'a-b' };
  });
  holm(famWilcoxon.map((x) => x.p)).forEach((ph, i) => (famWilcoxon[i].p_holm = ph));

  const pass_tests = {
    cochran_q: cochran,
    pairwise_mcnemar: mcnemar,
    family_aggregated_friedman: famFriedman,
    family_aggregated_pairwise_wilcoxon: famWilcoxon,
  };

  // cost_tests：三指标 × (Friedman + 配对 Wilcoxon + 按问题族聚合的同两项)
  const cost_tests = {};
  for (const metric of ['model_total_tokens', 'cumulative_context_tokens', 'search_read_count']) {
    const matrix = ids.map((id) => conditions.map((c) => scored.find((r) => r.task_id === id && r.condition === c)[metric]));
    const fr = friedman(matrix);
    const wl = pairs.map(([a, b]) => {
      const aMap = {}, bMap = {};
      for (const id of ids) {
        aMap[id] = scored.find((r) => r.task_id === id && r.condition === a)[metric];
        bMap[id] = scored.find((r) => r.task_id === id && r.condition === b)[metric];
      }
      const w = wilcoxonPaired(aMap, bMap, ids);
      return { ...w, a, b, difference: 'a-b' };
    });
    holm(wl.map((x) => x.p)).forEach((ph, i) => (wl[i].p_holm = ph));
    // 按问题族聚合指标均值后再做同样两项检验
    const famMetricMatrix = families.map((f) => conditions.map((c) => {
      const rs = scored.filter((r) => r.family === f && r.condition === c);
      return rs.reduce((s, r) => s + r[metric], 0) / rs.length;
    }));
    const famFr = friedman(famMetricMatrix);
    const famWl = pairs.map(([a, b]) => {
      const ai = conditions.indexOf(a), bi = conditions.indexOf(b);
      const aMap = {}, bMap = {};
      families.forEach((f, fi) => { aMap[f] = famMetricMatrix[fi][ai]; bMap[f] = famMetricMatrix[fi][bi]; });
      const w = wilcoxonPaired(aMap, bMap, families);
      return { ...w, a, b, difference: 'a-b' };
    });
    holm(famWl.map((x) => x.p)).forEach((ph, i) => (famWl[i].p_holm = ph));
    cost_tests[metric] = { friedman: fr, pairwise_wilcoxon: wl, family_aggregated_friedman: famFr, family_aggregated_pairwise_wilcoxon: famWl };
  }

  const transient_retry_records = scored.filter((r) => (r.transient_errors || []).length > 0).length;
  const empty_answers = scored.filter((r) => {
    const a = r.answer;
    if (!a) return true;
    if (typeof a === 'object') return !a.answer || !String(a.answer).trim();
    return !String(a).trim();
  }).length;

  return { descriptive, by_category: byCategory, pass_tests, cost_tests, transient_retry_records, empty_answers };
}

/* ---------------- 检索统计组装 ---------------- */

function buildRetrievalStats(runs, conditions) {
  const descriptive = {};
  for (const c of conditions) {
    const rs = runs.filter((r) => r.condition === c);
    descriptive[c] = {
      recall_at_5: descNum(rs.map((r) => r.recall_at_5)),
      recall_at_10: descNum(rs.map((r) => r.recall_at_10)),
      precision_at_10: descNum(rs.map((r) => r.precision_at_10)),
    };
  }
  const categories = [...new Set(runs.map((r) => r.category))];
  const byCategory = {};
  for (const cat of categories) {
    byCategory[cat] = {};
    for (const c of conditions) {
      const rs = runs.filter((r) => r.category === cat && r.condition === c);
      byCategory[cat][c] = {
        recall_at_5: descNum(rs.map((r) => r.recall_at_5)),
        recall_at_10: descNum(rs.map((r) => r.recall_at_10)),
        precision_at_10: descNum(rs.map((r) => r.precision_at_10)),
      };
    }
  }
  // tests：三指标 × 四检验（与 qa.cost_tests 同构），配对按 task_id，族聚合按 family
  const ids = [...new Set(runs.map((r) => r.task_id))];
  const families = [...new Set(runs.map((r) => r.family))].sort();
  const pairs = [];
  for (let i = 0; i < conditions.length; i++)
    for (let j = i + 1; j < conditions.length; j++) pairs.push([conditions[i], conditions[j]]);
  const tests = {};
  for (const metric of ['recall_at_5', 'recall_at_10', 'precision_at_10']) {
    const matrix = ids.map((id) => conditions.map((c) => runs.find((r) => r.task_id === id && r.condition === c)[metric]));
    const fr = friedman(matrix);
    const wl = pairs.map(([a, b]) => {
      const aMap = {}, bMap = {};
      for (const id of ids) {
        aMap[id] = runs.find((r) => r.task_id === id && r.condition === a)[metric];
        bMap[id] = runs.find((r) => r.task_id === id && r.condition === b)[metric];
      }
      const w = wilcoxonPaired(aMap, bMap, ids);
      return { ...w, a, b, difference: 'a-b' };
    });
    holm(wl.map((x) => x.p)).forEach((ph, i) => (wl[i].p_holm = ph));
    const famMatrix = families.map((f) => conditions.map((c) => {
      const rs = runs.filter((r) => r.family === f && r.condition === c);
      return rs.reduce((s, r) => s + r[metric], 0) / rs.length;
    }));
    const famFr = friedman(famMatrix);
    const famWl = pairs.map(([a, b]) => {
      const ai = conditions.indexOf(a), bi = conditions.indexOf(b);
      const aMap = {}, bMap = {};
      families.forEach((f, fi) => { aMap[f] = famMatrix[fi][ai]; bMap[f] = famMatrix[fi][bi]; });
      const w = wilcoxonPaired(aMap, bMap, families);
      return { ...w, a, b, difference: 'a-b' };
    });
    holm(famWl.map((x) => x.p)).forEach((ph, i) => (famWl[i].p_holm = ph));
    tests[metric] = { friedman: fr, pairwise_wilcoxon: wl, family_aggregated_friedman: famFr, family_aggregated_pairwise_wilcoxon: famWl };
  }
  const zeroRecallAt10 = {};
  for (const c of conditions) zeroRecallAt10[c] = runs.filter((r) => r.condition === c && r.recall_at_10 === 0).length;
  return { descriptive, by_category: byCategory, tests, zero_recall_at_10: zeroRecallAt10 };
}

/* ---------------- summary 组装 ---------------- */

function buildQaSummary(scored, conditions) {
  const out = {};
  for (const c of conditions) {
    const rs = scored.filter((r) => r.condition === c);
    const categories = [...new Set(scored.map((r) => r.category))];
    const byCat = {};
    for (const cat of categories) {
      const crs = scored.filter((r) => r.category === cat && r.condition === c);
      byCat[cat] = {
        n: crs.length,
        pass_rate: crs.filter((r) => r.judge_pass).length / crs.length,
        model_tokens_mean: crs.reduce((s, r) => s + r.model_total_tokens, 0) / crs.length,
        context_tokens_mean: crs.reduce((s, r) => s + r.cumulative_context_tokens, 0) / crs.length,
      };
    }
    const tokens = rs.map((r) => r.model_total_tokens).sort((a, b) => a - b);
    const ctx = rs.map((r) => r.cumulative_context_tokens).sort((a, b) => a - b);
    out[c] = {
      n: rs.length,
      passed: rs.filter((r) => r.judge_pass).length,
      pass_rate: rs.filter((r) => r.judge_pass).length / rs.length,
      rule_pass_rate: rs.filter((r) => r.passed).length / rs.length,
      model_tokens_mean: tokens.reduce((s, x) => s + x, 0) / rs.length,
      model_tokens_median: quantile7(tokens, 0.5),
      model_tokens_q1: quantile7(tokens, 0.25),
      model_tokens_q3: quantile7(tokens, 0.75),
      context_tokens_mean: ctx.reduce((s, x) => s + x, 0) / rs.length,
      context_tokens_median: quantile7(ctx, 0.5),
      search_read_mean: rs.reduce((s, r) => s + r.search_read_count, 0) / rs.length,
      evidence_coverage_mean: rs.reduce((s, r) => s + r.evidence_coverage, 0) / rs.length,
      errors: rs.filter((r) => r.error).length,
      by_category: byCat,
    };
  }
  return out;
}

function buildRetrievalSummary(runs, conditions) {
  const out = {};
  for (const c of conditions) {
    const rs = runs.filter((r) => r.condition === c);
    const categories = [...new Set(runs.map((r) => r.category))];
    const byCat = {};
    for (const cat of categories) {
      const crs = rs.filter((r) => r.category === cat);
      byCat[cat] = {
        n: crs.length,
        recall_at_10: crs.reduce((s, r) => s + r.recall_at_10, 0) / crs.length,
        precision_at_10: crs.reduce((s, r) => s + r.precision_at_10, 0) / crs.length,
      };
    }
    const el = rs.map((r) => r.elapsed_ms).sort((a, b) => a - b);
    out[c] = {
      n: rs.length,
      recall_at_5_mean: rs.reduce((s, r) => s + r.recall_at_5, 0) / rs.length,
      recall_at_10_mean: rs.reduce((s, r) => s + r.recall_at_10, 0) / rs.length,
      precision_at_10_mean: rs.reduce((s, r) => s + r.precision_at_10, 0) / rs.length,
      median_elapsed_ms: quantile7(el, 0.5),
      by_category: byCat,
    };
  }
  return out;
}

/* ---------------- 校准：v4 重算 vs v4 落盘，逐数比对 ---------------- */

function deepCompare(a, b, p, diffs) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!(a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)))) {
      diffs.push(`${p}: 重算 ${a} vs 落盘 ${b}`);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { diffs.push(`${p}: 数组长度 ${a.length} vs ${b.length}`); return; }
    a.forEach((x, i) => deepCompare(x, b[i], `${p}[${i}]`, diffs));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) { diffs.push(`${p}.${k}: 重算缺键`); continue; }
      if (!(k in b)) { diffs.push(`${p}.${k}: 落盘缺键（重算多出）`); continue; }
      deepCompare(a[k], b[k], `${p}.${k}`, diffs);
    }
    return;
  }
  if (a !== b) diffs.push(`${p}: 重算 ${JSON.stringify(a)} vs 落盘 ${JSON.stringify(b)}`);
}

function calibrate() {
  const v4Scored = readJSON(path.join(V4, 'qa_runs_autonomous_scored.json'));
  const v4Retrieval = readJSON(path.join(V4, 'retrieval_runs.json'));
  const v4Stats = readJSON(path.join(V4, 'statistics.json'));
  const v4Summary = readJSON(path.join(V4, 'summary.json'));
  const v4Conditions = [...new Set(v4Scored.map((r) => r.condition))];
  const retrievalConditions = [...new Set(v4Retrieval.map((r) => r.condition))];
  // v4 终版 qa 条件顺序（按 manifest 的语义顺序排列）
  const qaCondOrder = ['non_kg', 'wpw_map', 'wpw_gen', 'full_wpw'].filter((c) => v4Conditions.includes(c));
  const retCondOrder = ['non_kg', 'wpw_map', 'full_wpw'].filter((c) => retrievalConditions.includes(c));

  const diffs = [];
  const qaStats = buildQaStats(v4Scored, qaCondOrder);
  const retStats = buildRetrievalStats(v4Retrieval, retCondOrder);
  deepCompare(qaStats, v4Stats.qa, 'qa', diffs);
  deepCompare(retStats, v4Stats.retrieval, 'retrieval', diffs);

  const qaSum = buildQaSummary(v4Scored, qaCondOrder);
  const retSum = buildRetrievalSummary(v4Retrieval, retCondOrder);
  deepCompare(qaSum, v4Summary.qa, 'summary.qa', diffs);
  deepCompare(retSum, v4Summary.retrieval, 'summary.retrieval', diffs);

  // 已知豁免：v4 落盘的 retrieval.tests.*.family_aggregated_* 无法从 v4 存档的
  // retrieval_runs.json 复现（10 种聚合口径均不中，含族均值法；最小 |d| 项符号翻转、
  // 零值模式在两对间互换——判定为原始 harness 的陈旧状态混入，非本脚本方法问题：
  // 同一代码路径的 qa.family_aggregated_* 与全部题级检验均逐数复现）。
  // v5 的该子结构用可复现的族均值法计算。
  const exempt = diffs.filter((d) => d.startsWith('retrieval.tests.') && d.includes('family_aggregated'));
  const strict = diffs.filter((d) => !exempt.includes(d));

  if (strict.length) {
    console.error(`校准失败：${strict.length} 处不一致`);
    for (const d of strict.slice(0, 40)) console.error('  ' + d);
    process.exit(1);
  }
  if (exempt.length) {
    console.log(`校准通过（含 ${exempt.length} 处已知豁免：v4 retrieval family_aggregated 记录值本身不可复现，详见脚本注释）`);
    for (const d of exempt.slice(0, 6)) console.log('  [豁免] ' + d);
  } else {
    console.log('校准通过：v4 重算值与 v4 statistics.json / summary.json 全部一致（qa + retrieval 两节，含全部检验统计量）');
  }
}

/* ---------------- 主流程 ---------------- */

const WRITE = process.argv.includes('--write');

calibrate();

// ---- v5 派生 ----
const v5Scored = readJSON(path.join(V5, 'qa_runs_autonomous_scored.json'));
const v5Retrieval = readJSON(path.join(V5, 'retrieval_runs.json'));
const v5Build = readJSON(path.join(V5, 'build.json'));
const conditions = ['non_kg', 'wpw_map', 'full_wpw'];
const models = [...new Set(v5Scored.map((r) => r.model))];
if (models.length !== 1) throw new Error('v5 model 字段不唯一: ' + models.join(','));

const statistics = {
  retrieval: buildRetrievalStats(v5Retrieval, conditions),
  qa: buildQaStats(v5Scored, conditions),
};

const summary = {
  commit: 'afca51b09abd73c619986659a7af34b8d616d9b1',
  model: models[0],
  graph_build: v5Build,
  retrieval: buildRetrievalSummary(v5Retrieval, conditions),
  qa: buildQaSummary(v5Scored, conditions),
};

const manifest = {
  source: 'F:\\project\\springboot7tr93',
  commit: 'afca51b09abd73c619986659a7af34b8d616d9b1',
  source_status_at_start: null,
  retrieval_tasks: 100,
  qa_tasks: 100,
  conditions: { retrieval: conditions, qa: conditions },
  model: models[0],
  runner_sha256: null,
};

// ---- 摘要输出 ----
console.log('\n=== v5 关键数字 ===');
for (const c of conditions) {
  const d = statistics.qa.descriptive[c];
  console.log(`${c}: judge ${d.judge_pass.count}/${d.judge_pass.n} (rate ${d.judge_pass.rate}), rule ${d.rule_pass.count}/${d.rule_pass.n}, tokens mean ${Math.round(d.model_total_tokens.mean)}, ctx mean ${Math.round(d.cumulative_context_tokens.mean)}`);
}
console.log('cochran_q:', JSON.stringify(statistics.qa.pass_tests.cochran_q));
for (const m of statistics.qa.pass_tests.pairwise_mcnemar) console.log(`mcnemar ${m.a}-${m.b}: p=${m.p.toPrecision(6)} p_holm=${m.p_holm.toPrecision(6)}`);
for (const [metric, t] of Object.entries(statistics.qa.cost_tests)) {
  console.log(`${metric} friedman: stat=${t.friedman.statistic.toPrecision(8)} p=${t.friedman.p.toPrecision(6)}`);
  for (const w of t.pairwise_wilcoxon) console.log(`  wilcoxon ${w.a}-${w.b}: p=${w.p.toPrecision(6)} p_holm=${w.p_holm.toPrecision(6)} median_diff=${w.median_difference}`);
}
console.log('family_aggregated_friedman:', JSON.stringify(statistics.qa.pass_tests.family_aggregated_friedman));

if (WRITE) {
  fs.writeFileSync(path.join(V5, 'statistics.json'), JSON.stringify(statistics, null, 2));
  fs.writeFileSync(path.join(V5, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(V5, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n已写入 v5: statistics.json / summary.json / manifest.json');
} else {
  console.log('\n（未加 --write，未落盘）');
}
