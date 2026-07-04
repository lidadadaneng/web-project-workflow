import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initState, saveState, setStatus } from '../lib/state';
import { checkArtifact } from '../lib/dependency';
import { resolveTemplates } from '../lib/template-resolver';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-int-'));
}

test('full flow: brd→prd→skip explore→design→plan→testplan', () => {
  const root = tmpRoot();
  saveState(root, initState('login', 'backend-node'));

  // prd blocked by brd
  let r = checkArtifact(root, 'login', 'prd');
  assert.equal(r.canProceed, false);

  setStatus(root, 'login', 'brd', 'done');
  r = checkArtifact(root, 'login', 'prd');
  assert.equal(r.canProceed, true);

  setStatus(root, 'login', 'prd', 'done');
  setStatus(root, 'login', 'explore', 'skipped');

  r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, true);

  setStatus(root, 'login', 'design', 'done');
  r = checkArtifact(root, 'login', 'plan');
  assert.equal(r.canProceed, true);

  setStatus(root, 'login', 'plan', 'done');
  r = checkArtifact(root, 'login', 'testplan');
  assert.equal(r.canProceed, true);
});

test('template resolution returns expected templates', () => {
  const root = tmpRoot();
  const brd = resolveTemplates(root, 'brd');
  assert.ok(brd.length > 0);
  assert.ok(brd[0].endsWith('BRD.md'));

  const explore = resolveTemplates(root, 'explore');
  assert.ok(explore.length > 0);
  assert.ok(explore[0].endsWith('Explore.md'));
});

test('explore done without decision blocks design with warning', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  setStatus(root, 'login', 'brd', 'done');
  setStatus(root, 'login', 'prd', 'done');
  setStatus(root, 'login', 'explore', 'done');
  const r = checkArtifact(root, 'login', 'design');
  assert.equal(r.canProceed, true);
  assert.ok(r.warnings.some((w) => w.includes('未拍板')));
});
