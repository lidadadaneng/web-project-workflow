import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchByName } from '../graph/parsers/mapping-sources';

/**
 * matchByName 命名匹配单测
 *
 * 验证完整中英词典（CN_EN_MAP，30+ 词条）+ 前缀/包含匹配，
 * 替代旧的内联 6 词条 matchRequirementToModules。
 */

test('matchByName: "用户认证" 经 CN_EN_MAP 命中 authService 与 userController', () => {
  const result = matchByName('用户认证', ['authService', 'userController']);
  // 认证 -> auth（前缀命中 0.5）；用户 -> user（前缀命中 0.5）
  assert.equal(result.matches.size, 2, '两个模块都应命中');
  assert.equal(result.matches.get('authService'), 0.5, 'authService 经 认证->auth 前缀命中，应 0.5');
  assert.equal(result.matches.get('userController'), 0.5, 'userController 经 用户->user 前缀命中，应 0.5');
});

test('matchByName: 直接包含匹配权重 0.6', () => {
  // "userservice".includes("user") -> 直接包含 0.6；前缀 0.5；取 max 0.6
  const result = matchByName('user', ['userService']);
  assert.equal(result.matches.get('userService'), 0.6);
});

test('matchByName: 无匹配返回空', () => {
  const result = matchByName('完全不相关的需求名', ['authService', 'userController']);
  assert.equal(result.matches.size, 0);
});

test('matchByName: 中文词典多词条覆盖（订单/支付/商品）', () => {
  // 验证完整词典（非旧 6 词条）生效
  const result = matchByName('订单', ['orderService', 'paymentModule', 'productApi']);
  assert.ok(result.matches.has('orderService'), '订单->order 应命中 orderService');
  // 订单只匹配 order，payment/product 不应被 "订单" 命中
  assert.ok(!result.matches.has('paymentModule'), '订单不应命中 paymentModule');
  assert.ok(!result.matches.has('productApi'), '订单不应命中 productApi');
});

test('matchByName: 大小写无关', () => {
  const result = matchByName('认证', ['AuthService', 'AUTH_SERVICE']);
  assert.ok(result.matches.has('AuthService'));
  assert.ok(result.matches.has('AUTH_SERVICE'));
});
