/**
 * uni-app 解析器单元测试
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  isUniappProject,
  extractUniNavigateCalls,
  extractConditionalCompilePlatforms,
  isUniPageLifecycle,
  parseUniappProject,
} from '../graph/parsers/uniapp-parser';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-uniapp-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

describe('isUniappProject', () => {
  it('识别标准 uni-app 项目（pages.json + manifest.json）', () => {
    const dir = createTempDir();
    try {
      writeFile(dir, 'pages.json', JSON.stringify({
        pages: [{ path: 'pages/index/index' }],
        globalStyle: {},
      }));
      writeFile(dir, 'manifest.json', JSON.stringify({
        name: 'TestApp',
        appid: '__UNI__TEST',
      }));
      expect(isUniappProject(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('识别含 @dcloudio 依赖的项目', () => {
    const dir = createTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({
        dependencies: {},
        devDependencies: {
          '@dcloudio/uni-cli-shared': '^3.0.0',
          '@dcloudio/vite-plugin-uni': '^3.0.0',
        },
      }));
      // 还需要 pages.json + src/App.vue 吗？
      // 只有 package.json 不够，看我们的实现...
      // 方式 2 是直接检查 package.json 的 @dcloudio 依赖
      // 所以只有 package.json 也应该返回 true
      expect(isUniappProject(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('不识别普通 Vue 项目', () => {
    const dir = createTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({
        dependencies: { vue: '^3.0.0' },
      }));
      writeFile(dir, 'src/App.vue', '<template><div>hello</div></template>');
      expect(isUniappProject(dir)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractUniNavigateCalls', () => {
  it('识别 uni.navigateTo 调用', () => {
    const source = `
export default {
  methods: {
    goDetail() {
      uni.navigateTo({ url: '/pages/detail/detail?id=1' });
    },
    goBack() {
      uni.navigateBack();
    },
    switchTab() {
      uni.switchTab({ url: '/pages/index/index' });
    },
  },
};
    `;
    const calls = extractUniNavigateCalls(source);
    expect(calls.length).toBe(2); // navigateTo + switchTab (navigateBack 没有 url 参数)

    const navTo = calls.find((c) => c.method === 'navigateTo');
    expect(navTo).toBeDefined();
    expect(navTo!.url).toBe('/pages/detail/detail?id=1');

    const switchTab = calls.find((c) => c.method === 'switchTab');
    expect(switchTab).toBeDefined();
    expect(switchTab!.url).toBe('/pages/index/index');
  });

  it('识别 setup 语法中的调用', () => {
    const source = `
<script setup>
import { onLoad } from '@dcloudio/uni-app';

function goPage() {
  uni.redirectTo({ url: '/pages/other/other' });
}
</script>
    `;
    const calls = extractUniNavigateCalls(source);
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('redirectTo');
    expect(calls[0].url).toBe('/pages/other/other');
  });
});

describe('extractConditionalCompilePlatforms', () => {
  it('识别 #ifdef 平台条件编译', () => {
    const source = `
// #ifdef MP-WEIXIN
console.log('微信小程序');
// #endif

// #ifdef H5
console.log('H5');
// #endif
    `;
    const platforms = extractConditionalCompilePlatforms(source);
    expect(platforms).toContain('MP-WEIXIN');
    expect(platforms).toContain('H5');
  });

  it('识别 #ifndef 和多平台组合', () => {
    const source = `
// #ifndef APP-PLUS
console.log('非 App');
// #endif

// #ifdef MP-WEIXIN || MP-ALIPAY
console.log('小程序');
// #endif
    `;
    const platforms = extractConditionalCompilePlatforms(source);
    expect(platforms).toContain('APP-PLUS');
    expect(platforms).toContain('MP-WEIXIN');
    expect(platforms).toContain('MP-ALIPAY');
  });

  it('忽略非平台条件编译', () => {
    const source = `
// #ifdef MY-CUSTOM
console.log('自定义');
// #endif
    `;
    const platforms = extractConditionalCompilePlatforms(source);
    expect(platforms).not.toContain('MY-CUSTOM');
  });
});

describe('isUniPageLifecycle', () => {
  it('识别页面生命周期', () => {
    expect(isUniPageLifecycle('onLoad')).toBe(true);
    expect(isUniPageLifecycle('onShow')).toBe(true);
    expect(isUniPageLifecycle('onPullDownRefresh')).toBe(true);
    expect(isUniPageLifecycle('onShareAppMessage')).toBe(true);
    expect(isUniPageLifecycle('onLaunch')).toBe(true);
  });

  it('不识别普通方法', () => {
    expect(isUniPageLifecycle('handleClick')).toBe(false);
    expect(isUniPageLifecycle('getData')).toBe(false);
    expect(isUniPageLifecycle('onClick')).toBe(false);
  });
});

describe('parseUniappProject', () => {
  it('完整解析 uni-app 项目', () => {
    const dir = createTempDir();
    try {
      // pages.json
      writeFile(dir, 'pages.json', `
{
  "pages": [
    {
      "path": "pages/index/index",
      "style": { "navigationBarTitleText": "首页" }
    },
    {
      "path": "pages/detail/detail",
      "style": { "navigationBarTitleText": "详情" }
    }
  ],
  "globalStyle": {
    "navigationBarTitleText": "UniApp Demo"
  },
  "tabBar": {
    "list": [
      { "pagePath": "pages/index/index", "text": "首页" }
    ]
  },
  "subPackages": [
    {
      "root": "subA",
      "name": "subA",
      "pages": [
        { "path": "pages/sub/sub1" }
      ]
    }
  ]
}
      `);

      // manifest.json
      writeFile(dir, 'manifest.json', JSON.stringify({
        name: 'Test App',
        appid: '__UNI__TEST123',
      }));

      // 页面文件
      writeFile(dir, 'src/pages/index/index.vue', `
<template>
  <view class="container">
    <button @click="goDetail">去详情</button>
  </view>
</template>
<script>
export default {
  data() { return { list: [] }; },
  onLoad() { console.log('page load'); },
  methods: {
    goDetail() {
      uni.navigateTo({ url: '/pages/detail/detail?id=1' });
    },
    goSub() {
      uni.navigateTo({ url: '/subA/pages/sub/sub1' });
    },
  },
};
</script>
      `);

      writeFile(dir, 'src/pages/detail/detail.vue', `
<template><view>detail</view></template>
<script>
export default {
  onLoad(options) {
    // #ifdef MP-WEIXIN
    console.log('weixin miniprogram');
    // #endif
  },
};
</script>
      `);

      writeFile(dir, 'src/subA/pages/sub/sub1.vue', `
<template><view>sub page</view></template>
<script>
export default { onLoad() {} };
</script>
      `);

      const result = parseUniappProject(dir);

      // 页面节点
      const pageNames = result.pages.map((p) => p.name);
      expect(pageNames).toContain('index');
      expect(pageNames).toContain('detail');
      expect(pageNames).toContain('sub1');
      expect(result.pages.length).toBe(3);

      // 页面类型
      for (const page of result.pages) {
        expect(page.type).toBe('uni-page');
        expect(page.level).toBe('L2');
      }

      // TabBar 标记
      const indexPage = result.pages.find((p) => p.name === 'index');
      expect(indexPage?.attrs.isTabBar).toBe(true);

      // 分包标记
      const subPage = result.pages.find((p) => p.name === 'sub1');
      expect(subPage?.attrs.subPackage).toBe('subA');

      // 页面标题
      expect(indexPage?.attrs.pageTitle).toBe('首页');

      // navigate 边
      const navFromIndex = result.navigateEdges.filter(
        (e) => e.from === indexPage?.id,
      );
      expect(navFromIndex.length).toBe(2); // detail + sub1
      expect(navFromIndex.every((e) => e.method === 'navigateTo')).toBe(true);
      expect(navFromIndex.every((e) => e.type === 'navigate')).toBe(true);

      // 条件编译平台标记
      const detailPage = result.pages.find((p) => p.name === 'detail');
      expect(detailPage?.attrs.platform).toContain('MP-WEIXIN');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
