import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMapping } from '../graph/__mapping_eval__';

function set(arr: string[]): Set<string> {
  return new Set(arr);
}

test('evaluateMapping: 完美匹配 P=R=F1=1', () => {
  const predicted = new Map([['req:a', set(['m1', 'm2'])]]);
  const truth = new Map([['req:a', set(['m1', 'm2'])]]);
  const r = evaluateMapping(predicted, truth);
  assert.equal(r.tp, 2);
  assert.equal(r.fp, 0);
  assert.equal(r.fn, 0);
  assert.equal(r.precision, 1);
  assert.equal(r.recall, 1);
  assert.equal(r.f1, 1);
});

test('evaluateMapping: 有 FP 与 FN', () => {
  // truth: {m1, m2}；pred: {m1, m3} -> TP=1, FP=1, FN=1
  const predicted = new Map([['req:a', set(['m1', 'm3'])]]);
  const truth = new Map([['req:a', set(['m1', 'm2'])]]);
  const r = evaluateMapping(predicted, truth);
  assert.equal(r.tp, 1);
  assert.equal(r.fp, 1);
  assert.equal(r.fn, 1);
  assert.equal(r.precision, 0.5);
  assert.equal(r.recall, 0.5);
  assert.equal(r.f1, 0.5);
});

test('evaluateMapping: 空预测非空真值 -> P=0 R=0 F1=0', () => {
  const predicted = new Map([['req:a', set([])]]);
  const truth = new Map([['req:a', set(['m1', 'm2'])]]);
  const r = evaluateMapping(predicted, truth);
  assert.equal(r.tp, 0);
  assert.equal(r.fn, 2);
  assert.equal(r.precision, 0);
  assert.equal(r.recall, 0);
  assert.equal(r.f1, 0);
});

test('evaluateMapping: 多需求 micro 平均', () => {
  // req:a: pred={m1}, truth={m1,m2} -> TP1,FP0,FN1
  // req:b: pred={m3,m4}, truth={m3} -> TP1,FP1,FN0
  // 合计 TP2, FP1, FN1 -> P=2/3, R=2/3, F1=2/3
  const predicted = new Map([
    ['req:a', set(['m1'])],
    ['req:b', set(['m3', 'm4'])],
  ]);
  const truth = new Map([
    ['req:a', set(['m1', 'm2'])],
    ['req:b', set(['m3'])],
  ]);
  const r = evaluateMapping(predicted, truth);
  assert.equal(r.tp, 2);
  assert.equal(r.fp, 1);
  assert.equal(r.fn, 1);
  assert.ok(Math.abs(r.precision - 2 / 3) < 1e-9);
  assert.ok(Math.abs(r.recall - 2 / 3) < 1e-9);
  assert.ok(Math.abs(r.f1 - 2 / 3) < 1e-9);
});

test('evaluateMapping: 预测有需求但真值无该需求 -> 全 FP', () => {
  const predicted = new Map([['req:x', set(['m1'])]]);
  const truth = new Map();
  const r = evaluateMapping(predicted, truth);
  assert.equal(r.fp, 1);
  assert.equal(r.tp, 0);
  assert.equal(r.precision, 0);
});
