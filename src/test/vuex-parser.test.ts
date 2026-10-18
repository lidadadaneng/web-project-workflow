/**
 * Vuex 解析器单元测试
 */
import { describe, it, expect } from 'vitest';
import { isVuexStoreFile, parseVuexStores } from '../graph/parsers/vuex-parser';

const ROOT = '/fake-project';

describe('isVuexStoreFile', () => {
  it('识别 store 目录下包含 mutations/actions 的文件', () => {
    const source = `
      export default {
        state: { count: 0 },
        mutations: { increment(state) { state.count++ } },
        actions: { incrementAsync({ commit }) { commit('increment') } },
        namespaced: true,
      };
    `;
    expect(isVuexStoreFile('/fake-project/src/store/modules/counter.js', source)).toBe(true);
  });

  it('识别包含 new Vuex.Store 的根文件', () => {
    const source = `
      import Vuex from 'vuex';
      export default new Vuex.Store({
        state: {},
        mutations: {},
        actions: {},
        modules: {},
      });
    `;
    expect(isVuexStoreFile('/fake-project/src/store/index.js', source)).toBe(true);
  });

  it('不识别普通工具函数文件', () => {
    const source = `
      export function formatDate(date) {
        return date.toISOString();
      }
    `;
    expect(isVuexStoreFile('/fake-project/src/utils/date.js', source)).toBe(false);
  });

  it('不识别只有 state 没有其他核心字段的文件', () => {
    const source = `
      export const state = { count: 0 };
    `;
    expect(isVuexStoreFile('/fake-project/src/store/state.js', source)).toBe(false);
  });
});

describe('parseVuexStores - 模块文件（export default）', () => {
  it('解析 Options API 风格的模块', async () => {
    const source = `
      export default {
        namespaced: true,
        state: {
          user: null,
          token: '',
        },
        mutations: {
          SET_USER(state, user) { state.user = user; },
          SET_TOKEN(state, token) { state.token = token; },
        },
        actions: {
          async login({ commit }, credentials) {
            const { data } = await api.login(credentials);
            commit('SET_USER', data.user);
            commit('SET_TOKEN', data.token);
          },
          logout({ commit }) {
            commit('SET_USER', null);
            commit('SET_TOKEN', '');
          },
        },
        getters: {
          isLoggedIn: (state) => !!state.user,
          userName: (state) => state.user?.name,
        },
      };
    `;

    const result = await parseVuexStores(
      '/fake-project/src/store/modules/user.js',
      ROOT,
      source,
      'javascript',
    );

    expect(result.stores.length).toBe(1);
    const store = result.stores[0];
    expect(store.type).toBe('vuex-store');
    expect(store.name).toBe('user');
    expect(store.attrs.namespaced).toBe(true);

    const stateNames = result.elements.filter((e) => e.type === 'vuex-state').map((e) => e.name);
    expect(stateNames).toContain('user');
    expect(stateNames).toContain('token');

    const mutationNames = result.elements.filter((e) => e.type === 'vuex-mutation').map((e) => e.name);
    expect(mutationNames).toContain('SET_USER');
    expect(mutationNames).toContain('SET_TOKEN');

    const actionNames = result.elements.filter((e) => e.type === 'vuex-action').map((e) => e.name);
    expect(actionNames).toContain('login');
    expect(actionNames).toContain('logout');

    const getterNames = result.elements.filter((e) => e.type === 'vuex-getter').map((e) => e.name);
    expect(getterNames).toContain('isLoggedIn');
    expect(getterNames).toContain('userName');
  });

  it('解析 state 为函数形式的模块', async () => {
    const source = `
      export default {
        namespaced: true,
        state: () => ({
          list: [],
          loading: false,
        }),
        mutations: {
          SET_LIST(state, list) { state.list = list; },
        },
        actions: {},
      };
    `;

    const result = await parseVuexStores(
      '/fake-project/src/store/modules/list.js',
      ROOT,
      source,
      'javascript',
    );

    const stateNames = result.elements.filter((e) => e.type === 'vuex-state').map((e) => e.name);
    expect(stateNames).toContain('list');
    expect(stateNames).toContain('loading');
  });
});

describe('parseVuexStores - 嵌套模块', () => {
  it('递归解析 modules 中的子模块', async () => {
    const source = `
      export default {
        namespaced: true,
        state: { root: true },
        mutations: { ROOT_MUTATION() {} },
        modules: {
          profile: {
            namespaced: true,
            state: { name: '' },
            mutations: { SET_NAME(state, name) { state.name = name; } },
            actions: { updateName({ commit }, name) { commit('SET_NAME', name); } },
          },
          settings: {
            namespaced: true,
            state: { theme: 'light' },
            getters: { theme: (s) => s.theme },
          },
        },
      };
    `;

    const result = await parseVuexStores(
      '/fake-project/src/store/modules/user.js',
      ROOT,
      source,
      'javascript',
    );

    const storeNames = result.stores.map((s) => s.name).sort();
    expect(storeNames).toEqual(['user', 'user/profile', 'user/settings'].sort());

    const profileStore = result.stores.find((s) => s.name === 'user/profile');
    expect(profileStore?.attrs.namespaced).toBe(true);

    const profileMutations = result.elements.filter(
      (e) => e.type === 'vuex-mutation' && e.attrs.parentName === 'user/profile',
    ).map((e) => e.name);
    expect(profileMutations).toContain('SET_NAME');
  });
});

describe('parseVuexStores - 根 store', () => {
  it('解析 new Vuex.Store 形式的根 store', async () => {
    const source = `
      import Vue from 'vue';
      import Vuex from 'vuex';
      import user from './modules/user';
      import counter from './modules/counter';

      Vue.use(Vuex);

      export default new Vuex.Store({
        state: { appName: 'MyApp' },
        mutations: {
          SET_APP_NAME(state, name) { state.appName = name; },
        },
        actions: {},
        getters: {
          appTitle: (state) => state.appName,
        },
        modules: {
          user,
          counter,
        },
      });
    `;

    const result = await parseVuexStores(
      '/fake-project/src/store/index.js',
      ROOT,
      source,
      'javascript',
    );

    const rootStore = result.stores.find((s) => s.name === 'root');
    expect(rootStore).toBeDefined();

    const stateNames = result.elements.filter(
      (e) => e.type === 'vuex-state' && e.attrs.parentName === 'root',
    ).map((e) => e.name);
    expect(stateNames).toContain('appName');

    const getterNames = result.elements.filter(
      (e) => e.type === 'vuex-getter' && e.attrs.parentName === 'root',
    ).map((e) => e.name);
    expect(getterNames).toContain('appTitle');
  });
});

describe('parseVuexStores - 元素节点属性', () => {
  it('每个元素携带正确的 parentName 和 filePath', async () => {
    const source = `
      export default {
        namespaced: true,
        state: { count: 0 },
        mutations: { INCREMENT(state) { state.count++; } },
        actions: { incrementAsync({ commit }) { commit('INCREMENT'); } },
        getters: { doubleCount: (s) => s.count * 2 },
      };
    `;

    const result = await parseVuexStores(
      '/fake-project/src/store/modules/counter.js',
      ROOT,
      source,
      'javascript',
    );

    for (const elem of result.elements) {
      expect(elem.attrs.parentName).toBe('counter');
      expect(elem.attrs.filePath).toBe('src/store/modules/counter.js');
      expect(elem.level).toBe('L3');
    }
  });
});
