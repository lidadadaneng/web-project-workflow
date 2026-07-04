/**
 * 依赖检查引擎。
 *
 * 按内置 schema 校验前置阶段：
 *   - 强依赖（dependsOn）未 done → canProceed=false，记入 missing
 *   - 弱依赖（optionalDeps）不阻断，但 explore 完成未拍板 → 记入 warnings
 *   - skippable 阶段可为 skipped，不阻断后继
 */
import { ArtifactId, getArtifact, getSchema } from '../schema/six-phase';
import { ChangeState, loadStateOrThrow } from './state';

export interface CheckResult {
  artifact: ArtifactId;
  canProceed: boolean;
  missing: ArtifactId[]; // 强依赖未完成
  warnings: string[]; // 软提示
  state: ChangeState;
}

export function checkArtifact(
  root: string,
  name: string,
  id: ArtifactId,
): CheckResult {
  const state = loadStateOrThrow(root, name);
  const schema = getSchema(state.schema);
  const artifact = getArtifact(schema, id);

  const missing: ArtifactId[] = [];
  const warnings: string[] = [];

  // 1. 强依赖检查：前置必须 done
  for (const dep of artifact.dependsOn) {
    const depStatus = state.status[dep];
    if (depStatus !== 'done') {
      missing.push(dep);
    }
  }

  // 2. 弱依赖：不阻断，但 explore 完成需拍板
  for (const dep of artifact.optionalDeps) {
    const depStatus = state.status[dep];
    if (dep === 'explore' && depStatus === 'done') {
      const chosen = state.decisions.explore?.chosenOption;
      if (!chosen) {
        warnings.push(
          'explore 已完成但未拍板（decisions.explore.chosenOption 为空），建议先执行 wpw decision explore --option <方案>',
        );
      }
    }
  }

  return {
    artifact: id,
    canProceed: missing.length === 0,
    missing,
    warnings,
    state,
  };
}
