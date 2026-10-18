/**
 * 微信小程序解析器单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseWxmlSource,
  parseMiniprogramJs,
  parseMiniprogramProject,
  isMiniprogramProject,
} from '../graph/parsers/miniprogram-parser';

// 创建临时目录
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-mp-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

describe('isMiniprogramProject', () => {
  it('识别标准小程序项目', () => {
    const dir = createTempDir();
    try {
      writeFile(dir, 'app.json', JSON.stringify({ pages: ['pages/index/index'], window: {} }));
      writeFile(dir, 'app.js', 'App({ onLaunch() {} })');
      writeFile(dir, 'project.config.json', JSON.stringify({ appid: 'test' }));
      expect(isMiniprogramProject(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('不识别普通项目', () => {
    const dir = createTempDir();
    try {
      writeFile(dir, 'package.json', '{}');
      expect(isMiniprogramProject(dir)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('识别只有 app.json（含 pages）的项目', () => {
    const dir = createTempDir();
    try {
      writeFile(dir, 'app.json', JSON.stringify({ pages: ['pages/index/index'] }));
      // 没有 app.js 也没有 project.config.json，但有 pages
      // 按照我们的逻辑：必须有 app.json + (app.js + project.config.json) 或 pages 字段
      // 实际上我们的 isMiniprogramProject 在 app.json 存在且 pages 存在时返回 true
      // 让我们重新看一下实现...
      // 实现是：if (fs.existsSync(appJs) && fs.existsSync(projectConfig)) return true;
      // 然后 try 读取 app.json 检查 pages
      // 所以只要 app.json 存在且有 pages 就返回 true
      expect(isMiniprogramProject(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseWxmlSource', () => {
  it('识别内置组件', () => {
    const source = `<view class="container"><text>hello</text><button>click</button></view>`;
    const result = parseWxmlSource(source);
    expect(result.builtinComponents).toContain('view');
    expect(result.builtinComponents).toContain('text');
    expect(result.builtinComponents).toContain('button');
    expect(result.customComponents).toHaveLength(0);
  });

  it('识别自定义组件', () => {
    const source = `<view><my-header title="hello"></my-header><custom-list data="{{list}}" /></view>`;
    const result = parseWxmlSource(source);
    expect(result.customComponents).toContain('my-header');
    expect(result.customComponents).toContain('custom-list');
    expect(result.builtinComponents).toContain('view');
  });

  it('识别事件绑定 bind:tap', () => {
    const source = `<view><button bind:tap="onClick">click</button><input bindinput="onInput" /></view>`;
    const result = parseWxmlSource(source);
    expect(result.eventBindings).toEqual(
      expect.arrayContaining([
        { event: 'tap', handler: 'onClick' },
        { event: 'input', handler: 'onInput' },
      ]),
    );
  });

  it('识别 catch 事件绑定', () => {
    const source = `<view catch:tap="onTap"><button catchlongpress="onLongPress">btn</button></view>`;
    const result = parseWxmlSource(source);
    expect(result.eventBindings).toEqual(
      expect.arrayContaining([
        { event: 'tap', handler: 'onTap' },
        { event: 'longpress', handler: 'onLongPress' },
      ]),
    );
  });

  it('识别数据绑定', () => {
    const source = `<view class="{{className}}"><text>{{userInfo.name}}</text><button hidden="{{isHidden}}">btn</button></view>`;
    const result = parseWxmlSource(source);
    expect(result.dataBindings).toContain('className');
    expect(result.dataBindings).toContain('userInfo');
    expect(result.dataBindings).toContain('isHidden');
  });

  it('不重复统计相同组件/绑定', () => {
    const source = `<view><view></view><view></view></view>`;
    const result = parseWxmlSource(source);
    expect(result.builtinComponents.filter((c) => c === 'view').length).toBe(1);
  });
});

describe('parseMiniprogramJs - Page', () => {
  it('解析标准页面结构', () => {
    const tempDir = createTempDir();
    try {
      const jsPath = path.join(tempDir, 'index.js');
      fs.writeFileSync(jsPath, `
Page({
  data: {
    list: [],
    loading: false,
    title: '首页',
  },
  onLoad(options) {
    console.log('page load');
  },
  onShow() {
    this.loadData();
  },
  loadData() {
    wx.request({ url: '/api/data' });
  },
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },
});
      `, 'utf-8');

      const result = parseMiniprogramJs(jsPath);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('page');
      expect(result!.dataKeys).toContain('list');
      expect(result!.dataKeys).toContain('loading');
      expect(result!.dataKeys).toContain('title');

      const lifecycleNames = result!.lifecycleMethods.map((l) => l.name);
      expect(lifecycleNames).toContain('onLoad');
      expect(lifecycleNames).toContain('onShow');

      expect(result!.methods).toContain('loadData');
      expect(result!.methods).toContain('onItemTap');

      // 字符串拼接的 url 只能匹配到引号内的部分
      const navCall = result!.navigateCalls.find((n) => n.method === 'navigateTo');
      expect(navCall).toBeDefined();
      expect(navCall!.url).toContain('/pages/detail/detail?id=');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('parseMiniprogramJs - Component', () => {
  it('解析标准组件结构', () => {
    const tempDir = createTempDir();
    try {
      const jsPath = path.join(tempDir, 'my-comp.js');
      fs.writeFileSync(jsPath, `
Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    list: Array,
    count: Number,
  },
  data: {
    innerState: false,
  },
  methods: {
    onTap(e) {
      this.triggerEvent('click', e.detail);
    },
    updateData() {
      this.setData({ innerState: true });
    },
  },
  lifetimes: {
    attached() {
      console.log('attached');
    },
    ready() {
      console.log('ready');
    },
  },
});
      `, 'utf-8');

      const result = parseMiniprogramJs(jsPath);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('component');

      expect(result!.properties).toContain('title');
      expect(result!.properties).toContain('list');
      expect(result!.properties).toContain('count');

      expect(result!.dataKeys).toContain('innerState');

      expect(result!.methods).toContain('onTap');
      expect(result!.methods).toContain('updateData');

      const lifecycleNames = result!.lifecycleMethods.map((l) => l.name);
      expect(lifecycleNames).toContain('attached');
      expect(lifecycleNames).toContain('ready');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('parseMiniprogramProject', () => {
  it('完整解析小程序项目', () => {
    const dir = createTempDir();
    try {
      // app.json
      writeFile(dir, 'app.json', JSON.stringify({
        pages: [
          'pages/index/index',
          'pages/detail/detail',
        ],
        window: {
          navigationBarTitleText: 'Demo',
        },
        tabBar: {
          list: [
            { pagePath: 'pages/index/index', text: '首页' },
          ],
        },
        subPackages: [
          {
            root: 'subA',
            name: 'subA',
            pages: ['pages/sub/sub1'],
          },
        ],
      }));

      // app.js
      writeFile(dir, 'app.js', `
App({
  globalData: {
    userInfo: null,
    token: '',
  },
  onLaunch() {
    console.log('app launch');
  },
  onShow() {},
});
      `);

      // pages/index/index.js
      writeFile(dir, 'pages/index/index.js', `
Page({
  data: { list: [], loading: false },
  onLoad() {},
  goDetail() {
    wx.navigateTo({ url: '/pages/detail/detail?id=1' });
  },
  goSub() {
    wx.navigateTo({ url: '/subA/pages/sub/sub1' });
  },
});
      `);

      writeFile(dir, 'pages/index/index.wxml', `
<view class="container">
  <my-header title="{{title}}" bind:back="onBack"></my-header>
  <view wx:for="{{list}}" bind:tap="onItemTap">{{item.name}}</view>
  <button bind:tap="goDetail">去详情</button>
</view>
      `);

      writeFile(dir, 'pages/index/index.json', JSON.stringify({
        usingComponents: {
          'my-header': '/components/my-header/my-header',
        },
        navigationBarTitleText: '首页',
      }));

      // pages/detail/detail.js
      writeFile(dir, 'pages/detail/detail.js', `
Page({
  data: { detail: null },
  onLoad(options) {
    const id = options.id;
  },
  onBack() {
    wx.navigateBack();
  },
});
      `);

      writeFile(dir, 'pages/detail/detail.wxml', `<view>{{detail}}</view>`);
      writeFile(dir, 'pages/detail/detail.json', '{}');

      // components/my-header/my-header.js
      writeFile(dir, 'components/my-header/my-header.js', `
Component({
  properties: { title: String },
  methods: {
    onBackTap() { this.triggerEvent('back'); },
  },
});
      `);
      writeFile(dir, 'components/my-header/my-header.wxml', `<view class="header"><text>{{title}}</text></view>`);
      writeFile(dir, 'components/my-header/my-header.json', '{"component": true}');

      // subA/pages/sub/sub1
      writeFile(dir, 'subA/pages/sub/sub1.js', `Page({ data: {}, onLoad() {} })`);
      writeFile(dir, 'subA/pages/sub/sub1.wxml', `<view>sub page</view>`);
      writeFile(dir, 'subA/pages/sub/sub1.json', '{}');

      const result = parseMiniprogramProject(dir);

      // App 节点
      expect(result.appNode).toBeDefined();
      expect(result.appNode!.type).toBe('mp-app');
      expect(result.appNode!.level).toBe('L1');

      // 页面节点
      const pageNames = result.pages.map((p) => p.name);
      expect(pageNames).toContain('index');
      expect(pageNames).toContain('detail');
      expect(pageNames).toContain('sub1');

      // TabBar 页面标记
      const indexPage = result.pages.find((p) => p.name === 'index');
      expect(indexPage?.attrs.isTabBar).toBe(true);

      // 分包标记
      const subPage = result.pages.find((p) => p.name === 'sub1');
      expect(subPage?.attrs.subPackage).toBe('subA');

      // 组件节点
      const compNames = result.components.map((c) => c.name);
      expect(compNames).toContain('my-header');

      // contain 边
      const containEdges = result.containEdges;
      expect(containEdges.length).toBeGreaterThan(0);

      // navigate 边
      const navigateEdges = result.navigateEdges;
      expect(navigateEdges.length).toBeGreaterThanOrEqual(2); // index->detail, index->sub1

      // 通过 from 节点（index 页面）来找 navigate 边
      const idxPage = result.pages.find((p) => p.name === 'index')!;
      const navFromIndex = navigateEdges.filter((e) => e.from === idxPage.id);
      expect(navFromIndex.length).toBeGreaterThanOrEqual(2);
      expect(navFromIndex.every((e) => e.method === 'navigateTo')).toBe(true);

      // use-component 边
      const useCompEdges = result.useComponentEdges;
      expect(useCompEdges.length).toBeGreaterThanOrEqual(1);

      // bind-event 边（goDetail 是方法，onBack/onItemTap 不在 methods 中会被过滤）
      const bindEventEdges = result.bindEventEdges;
      expect(bindEventEdges.length).toBeGreaterThanOrEqual(1);
      expect(bindEventEdges[0].eventName).toBeDefined();

      // bind-data 边
      const bindDataEdges = result.bindDataEdges;
      expect(bindDataEdges.length).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
