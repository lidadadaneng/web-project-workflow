import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWeights, type MappingEvidence } from '../graph/builders/edge-builder';

/**
 * aggregateWeights 多源证据聚合单测
 *
 * 验证：
 *   1. noisy-OR 公式正确性（1 − ∏(1 − wᵢ)，上限 0.95）
 *   2. 最权威溯源来源（与证据 push 顺序无关）
 *   3. 多源复合权重高于任一单源权重
 *   4. 单源命中保留该源
 */

function ev(targetId: string, source: MappingEvidence['source'], baseWeight: number): MappingEvidence {
  return { targetId, source, baseWeight };
}

test('aggregateWeights: 三源命中同一目标，source 取最权威的 doc-extract', () => {
  const evidences: MappingEvidence[] = [
    ev('mod:auth', 'semantic', 0.42),
    ev('mod:auth', 'doc-extract', 0.85),
    ev('mod:auth', 'name-match', 0.35),
  ];
  const result = aggregateWeights(evidences);
  const agg = result.get('mod:auth');
  assert.ok(agg, '应存在聚合结果');
  assert.equal(agg!.source, 'doc-extract', '最权威源应为 doc-extract（rank 8）');
});

test('aggregateWeights: 溯源与证据 push 顺序无关', () => {
  const src1: MappingEvidence[] = [
    ev('mod:auth', 'semantic', 0.42),
    ev('mod:auth', 'doc-extract', 0.85),
    ev('mod:auth', 'name-match', 0.35),
  ];
  // 打乱顺序
  const src2: MappingEvidence[] = [
    ev('mod:auth', 'name-match', 0.35),
    ev('mod:auth', 'semantic', 0.42),
    ev('mod:auth', 'doc-extract', 0.85),
  ];
  const r1 = aggregateWeights(src1).get('mod:auth')!;
  const r2 = aggregateWeights(src2).get('mod:auth')!;
  assert.equal(r1.weight, r2.weight, '权重应一致');
  assert.equal(r1.source, r2.source, '溯源来源应一致');
  assert.equal(r2.source, 'doc-extract', '打乱后仍应取 doc-extract');
});

test('aggregateWeights: noisy-OR 公式正确，且多源复合高于单源', () => {
  // 单源 doc-extract 0.85
  const single = aggregateWeights([ev('mod:a', 'doc-extract', 0.85)]).get('mod:a')!;
  assert.ok(Math.abs(single.weight - 0.85) < 1e-9, '单源权重应等于基础权重');

  // 三源：0.85 + 0.42 + 0.35
  // noisy-OR = 1 - (1-0.85)(1-0.42)(1-0.35) = 1 - 0.15*0.58*0.65 = 0.94345
  const multi = aggregateWeights([
    ev('mod:a', 'doc-extract', 0.85),
    ev('mod:a', 'semantic', 0.42),
    ev('mod:a', 'name-match', 0.35),
  ]).get('mod:a')!;
  const expected = 1 - (1 - 0.85) * (1 - 0.42) * (1 - 0.35);
  assert.ok(Math.abs(multi.weight - expected) < 1e-6, `noisy-OR 权重应≈${expected}，实际 ${multi.weight}`);
  assert.ok(multi.weight > single.weight, '多源复合权重应高于单源');
});

test('aggregateWeights: 权重上限 0.95', () => {
  // 多个高权重源，noisy-OR 应被裁到 0.95
  const result = aggregateWeights([
    ev('mod:a', 'doc-extract', 0.95),
    ev('mod:a', 'semantic', 0.9),
    ev('mod:a', 'git-history', 0.9),
  ]).get('mod:a')!;
  assert.ok(result.weight <= 0.95, '权重不应超过 0.95');
  assert.ok(Math.abs(result.weight - 0.95) < 1e-6, '应精确命中上限 0.95');
});

test('aggregateWeights: 单源命中保留该源', () => {
  const result = aggregateWeights([ev('mod:a', 'name-match', 0.5)]).get('mod:a')!;
  assert.equal(result.source, 'name-match');
  assert.ok(Math.abs(result.weight - 0.5) < 1e-9);
});

test('aggregateWeights: 多目标独立聚合', () => {
  const result = aggregateWeights([
    ev('mod:a', 'doc-extract', 0.85),
    ev('mod:b', 'name-match', 0.5),
    ev('mod:b', 'git-history', 0.6),
  ]);
  assert.equal(result.size, 2, '应有 2 个目标');
  assert.equal(result.get('mod:a')!.source, 'doc-extract');
  // mod:b: name-match(rank2) vs git-history(rank5) -> git-history
  assert.equal(result.get('mod:b')!.source, 'git-history', 'git-history 应优先于 name-match');
});
