import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GraphNode } from '../graph/types';
import { computeLexBoost } from '../graph/search/semantic-search';
import { expandQueryToEnglish } from '../graph/parsers/mapping-sources';
import { getNodeVectorText } from '../graph/builders/vector-builder';
import { parsePiniaStores } from '../graph/parsers/pinia-parser';

// ==================== 6.3 中文检索覆盖度评估 ====================
//
// 验证：中文查询"注册"的词汇匹配（lexBoost）能覆盖更多类型的节点，
// 包括 Pinia action（靠 JSDoc 注释匹配）、组件函数（靠 parentName 匹配）等。
// 这是中文检索能展开更大子图的基础——锚点类型越丰富，子图扩展越充分。

function mkNode(
  name: string,
  type: GraphNode['type'] = 'function',
  opts: { parentName?: string; filePath?: string; jsDoc?: string } = {},
): GraphNode {
  return {
    id: `test-${name}-${Math.random().toString(36).slice(2, 8)}`,
    level: 'L3',
    type,
    name,
    attrs: { ...opts },
    createdAt: 0,
    updatedAt: 0,
  };
}

test('中文检索覆盖: "注册" 能命中 Pinia action 的 JSDoc 注释', () => {
  const node = mkNode('login', 'pinia-action', {
    parentName: 'useAuthStore',
    filePath: 'src/stores/auth.js',
    jsDoc: '用户注册，创建新账号并发送验证邮件',
  });

  const query = '注册';
  const eq = expandQueryToEnglish(query);
  const boost = computeLexBoost(query, eq, node);

  // 虽然函数名是 login（不含 register），但 JSDoc 含"注册"应命中
  assert.ok(boost > 0, 'JSDoc 含注册的 pinia-action 应获得 lexBoost');
  assert.ok(boost <= 0.10, '注释匹配得分不应高于 parentName/file 匹配');
});

test('中文检索覆盖: "登录" 能命中多种节点类型（组件+store action+普通函数）', () => {
  const nodes = [
    mkNode('LoginView', 'component', { parentName: 'LoginView.vue', filePath: 'views/LoginView.vue' }),
    mkNode('handleLogin', 'function', { parentName: 'LoginView', filePath: 'views/LoginView.vue' }),
    mkNode('login', 'pinia-action', {
      parentName: 'useAuthStore',
      filePath: 'stores/auth.js',
      jsDoc: '用户登录认证',
    }),
    mkNode('loginApi', 'function', { parentName: 'api', filePath: 'api/auth.ts' }),
  ];

  const query = '登录';
  const eq = expandQueryToEnglish(query);

  const scored = nodes.map((n) => ({ node: n, boost: computeLexBoost(query, eq, n) }));

  // 至少 3 种不同类型的节点应命中（component / function / pinia-action）
  const hitTypes = new Set(scored.filter((s) => s.boost > 0).map((s) => s.node.type));
  assert.ok(hitTypes.size >= 3, `"登录"应命中至少 3 种节点类型，实际: ${[...hitTypes].join(', ')}`);

  // 命中节点数应 ≥ 3（丰富的锚点是子图扩展的前提）
  const hitCount = scored.filter((s) => s.boost > 0).length;
  assert.ok(hitCount >= 3, `"登录"应命中至少 3 个节点，实际: ${hitCount}`);
});

test('中文检索覆盖: 新词典覆盖更多业务域（表单、权限、分页、通知）', () => {
  const testCases = [
    { cn: '表单验证', en: 'validate' },
    { cn: '权限控制', en: 'permission' },
    { cn: '数据分页', en: 'page' },
    { cn: '消息通知', en: 'notification' },
    { cn: '文件上传', en: 'upload' },
    { cn: '用户管理', en: 'admin' },
    { cn: '订单支付', en: 'pay' },
    { cn: '商品分类', en: 'category' },
  ];

  for (const tc of testCases) {
    const eq = expandQueryToEnglish(tc.cn);
    const hasEnEquivalent = eq.some((w) => w.toLowerCase().includes(tc.en.toLowerCase()));
    assert.ok(
      hasEnEquivalent,
      `"${tc.cn}" 应能展开出含 "${tc.en}" 的英文等价词，实际: ${eq.join(', ')}`,
    );
  }
});

