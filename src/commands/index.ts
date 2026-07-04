import { Command } from 'commander';
import { registerInit } from './init';
import { registerNew } from './new';
import { registerList } from './list';
import { registerStatus } from './status';
import { registerCheck } from './check';
import { registerTemplate } from './template';
import { registerDone, registerSkip, registerDecision } from './phase-state';
import { registerApply } from './apply';
import { registerTask } from './task';
import { registerArchive } from './archive';
import { registerMap } from './map';
import { registerSkills } from './skills';

/**
 * 注册所有子命令。
 *
 * 所有命令均已实现，从单独模块 import。
 */
export function registerCommands(program: Command): void {
  registerInit(program);
  registerNew(program);
  registerList(program);
  registerStatus(program);
  registerCheck(program);
  registerTemplate(program);
  registerDone(program);
  registerSkip(program);
  registerDecision(program);
  registerApply(program);
  registerTask(program);
  registerArchive(program);
  registerMap(program);
  registerSkills(program);
}
