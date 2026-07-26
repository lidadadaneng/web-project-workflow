/**
 * 映射证据源：Git 历史追溯 + 命名匹配
 *
 * 为 business_map 边提供额外的证据来源。
 */
import { execSync } from 'child_process';
import * as path from 'path';

/** Git 追溯结果 */
export interface GitTraceResult {
  /** 文件相对路径 → 修改次数 */
  fileCounts: Map<string, number>;
  /** 修改的文件总数 */
  totalCommits: number;
}

/**
 * 从 Git 历史追溯需求相关的文件
 *
 * 搜索 commit message 中包含需求名/关键词的 commit，
 * 统计这些 commit 修改的文件频次。
 *
 * @param root 项目根目录
 * @param keywords 关键词列表（需求名、别名等）
 * @param maxCommits 最大回溯 commit 数
 * @returns 文件频次统计
 */
export function traceFromGit(
  root: string,
  keywords: string[],
  maxCommits: number = 1000,
): GitTraceResult {
  const fileCounts = new Map<string, number>();
  let totalCommits = 0;

  if (keywords.length === 0) {
    return { fileCounts, totalCommits: 0 };
  }

  try {
    // 构建 grep 模式（匹配任意关键词）
    const pattern = keywords.join('\\|');

    // 执行 git log，获取匹配的 commit 修改的文件
    // 使用 --name-only 只输出文件名，--grep 搜索 commit message
    const cmd = `git log --no-merges --name-only --grep="${pattern}" -${maxCommits} --pretty=format: --`;

    const output = execSync(cmd, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲
    });

    const lines = output.split('\n');
    for (const line of lines) {
      const f = line.trim();
      if (!f) continue;
      // 统计频次
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
      totalCommits++;
    }
  } catch {
    // Git 命令失败（不是 Git 仓库、无匹配等），静默返回空结果
    return { fileCounts, totalCommits: 0 };
  }

  return { fileCounts, totalCommits };
}

/** 命名匹配结果 */
export interface NameMatchResult {
  /** 匹配到的目标名称 → 匹配得分（0~1） */
  matches: Map<string, number>;
}

/** 中英文关键词映射词典（用于需求名 → 代码名匹配） */
const CN_EN_MAP: Record<string, string[]> = {
  用户: ['user', 'account', 'member'],
  认证: ['auth', 'authentication', 'login'],
  登录: ['login', 'signin', 'auth'],
  注册: ['register', 'signup', 'register'],
  密码: ['password', 'pwd', 'passwd'],
  订单: ['order', 'ordering'],
  支付: ['pay', 'payment', 'pay'],
  商品: ['product', 'goods', 'item', 'sku'],
  购物车: ['cart', 'shopping-cart'],
  角色: ['role', 'permission'],
  权限: ['permission', 'auth', 'acl'],
  消息: ['message', 'msg', 'notification', 'notify'],
  通知: ['notification', 'notify', 'notice'],
  文件: ['file', 'upload', 'oss', 'storage'],
  上传: ['upload', 'file'],
  搜索: ['search', 'query', 'find'],
  评论: ['comment', 'review'],
  收藏: ['favorite', 'collect', 'star'],
  点赞: ['like', 'thumb', 'vote'],
  关注: ['follow', 'subscribe'],
  积分: ['point', 'score', 'credit'],
  统计: ['stats', 'statistics', 'analytics'],
  报表: ['report', 'chart'],
  日志: ['log', 'logger', 'audit'],
  配置: ['config', 'setting', 'setting'],
  系统: ['system', 'sys', 'admin'],
  管理: ['admin', 'manage', 'management'],
  标签: ['tag', 'label'],
  分类: ['category', 'classify', 'catalog'],
  字典: ['dict', 'dictionary'],
  地区: ['region', 'area', 'district', 'location'],
  地址: ['address', 'location'],
  优惠券: ['coupon', 'voucher'],
  营销: ['marketing', 'promotion'],
  活动: ['activity', 'campaign', 'event'],
  秒杀: ['seckill', 'flash'],
  团购: ['group', 'groupon'],
};

/**
 * 命名匹配：需求名/关键词与目标名称（模块名、文件名等）的匹配度
 *
 * @param name 需求名或关键词（可以是中文或英文）
 * @param targets 目标名称列表（模块名、文件名等）
 * @returns 匹配结果
 */
export function matchByName(
  name: string,
  targets: string[],
): NameMatchResult {
  const matches = new Map<string, number>();
  const nameLower = name.toLowerCase();
  const keywords = extractKeywords(name);

  for (const target of targets) {
    const targetLower = target.toLowerCase();
    let score = 0;

    // 直接包含匹配
    if (targetLower.includes(nameLower) || nameLower.includes(targetLower)) {
      score = Math.max(score, 0.6);
    }

    // 中英文关键词匹配
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (targetLower.includes(kwLower)) {
        score = Math.max(score, 0.5);
      }

      // 查中文词典
      const enEquivalents = CN_EN_MAP[kw];
      if (enEquivalents) {
        for (const en of enEquivalents) {
          if (targetLower.includes(en)) {
            score = Math.max(score, 0.45);
          }
          // 前缀匹配（比如 auth-xxx / authService）
          if (targetLower.startsWith(en) || targetLower.endsWith(en)) {
            score = Math.max(score, 0.5);
          }
        }
      }
    }

    if (score > 0) {
      matches.set(target, Math.min(score, 0.7)); // 命名匹配权重上限 0.7
    }
  }

  return { matches };
}

/** 从需求名中提取关键词 */
function extractKeywords(name: string): string[] {
  const keywords: string[] = [];

  // 直接用原名作为一个关键词
  keywords.push(name);

  // 中文需求：按常见词拆分
  // （简单的基于词典的拆分，不做复杂分词）
  for (const cnKey of Object.keys(CN_EN_MAP)) {
    if (name.includes(cnKey)) {
      keywords.push(cnKey);
    }
  }

  // 英文/数字：按分隔符拆分
  const parts = name.split(/[-_\s./]+/).filter((p) => p.length > 1);
  if (parts.length > 1) {
    keywords.push(...parts);
  }

  return Array.from(new Set(keywords)).slice(0, 10); // 最多 10 个关键词
}

/**
 * 判断项目是否为 Git 仓库
 */
export function isGitRepo(root: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}