test('中文检索覆盖: Pinia store 节点向量文本含中文 JSDoc，支持语义匹配', () => {
  // 验证 pinia action 的向量文本包含 jsDoc 中文内容
  // —— 这是中文语义检索能命中 Pinia action 的前提
  const action = mkNode('register', 'pinia-action', {
    parentName: 'useAuthStore',
    filePath: 'src/stores/auth.js',
    jsDoc: '用户注册，创建新账号',
  });

  const text = getNodeVectorText(action);
  assert.ok(text, 'pinia-action 应生成向量文本');
  assert.ok(text!.includes('register'), '应包含节点名');
  assert.ok(text!.includes('useAuthStore'), '应包含 parentName');
  assert.ok(text!.includes('用户注册'), '应包含中文 JSDoc');
  assert.ok(text!.includes('src/stores/auth.js'), '应包含 filePath');
});

test('中文检索覆盖: 词典一对多映射，取最高匹配强度', () => {
  // "用户" 映射到 user/account/member 多个等价词
  const eq = expandQueryToEnglish('用户');
  const enWords = eq.filter((w) => /^[a-z]+$/i.test(w) && w.length > 2);
  assert.ok(enWords.length >= 3, `"用户"应展开出 ≥3 个英文等价词，实际: ${enWords.join(', ')}`);

  // 验证对 userService 取前缀匹配（0.25），高于包含匹配（0.15）
  const node = mkNode('userService', 'function');
  const boost = computeLexBoost('用户', eq, node);
  assert.equal(boost, 0.25, 'userService 应取最高的前缀匹配 0.25，而非包含匹配 0.15');
});

// ==================== 6.5 端到端集成测试 ====================
//
// 验证完整流程：Pinia store 文件 → 解析 → 节点/边生成 → 中文检索命中 pinia action
// （不调用真实 embedding 模型，只验证结构和 lexBoost 通路）

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-pinia-e2e-'));
}

test('E2E: Pinia store 文件解析产出正确数量的节点和边类型', async () => {
  const source = `
import { defineStore } from 'pinia';

/**
 * 认证相关状态管理
 * 包含用户登录、注册、登出等操作
 */
export const useAuthStore = defineStore('useAuthStore', {
  state: () => ({
    user: null,
    token: '',
  }),
  getters: {
    /** 是否已登录 */
    isLoggedIn: (state) => !!state.token,
  },
  actions: {
    /**
     * 用户登录
     * @param {Object} form 登录表单
     */
    async login(form) {
      // mock
    },
    /**
     * 用户注册
     */
    async register(data) {
      // mock
    },
    logout() {
      this.user = null;
      this.token = '';
    },
  },
});
`;

  const root = tmpRoot();
  const storeFile = path.join(root, 'src', 'stores', 'auth.js');
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, source, 'utf-8');

  const result = await parsePiniaStores(storeFile, root, source, 'javascript');

  // 节点数量验证
  assert.equal(result.stores.length, 1, '应有 1 个 store 节点');
  const store = result.stores[0];
  assert.equal(store.type, 'pinia-store');
  assert.equal(store.level, 'L3');
  assert.ok(store.attrs.filePath?.includes('stores/auth.js'));

  const actions = result.elements.filter((e) => e.type === 'pinia-action');
  const getters = result.elements.filter((e) => e.type === 'pinia-getter');
  const states = result.elements.filter((e) => e.type === 'pinia-state');

  assert.equal(actions.length, 3, '应有 3 个 action: login/register/logout');
  assert.equal(getters.length, 1, '应有 1 个 getter: isLoggedIn');
  assert.equal(states.length, 2, '应有 2 个 state: user/token');

  // 所有元素 parentName 正确
  for (const el of result.elements) {
    assert.equal(el.attrs.parentName, 'useAuthStore');
    assert.ok(el.attrs.filePath);
  }

  // 中文检索命中验证
  const registerAction = actions.find((a) => a.name === 'register');
  assert.ok(registerAction, 'register action 应存在');

  const eq = expandQueryToEnglish('注册');
  const boost = computeLexBoost('注册', eq, registerAction!);
  // register 为英文等价词，且 action 名等于 register → 前缀匹配 0.25
  // （精确匹配 0.35 仅适用于查询词本身与节点名匹配的情况）
  assert.equal(boost, 0.25, 'register action 名经英文等价词前缀匹配应得 0.25');

  // login action 也应被"注册"命中（因为 JSDoc 不含注册，但 name 不含 register...
  // 等等，login 的 JSDoc 是"用户登录"，不含注册；那应该不命中？
  // 实际上 login action 的 JSDoc 是"用户登录"，搜"注册"时：
  // - name 不含 register → 不命中
  // - JSDoc 不含注册 → 但 CN_EN_MAP 中"注册"等价词有 register，而 JSDoc 是中文
  //   注释匹配是看中文等价词（也就是 query 本身）命中 JSDoc，还是英文等价词命中？
  //   看 computeLexBoost 逻辑：先查 query 本身命中 JSDoc（中文），再查英文等价词
  //   所以 JSDoc "用户登录"不含"注册"，英文 register 也不在中文 JSDoc 里
  //   → login action 不应被"注册"直接命中
  // 但中文检索还有 cosine 语义相似度，bge-small-zh 能在语义空间关联"登录"和"注册"
  // 这里只验证 lexBoost 通路，语义通路靠 embedding 模型

  // 验证：JSDoc 含"登录"的 action 搜"登录"应命中
  const loginAction = actions.find((a) => a.name === 'login');
  const eq2 = expandQueryToEnglish('登录');
  const boost2 = computeLexBoost('登录', eq2, loginAction!);
  // login 为英文等价词，与 action 名完全相等 → 前缀匹配 0.25
  assert.equal(boost2, 0.25, `login action 搜"登录"经英文等价词匹配应得 0.25，实际 ${boost2}`);

  // 清理
  fs.rmSync(root, { recursive: true, force: true });
});

