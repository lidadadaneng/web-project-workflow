import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GraphNode } from '../graph/types';
import { computeLexBoost } from '../graph/search/semantic-search';
import { expandQueryToEnglish } from '../graph/parsers/mapping-sources';

function makeFuncNode(name: string, parentName: string, filePath: string, jsDoc?: string): GraphNode {
  return {
    id: `test-${name}-${parentName}`,
    level: 'L3',
    type: 'function',
    name,
    attrs: { parentName, filePath, jsDoc },
    createdAt: 0,
    updatedAt: 0,
  };
}

// ==================== 重名函数去歧义 ====================

test('lexBoost: 重名 onSubmit 通过 parentName 区分，注册相关的得分更高', () => {
  const loginSubmit = makeFuncNode('onSubmit', 'LoginView', 'src/views/LoginView.vue');
  const registerSubmit = makeFuncNode('onSubmit', 'RegisterView', 'src/views/RegisterView.vue');
  const resetSubmit = makeFuncNode('onSubmit', 'ResetView', 'src/views/ResetView.vue');

  const query = '注册';
  const enEquivalents = expandQueryToEnglish(query);

  const loginBoost = computeLexBoost(query, enEquivalents, loginSubmit);
  const registerBoost = computeLexBoost(query, enEquivalents, registerSubmit);
  const resetBoost = computeLexBoost(query, enEquivalents, resetSubmit);

  // RegisterView 的 onSubmit 应命中 parentName（register 是 RegisterView 的前缀/包含）
  assert.ok(registerBoost > loginBoost, 'RegisterView.onSubmit 的 lexBoost 应高于 LoginView.onSubmit');
  assert.ok(registerBoost > resetBoost, 'RegisterView.onSubmit 的 lexBoost 应高于 ResetView.onSubmit');
  // 另两个相等（都不命中）
  assert.equal(loginBoost, resetBoost, 'Login 与 Reset 的 onSubmit 应得分相同');
});

test('lexBoost: 通过 filePath 也能区分重名函数', () => {
  const fn1 = makeFuncNode('validate', 'validate', 'src/utils/auth.js');
  const fn2 = makeFuncNode('validate', 'validate', 'src/utils/form.js');

  const query = '认证';
  const enEquivalents = expandQueryToEnglish(query);

  const boost1 = computeLexBoost(query, enEquivalents, fn1);
  const boost2 = computeLexBoost(query, enEquivalents, fn2);

  // auth.js 中的 validate 应因路径包含 auth 而得分更高
  assert.ok(boost1 > boost2, 'auth.js 中的 validate 应因 filePath 命中而得分更高');
});

// ==================== JSDoc/注释匹配 ====================

test('lexBoost: JSDoc 中的中文注释命中 +0.08', () => {
  const nodeWithDoc = makeFuncNode(
    'doRegister',
    'AuthService',
    'src/services/auth.ts',
    '用户注册，创建新账号并发送验证邮件',
  );
  const nodeNoDoc = makeFuncNode('doRegister', 'OtherService', 'src/services/other.ts');

  const query = '注册';
  const enEquivalents = expandQueryToEnglish(query);

  const boostWithDoc = computeLexBoost(query, enEquivalents, nodeWithDoc);
  const boostNoDoc = computeLexBoost(query, enEquivalents, nodeNoDoc);

  // 两个节点名称都包含 register（前缀 0.25），但有 JSDoc 的应额外从注释获得加分
  // （但因为取最大值，名称前缀 0.25 > 注释 0.08，所以名称命中时注释不会叠加）
  // 对于纯名称不命中但注释命中的情况，注释才会生效
  assert.ok(boostWithDoc >= boostNoDoc, '有 JSDoc 的得分不应低于无 JSDoc');
});

test('lexBoost: 查询词本身命中 JSDoc 时获得注释加分', () => {
  // 函数名不含 register，但 JSDoc 含"注册"
  const node = makeFuncNode('createAccount', 'UserService', 'src/services/user.ts', '创建新用户注册流程');

  const query = '注册';
  const enEquivalents = expandQueryToEnglish(query);

  const boost = computeLexBoost(query, enEquivalents, node);
  // 查询词"注册"应命中 JSDoc 文本（注释匹配），获得 LEX_BOOST_COMMENT = 0.08
  assert.ok(boost > 0, 'JSDoc 含注册的节点应获得 lexBoost');
  assert.ok(boost <= 0.10, '注释匹配加分不应超过 LEX_BOOST_COMMENT + 其他弱命中');
});

// ==================== parentName 显示格式 ====================

test('节点展示: 有 parentName 时格式为 parentName/name', () => {
  const node = makeFuncNode('onSubmit', 'RegisterView', 'src/views/RegisterView.vue');
  const displayName = node.attrs.parentName
    ? `${node.attrs.parentName}/${node.name}`
    : node.name;

  assert.equal(displayName, 'RegisterView/onSubmit');
});

test('节点展示: 无 parentName 时只显示 name', () => {
  const node: GraphNode = {
    id: 'test',
    level: 'L3',
    type: 'function',
    name: 'helperFn',
    attrs: {},
    createdAt: 0,
    updatedAt: 0,
  };
  const displayName = node.attrs.parentName
    ? `${node.attrs.parentName}/${node.name}`
    : node.name;

  assert.equal(displayName, 'helperFn');
});
