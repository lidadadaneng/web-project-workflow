import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  initState,
  saveState,
  loadState,
  setStatus,
  setDecision,
  setProgress,
} from '../lib/state';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-state-'));
}

test('initState creates all phases pending', () => {
  const s = initState('login');
  assert.equal(s.name, 'login');
  assert.equal(s.schema, 'wpw-six-phase');
  for (const id of ['brd', 'prd', 'explore', 'design', 'plan', 'testplan'] as const) {
    assert.equal(s.status[id], 'pending');
  }
});

test('saveState + loadState roundtrip', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  const loaded = loadState(root, 'login');
  assert.ok(loaded);
  assert.equal(loaded!.name, 'login');
});

test('loadState returns null for missing change', () => {
  const root = tmpRoot();
  assert.equal(loadState(root, 'nope'), null);
});

test('setStatus updates phase status', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  const s = setStatus(root, 'login', 'brd', 'done');
  assert.equal(s.status.brd, 'done');
  const loaded = loadState(root, 'login');
  assert.equal(loaded!.status.brd, 'done');
});

test('setDecision records explore choice', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  const s = setDecision(root, 'login', 'explore', '方案A');
  assert.equal(s.decisions.explore?.chosenOption, '方案A');
  assert.ok(s.decisions.explore?.chosenAt);
});

test('setDecision throws for non-explore phase', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  assert.throws(() => setDecision(root, 'login', 'design', 'x'));
});

test('setProgress updates progress', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  const s = setProgress(root, 'login', 5, 2);
  assert.equal(s.progress.totalTasks, 5);
  assert.equal(s.progress.completedTasks, 2);
});