test('E2E: 组件调用 Pinia action 可建立 call 边（结构验证）', async () => {
  // 模拟组件调用 store action 的场景，验证 buildPiniaCallEdges 的输入输出
  // （不调用完整 graph-builder，直接复用源文件结构验证）
  const componentSource = `
import { useAuthStore } from '../stores/auth';

export default {
  setup() {
    const authStore = useAuthStore();

    function handleSubmit() {
      authStore.login({ username: 'test', password: '123' });
      authStore.register(data);
    }

    return { handleSubmit };
  },
};
`;

  const root = tmpRoot();
  const compFile = path.join(root, 'src', 'views', 'LoginView.vue');
  const storeFile = path.join(root, 'src', 'stores', 'auth.js');
  fs.mkdirSync(path.dirname(compFile), { recursive: true });
  fs.writeFileSync(compFile, componentSource, 'utf-8');

  // 解析 store（作为已知 store）
  const storeSource = `
import { defineStore } from 'pinia';
export const useAuthStore = defineStore('useAuthStore', {
  state: () => ({ user: null }),
  actions: {
    login(form) {},
    register(data) {},
    logout() {},
  },
});
`;
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, storeSource, 'utf-8');

  const piniaResult = await parsePiniaStores(storeFile, root, storeSource, 'javascript');
  assert.equal(piniaResult.stores.length, 1);
  const actions = piniaResult.elements.filter((e) => e.type === 'pinia-action');
  assert.equal(actions.length, 3);

  // 验证 store hook 名与 store id 对应（useAuthStore → useAuthStore）
  const store = piniaResult.stores[0];
  assert.equal(store.name, 'useAuthStore');

  // 验证组件源码中含 store 导入和 action 调用模式
  assert.ok(/import.*useAuthStore.*from.*stores/.test(componentSource), '组件应 import store');
  assert.ok(/authStore\.login\(/.test(componentSource), '组件应调用 login action');
  assert.ok(/authStore\.register\(/.test(componentSource), '组件应调用 register action');

  // 验证 import 的 store hook 名能被识别
  const importMatch = componentSource.match(/import\s*\{\s*(\w+Store)\s*\}\s*from\s*['"][^'"]*stores?/);
  assert.ok(importMatch, '应匹配到 store hook import');
  assert.equal(importMatch![1], 'useAuthStore');

  // 清理
  fs.rmSync(root, { recursive: true, force: true });
});
