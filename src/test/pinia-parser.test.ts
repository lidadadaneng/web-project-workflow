import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPiniaStoreFile, parsePiniaStores } from '../graph/parsers/pinia-parser';

const ROOT = '/fake-project';

// ==================== 文件识别 ====================

test('isPiniaStoreFile: stores 目录下的文件识别为 store', () => {
  assert.ok(isPiniaStoreFile('/project/src/stores/auth.js', 'anything'), 'stores 目录应命中');
  assert.ok(isPiniaStoreFile('/project/src/store/user.ts', 'anything'), 'store 目录应命中');
});

test('isPiniaStoreFile: 含 defineStore 的文件即使不在 store 目录也识别', () => {
  assert.ok(isPiniaStoreFile('/project/src/utils/thing.js', 'export const useX = defineStore("x", {})'));
});

test('isPiniaStoreFile: 普通工具文件不识别', () => {
  assert.ok(!isPiniaStoreFile('/project/src/utils/helper.js', 'export function foo() { return 1; }'));
});

// ==================== Options API ====================

test('parsePiniaStores: Options API 解析 state/actions/getters', async () => {
  const source = `
import { defineStore } from 'pinia';

export const useAuthStore = defineStore('useAuthStore', {
  state: () => ({
    user: null,
    token: '',
  }),
  actions: {
    /**
     * 用户登录
     * @param {Object} form - 登录表单
     */
    async login(form) {
      // ...
    },
    logout() {
      // ...
    },
  },
  getters: {
    isLoggedIn: (state) => !!state.token,
    userName: (state) => state.user?.name,
  },
});
`;

  const result = await parsePiniaStores('/fake-project/src/stores/auth.js', ROOT, source, 'javascript');

  // store 节点
  assert.equal(result.stores.length, 1, '应有 1 个 store 节点');
  const store = result.stores[0];
  assert.equal(store.name, 'useAuthStore');
  assert.equal(store.type, 'pinia-store');
  assert.equal(store.level, 'L3');
  assert.equal(store.attrs.filePath, 'src/stores/auth.js');

  // action 节点
  const actions = result.elements.filter((e) => e.type === 'pinia-action');
  assert.equal(actions.length, 2, '应有 2 个 action');
  const loginAction = actions.find((a) => a.name === 'login');
  assert.ok(loginAction, 'login action 应存在');
  assert.equal(loginAction!.attrs.parentName, 'useAuthStore');
  assert.ok(loginAction!.attrs.jsDoc?.includes('用户登录'), 'login action 应包含 JSDoc');
  assert.ok(loginAction!.attrs.signature?.includes('login'), '应包含函数签名');

  const logoutAction = actions.find((a) => a.name === 'logout');
  assert.ok(logoutAction, 'logout action 应存在');

  // getter 节点
  const getters = result.elements.filter((e) => e.type === 'pinia-getter');
  assert.equal(getters.length, 2, '应有 2 个 getter');
  assert.ok(getters.find((g) => g.name === 'isLoggedIn'));
  assert.ok(getters.find((g) => g.name === 'userName'));

  // state 节点
  const states = result.elements.filter((e) => e.type === 'pinia-state');
  assert.equal(states.length, 2, '应有 2 个 state 属性');
  assert.ok(states.find((s) => s.name === 'user'));
  assert.ok(states.find((s) => s.name === 'token'));

  // 所有元素都有 parentName
  for (const el of result.elements) {
    assert.equal(el.attrs.parentName, 'useAuthStore', `${el.name} 的 parentName 应为 useAuthStore`);
    assert.equal(el.level, 'L4');
  }
});

test('parsePiniaStores: Options API 中 state 为普通函数形式', async () => {
  const source = `
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state() {
    return {
      count: 0,
    };
  },
  actions: {
    increment() {
      this.count++;
    },
  },
});
`;

  const result = await parsePiniaStores('/fake-project/src/stores/counter.js', ROOT, source, 'javascript');

  assert.equal(result.stores.length, 1);
  const states = result.elements.filter((e) => e.type === 'pinia-state');
  assert.equal(states.length, 1);
  assert.equal(states[0].name, 'count');

  const actions = result.elements.filter((e) => e.type === 'pinia-action');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].name, 'increment');
});

// ==================== Setup API ====================

test('parsePiniaStores: Setup API 识别 ref/reactive/computed', async () => {
  const source = `
import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';

export const useUserStore = defineStore('useUserStore', () => {
  const user = ref(null);
  const profile = reactive({ name: '', age: 0 });
  const displayName = computed(() => user.value?.name || 'Guest');

  function updateUser(data) {
    user.value = data;
  }

  const clearUser = () => {
    user.value = null;
  };

  return {
    user,
    profile,
    displayName,
    updateUser,
    clearUser,
  };
});
`;

  const result = await parsePiniaStores('/fake-project/src/stores/user.js', ROOT, source, 'javascript');

  assert.equal(result.stores.length, 1, '应有 1 个 store 节点');
  assert.equal(result.stores[0].name, 'useUserStore');

  // ref + reactive → state
  const states = result.elements.filter((e) => e.type === 'pinia-state');
  assert.ok(states.find((s) => s.name === 'user'), 'user (ref) 应为 state');
  assert.ok(states.find((s) => s.name === 'profile'), 'profile (reactive) 应为 state');

  // computed → getter
  const getters = result.elements.filter((e) => e.type === 'pinia-getter');
  assert.ok(getters.find((g) => g.name === 'displayName'), 'displayName (computed) 应为 getter');

  // function + 箭头函数 → action
  const actions = result.elements.filter((e) => e.type === 'pinia-action');
  assert.ok(actions.find((a) => a.name === 'updateUser'), 'updateUser (function) 应为 action');
  assert.ok(actions.find((a) => a.name === 'clearUser'), 'clearUser (arrow fn) 应为 action');
});

test('parsePiniaStores: 非 store 文件解析为空', async () => {
  const source = `
export function add(a, b) {
  return a + b;
}
export const PI = 3.14;
`;

  const result = await parsePiniaStores('/fake-project/src/utils/math.js', ROOT, source, 'javascript');
  assert.equal(result.stores.length, 0, '非 store 文件不应有 store 节点');
  assert.equal(result.elements.length, 0, '非 store 文件不应有 pinia 元素');
});

// ==================== 多 store ====================

test('parsePiniaStores: 同一文件多个 defineStore 调用', async () => {
  const source = `
import { defineStore } from 'pinia';

export const useAStore = defineStore('aStore', {
  state: () => ({ x: 1 }),
  actions: { doA() {} },
});

export const useBStore = defineStore('bStore', {
  state: () => ({ y: 2 }),
  actions: { doB() {} },
});
`;

  const result = await parsePiniaStores('/fake-project/src/stores/multi.js', ROOT, source, 'javascript');
  assert.equal(result.stores.length, 2, '应有 2 个 store 节点');
  assert.ok(result.stores.find((s) => s.name === 'aStore'));
  assert.ok(result.stores.find((s) => s.name === 'bStore'));
  // 每个 store 的 action 有正确的 parentName
  const actions = result.elements.filter((e) => e.type === 'pinia-action');
  assert.equal(actions.length, 2);
  const doA = actions.find((a) => a.name === 'doA');
  const doB = actions.find((a) => a.name === 'doB');
  assert.equal(doA!.attrs.parentName, 'aStore');
  assert.equal(doB!.attrs.parentName, 'bStore');
});
