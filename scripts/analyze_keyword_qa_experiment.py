from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "论文" / "辅助材料" / "关键词召回实验数据_v4"
RET_CONDITIONS = ["non_kg", "wpw_map", "full_wpw"]
QA_CONDITIONS = ["non_kg", "wpw_map", "wpw_gen", "full_wpw"]


def load(name: str) -> list[dict[str, Any]]:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def quantile(values: Iterable[float], p: float) -> float:
    xs = sorted(float(x) for x in values)
    if not xs:
        return float("nan")
    position = (len(xs) - 1) * p
    lo = math.floor(position)
    hi = math.ceil(position)
    if lo == hi:
        return xs[lo]
    return xs[lo] + (xs[hi] - xs[lo]) * (position - lo)


def describe(values: Iterable[float]) -> dict[str, float | int]:
    xs = [float(x) for x in values]
    return {
        "n": len(xs),
        "mean": mean(xs),
        "median": median(xs),
        "q1": quantile(xs, 0.25),
        "q3": quantile(xs, 0.75),
        "min": min(xs),
        "max": max(xs),
    }


def rankdata(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and values[order[j]] == values[order[i]]:
            j += 1
        rank = (i + 1 + j) / 2.0
        for position in order[i:j]:
            ranks[position] = rank
        i = j
    return ranks


def gammaincc(a: float, x: float) -> float:
    """Regularized upper incomplete gamma Q(a, x), Numerical Recipes form."""
    if x < 0 or a <= 0:
        raise ValueError("invalid gamma arguments")
    if x == 0:
        return 1.0
    eps = 3e-14
    tiny = 1e-300
    if x < a + 1:
        ap = a
        term = 1.0 / a
        total = term
        for _ in range(10000):
            ap += 1.0
            term *= x / ap
            total += term
            if abs(term) < abs(total) * eps:
                break
        p = total * math.exp(-x + a * math.log(x) - math.lgamma(a))
        return max(0.0, min(1.0, 1.0 - p))
    b = x + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < tiny:
            d = tiny
        c = b + an / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    q = math.exp(-x + a * math.log(x) - math.lgamma(a)) * h
    return max(0.0, min(1.0, q))


def chi_square_sf(statistic: float, df: int) -> float:
    return gammaincc(df / 2.0, statistic / 2.0)


def friedman(matrix: list[list[float]]) -> dict[str, float | int]:
    n = len(matrix)
    k = len(matrix[0])
    ranked = [rankdata(row) for row in matrix]
    rank_sums = [sum(row[j] for row in ranked) for j in range(k)]
    statistic = 12.0 / (n * k * (k + 1)) * sum(x * x for x in rank_sums) - 3 * n * (k + 1)
    tie_total = 0.0
    for row in matrix:
        for count in Counter(row).values():
            if count > 1:
                tie_total += count**3 - count
    correction = 1.0 - tie_total / (n * (k**3 - k))
    if correction > 0:
        statistic /= correction
    return {"n": n, "k": k, "statistic": statistic, "df": k - 1, "p": chi_square_sf(statistic, k - 1)}


def wilcoxon_exact(a: list[float], b: list[float]) -> dict[str, float | int]:
    diffs = [float(x) - float(y) for x, y in zip(a, b) if float(x) != float(y)]
    if not diffs:
        return {"n": 0, "zeros": len(a), "w_plus": 0, "w_minus": 0, "statistic": 0, "p": 1.0, "rank_biserial": 0.0, "median_difference": 0.0}
    ranks = rankdata([abs(x) for x in diffs])
    weights = [int(round(rank * 2)) for rank in ranks]
    observed = sum(weight for weight, diff in zip(weights, diffs) if diff > 0)
    total = sum(weights)
    counts = [0] * (total + 1)
    counts[0] = 1
    current = 0
    for weight in weights:
        for score in range(current, -1, -1):
            if counts[score]:
                counts[score + weight] += counts[score]
        current += weight
    assignments = 2 ** len(weights)
    lower = sum(counts[: observed + 1]) / assignments
    upper = sum(counts[observed:]) / assignments
    p = min(1.0, 2.0 * min(lower, upper))
    w_plus = observed / 2.0
    w_minus = (total - observed) / 2.0
    return {
        "n": len(diffs), "zeros": len(a) - len(diffs), "w_plus": w_plus, "w_minus": w_minus,
        "statistic": min(w_plus, w_minus), "p": p,
        "rank_biserial": (w_plus - w_minus) / (w_plus + w_minus),
        "median_difference": median([float(x) - float(y) for x, y in zip(a, b)]),
    }


def holm(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = sorted(range(len(rows)), key=lambda i: rows[i]["p"])
    running = 0.0
    m = len(rows)
    for rank, index in enumerate(order):
        adjusted = min(1.0, (m - rank) * rows[index]["p"])
        running = max(running, adjusted)
        rows[index]["p_holm"] = running
    return rows


def cochran_q(matrix: list[list[int]]) -> dict[str, float | int]:
    n = len(matrix)
    k = len(matrix[0])
    column = [sum(row[j] for row in matrix) for j in range(k)]
    row = [sum(values) for values in matrix]
    numerator = (k - 1) * (k * sum(x * x for x in column) - sum(column) ** 2)
    denominator = k * sum(x for x in row) - sum(x * x for x in row)
    statistic = numerator / denominator if denominator else 0.0
    return {"n": n, "k": k, "statistic": statistic, "df": k - 1, "p": chi_square_sf(statistic, k - 1)}


def mcnemar_exact(a: list[int], b: list[int]) -> dict[str, float | int]:
    b10 = sum(x == 1 and y == 0 for x, y in zip(a, b))
    b01 = sum(x == 0 and y == 1 for x, y in zip(a, b))
    discordant = b10 + b01
    if discordant == 0:
        p = 1.0
    else:
        tail = sum(math.comb(discordant, i) for i in range(min(b10, b01) + 1)) / (2**discordant)
        p = min(1.0, 2.0 * tail)
    return {"n": len(a), "a_pass_b_fail": b10, "a_fail_b_pass": b01, "discordant": discordant, "p": p, "pass_rate_difference": mean(a) - mean(b)}


def paired(rows: list[dict[str, Any]], conditions: list[str], key: str) -> tuple[list[str], list[list[float]]]:
    table: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows:
        table[row["task_id"]][row["condition"]] = float(row[key])
    task_ids = sorted(task_id for task_id, values in table.items() if all(condition in values for condition in conditions))
    return task_ids, [[table[task_id][condition] for condition in conditions] for task_id in task_ids]


def paired_by_family(rows: list[dict[str, Any]], conditions: list[str], key: str) -> tuple[list[str], list[list[float]]]:
    grouped: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in rows:
        grouped[(row["family"], row["condition"])].append(float(row[key]))
    families = sorted({row["family"] for row in rows})
    matrix = [
        [mean(grouped[(family, condition)]) for condition in conditions]
        for family in families
        if all((family, condition) in grouped for condition in conditions)
    ]
    return families, matrix


def pairwise_continuous(matrix: list[list[float]], conditions: list[str]) -> list[dict[str, Any]]:
    results = []
    for i in range(len(conditions)):
        for j in range(i + 1, len(conditions)):
            result = wilcoxon_exact([row[i] for row in matrix], [row[j] for row in matrix])
            result.update({"a": conditions[i], "b": conditions[j], "difference": "a-b"})
            results.append(result)
    return holm(results)


def pairwise_binary(matrix: list[list[int]], conditions: list[str]) -> list[dict[str, Any]]:
    results = []
    for i in range(len(conditions)):
        for j in range(i + 1, len(conditions)):
            result = mcnemar_exact([row[i] for row in matrix], [row[j] for row in matrix])
            result.update({"a": conditions[i], "b": conditions[j], "difference": "a-b"})
            results.append(result)
    return holm(results)


def by_category(rows: list[dict[str, Any]], conditions: list[str], metrics: list[str]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for category in sorted({row["category"] for row in rows}):
        output[category] = {}
        subset = [row for row in rows if row["category"] == category]
        for condition in conditions:
            condition_rows = [row for row in subset if row["condition"] == condition]
            output[category][condition] = {metric: describe(row[metric] for row in condition_rows) for metric in metrics}
    return output


def main() -> None:
    retrieval = load("retrieval_runs.json")
    qa = load("qa_runs_autonomous_scored.json")
    output: dict[str, Any] = {"retrieval": {}, "qa": {}}

    retrieval_metrics = ["recall_at_5", "recall_at_10", "precision_at_10"]
    output["retrieval"]["descriptive"] = {
        condition: {metric: describe(row[metric] for row in retrieval if row["condition"] == condition) for metric in retrieval_metrics}
        for condition in RET_CONDITIONS
    }
    output["retrieval"]["by_category"] = by_category(retrieval, RET_CONDITIONS, retrieval_metrics)
    output["retrieval"]["tests"] = {}
    for metric in retrieval_metrics:
        _, matrix = paired(retrieval, RET_CONDITIONS, metric)
        _, family_matrix = paired_by_family(retrieval, RET_CONDITIONS, metric)
        output["retrieval"]["tests"][metric] = {
            "friedman": friedman(matrix), "pairwise_wilcoxon": pairwise_continuous(matrix, RET_CONDITIONS),
            "family_aggregated_friedman": friedman(family_matrix),
            "family_aggregated_pairwise_wilcoxon": pairwise_continuous(family_matrix, RET_CONDITIONS),
        }
    output["retrieval"]["zero_recall_at_10"] = {
        condition: sum(row["recall_at_10"] == 0 for row in retrieval if row["condition"] == condition)
        for condition in RET_CONDITIONS
    }

    qa_metrics = ["model_total_tokens", "cumulative_context_tokens", "search_read_count"]
    output["qa"]["descriptive"] = {}
    for condition in QA_CONDITIONS:
        rows = [row for row in qa if row["condition"] == condition]
        output["qa"]["descriptive"][condition] = {
            "judge_pass": {"n": len(rows), "count": sum(bool(row["judge_pass"]) for row in rows), "rate": mean(float(row["judge_pass"]) for row in rows)},
            "rule_pass": {"n": len(rows), "count": sum(bool(row["passed"]) for row in rows), "rate": mean(float(row["passed"]) for row in rows)},
            **{metric: describe(row[metric] for row in rows) for metric in qa_metrics},
        }
    output["qa"]["by_category"] = by_category(qa, QA_CONDITIONS, ["judge_pass", "model_total_tokens", "cumulative_context_tokens"])
    _, binary_matrix_raw = paired(qa, QA_CONDITIONS, "judge_pass")
    binary_matrix = [[int(value) for value in row] for row in binary_matrix_raw]
    output["qa"]["pass_tests"] = {"cochran_q": cochran_q(binary_matrix), "pairwise_mcnemar": pairwise_binary(binary_matrix, QA_CONDITIONS)}
    _, family_pass_matrix = paired_by_family(qa, QA_CONDITIONS, "judge_pass")
    output["qa"]["pass_tests"]["family_aggregated_friedman"] = friedman(family_pass_matrix)
    output["qa"]["pass_tests"]["family_aggregated_pairwise_wilcoxon"] = pairwise_continuous(family_pass_matrix, QA_CONDITIONS)
    output["qa"]["cost_tests"] = {}
    for metric in qa_metrics:
        _, matrix = paired(qa, QA_CONDITIONS, metric)
        _, family_matrix = paired_by_family(qa, QA_CONDITIONS, metric)
        output["qa"]["cost_tests"][metric] = {
            "friedman": friedman(matrix), "pairwise_wilcoxon": pairwise_continuous(matrix, QA_CONDITIONS),
            "family_aggregated_friedman": friedman(family_matrix),
            "family_aggregated_pairwise_wilcoxon": pairwise_continuous(family_matrix, QA_CONDITIONS),
        }
    output["qa"]["transient_retry_records"] = sum(bool(row.get("error")) and bool(row.get("answer", {}).get("answer")) for row in qa)
    output["qa"]["empty_answers"] = sum(not bool(row.get("answer", {}).get("answer")) for row in qa)

    (DATA / "statistics.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
