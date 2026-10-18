/**
 * 向量构建测试 - 验证新增节点类型的向量化文本
 */
import { describe, it, expect } from 'vitest';
import { getNodeVectorText } from '../graph/builders/vector-builder';
import type { GraphNode } from '../graph/types';

function makeNode(type: string, name: string, attrs: Record<string, any> = {}): GraphNode {
  return {
    id: `test-${type}-${name}`,
    level: 'L3',
    type: type as any,
    name,
    attrs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('getNodeVectorText - 新增节点类型', () => {
  describe('Vuex 节点', () => {
    it('vuex-store 生成正确文本', () => {
      const node = makeNode('vuex-store', 'user', {
        description: '用户状态管理',
        filePath: 'store/user.js',
      });
      const text = getNodeVectorText(node);
      expect(text).toContain('user');
      expect(text).toContain('Vuex');
      expect(text).toContain('用户状态管理');
    });

    it('vuex-state / vuex-mutation / vuex-action / vuex-getter', () => {
      const stateNode = makeNode('vuex-state', 'token', { parentName: 'user', filePath: 'store/user.js' });
      const mutNode = makeNode('vuex-mutation', 'setToken', { parentName: 'user' });
      const actNode = makeNode('vuex-action', 'login', { parentName: 'user' });
      const getNode = makeNode('vuex-getter', 'isLoggedIn', { parentName: 'user' });

      expect(getNodeVectorText(stateNode)).toContain('token');
      expect(getNodeVectorText(stateNode)).toContain('state');
      expect(getNodeVectorText(mutNode)).toContain('setToken');
      expect(getNodeVectorText(mutNode)).toContain('mutation');
      expect(getNodeVectorText(actNode)).toContain('login');
      expect(getNodeVectorText(actNode)).toContain('action');
      expect(getNodeVectorText(getNode)).toContain('isLoggedIn');
      expect(getNodeVectorText(getNode)).toContain('getter');
    });
  });

  describe('Redux 节点', () => {
    it('redux-slice 生成正确文本', () => {
      const node = makeNode('redux-slice', 'counter', {
        description: '计数器状态',
        filePath: 'features/counter/counterSlice.ts',
      });
      const text = getNodeVectorText(node);
      expect(text).toContain('counter');
      expect(text).toContain('Redux');
      expect(text).toContain('Slice');
    });

    it('redux state / reducer / action / selector', () => {
      const state = makeNode('redux-state', 'value', { parentName: 'counter' });
      const reducer = makeNode('redux-reducer', 'increment', { parentName: 'counter' });
      const action = makeNode('redux-action', 'counter/increment', {
        parentName: 'counter',
        actionType: 'counter/increment',
      });
      const selector = makeNode('redux-selector', 'selectCount', { parentName: 'counter' });

      expect(getNodeVectorText(state)).toContain('value');
      expect(getNodeVectorText(reducer)).toContain('increment');
      expect(getNodeVectorText(reducer)).toContain('reducer');
      expect(getNodeVectorText(action)).toContain('counter/increment');
      expect(getNodeVectorText(action)).toContain('actionType');
      expect(getNodeVectorText(selector)).toContain('selectCount');
      expect(getNodeVectorText(selector)).toContain('selector');
    });
  });

  describe('微信小程序节点', () => {
    it('mp-app 生成正确文本', () => {
      const node = makeNode('mp-app', 'app', {
        description: '小程序应用',
        platform: 'mp-weixin',
      });
      node.level = 'L1';
      const text = getNodeVectorText(node);
      expect(text).toContain('app');
      expect(text).toContain('微信小程序');
    });

    it('mp-page 生成正确文本', () => {
      const node = makeNode('mp-page', 'index', {
        pageTitle: '首页',
        pagePath: 'pages/index/index',
        isTabBar: true,
      });
      node.level = 'L2';
      const text = getNodeVectorText(node);
      expect(text).toContain('首页');
      expect(text).toContain('微信小程序页面');
      expect(text).toContain('TabBar');
    });

    it('mp-component 生成正确文本', () => {
      const node = makeNode('mp-component', 'my-header', {
        pagePath: 'components/my-header/my-header',
      });
      node.level = 'L2';
      const text = getNodeVectorText(node);
      expect(text).toContain('my-header');
      expect(text).toContain('自定义组件');
    });

    it('mp-method / mp-lifecycle / mp-data / mp-property', () => {
      const method = makeNode('mp-method', 'onItemTap', { parentName: 'index' });
      const lifecycle = makeNode('mp-lifecycle', 'onLoad', { parentName: 'index', lifecycleType: 'page' });
      const data = makeNode('mp-data', 'list', { parentName: 'index' });
      const prop = makeNode('mp-property', 'title', { parentName: 'my-header' });

      expect(getNodeVectorText(method)).toContain('onItemTap');
      expect(getNodeVectorText(method)).toContain('方法');
      expect(getNodeVectorText(lifecycle)).toContain('onLoad');
      expect(getNodeVectorText(lifecycle)).toContain('生命周期');
      expect(getNodeVectorText(data)).toContain('list');
      expect(getNodeVectorText(data)).toContain('data');
      expect(getNodeVectorText(prop)).toContain('title');
      expect(getNodeVectorText(prop)).toContain('组件属性');
    });
  });

  describe('uni-app 节点', () => {
    it('uni-page 生成正确文本', () => {
      const node = makeNode('uni-page', 'detail', {
        pageTitle: '详情页',
        pagePath: 'pages/detail/detail',
        subPackage: 'subA',
        platform: 'uni-app (MP-WEIXIN, H5)',
      });
      node.level = 'L2';
      const text = getNodeVectorText(node);
      expect(text).toContain('详情页');
      expect(text).toContain('uni-app');
      expect(text).toContain('subA');
      expect(text).toContain('MP-WEIXIN');
    });
  });
});
