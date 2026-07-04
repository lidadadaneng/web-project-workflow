import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initState, saveState, setDecision, setStatus } from '../lib/state';
import { checkArtifact } from '../lib/dependency';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-dep-'));
}

function seed(root: string): void {
  saveState(root, initState('login'));
}

test('check design: missing prd when nothing done', () => {
  const root = tmpRoot();
  seed(root);
  const r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, false);
  assert.deepEqual(r.missing, ['prd']);
});

test('check design: canProceed after prd done', () => {
  const root = tmpRoot();
  seed(root);
  setStatus(root, 'login', 'brd', 'done');
  setStatus(root, 'login', 'prd', 'done');
  const r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, true);
  assert.equal(r.missing.length, 0);
});

test('check design: explore skipped does not block', () => {
  const root = tmpRoot();
  seed(root);
  setStatus(root, 'login', 'brd', 'done');
  setStatus(root, 'login', 'prd', 'done');
  setStatus(root, 'login', 'explore', 'skipped');
  const r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, true);
  assert.equal(r.warnings.length, 0);
});

test('check design: explore done but not decided warns', () => {
  const root = tmpRoot();
  seed(root);
  setStatus(root, 'login', 'brd', 'done');
  setStatus(root, 'login', 'prd', 'done');
  setStatus(root, 'login', 'explore', 'done');
  const r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, true);
  assert.ok(r.warnings.length > 0);
});

test('check design: explore done and decided no warning', () => {
  const root = tmpRoot();
  seed(root);
  setStatus(root, 'login', 'brd', 'done');
  setStatus(root, 'login', 'prd', 'done');
  setStatus(root, 'login', 'explore', 'done');
  setDecision(root, 'login', 'explore', '方案A');
  const r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, true);
  assert.equal(r.warnings.length, 0);
});

test('check testplan: requires both design and plan', () => {
  const root = tmpRoot();
  seed(root);
  setStatus(root, 'login', 'design', 'done');
  const r = checkArtifact(root, 'login', 'testplan');
  assert.equal(r.canProceed, false);
  assert.ok(r.missing.includes('plan'));
});

test('check prd: requires brd', () => {
  const root = tmpRoot();
  seed(root);
  const r = checkArtifact(root, 'login', 'prd');
  assert.equal(r.canProceed, false);
  assert.deepEqual(r.missing, ['brd']);
});

test('check brd: no dependencies, always canProceed', () => {
  const root = tmpRoot();
  seed(root);
  const r = checkArtifact(root, 'login', 'brd');
  assert.equal(r.canProceed, true);
});
