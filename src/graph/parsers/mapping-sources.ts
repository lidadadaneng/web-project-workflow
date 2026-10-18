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
  // ===== 用户与认证 =====
  用户: ['user', 'account', 'member', 'profile'],
  账号: ['account', 'user', 'username'],
  账户: ['account', 'user', 'username'],
  会员: ['member', 'vip', 'user'],
  认证: ['auth', 'authentication', 'login', 'verify'],
  登录: ['login', 'signin', 'auth', 'sign-in'],
  注册: ['register', 'signup', 'sign-up', 'enroll'],
  登出: ['logout', 'signout', 'sign-out'],
  退出: ['logout', 'signout', 'exit', 'quit'],
  密码: ['password', 'pwd', 'passwd'],
  验证码: ['captcha', 'verify-code', 'otp', 'code'],
  令牌: ['token', 'jwt', 'access-token'],
  权限: ['permission', 'auth', 'acl', 'privilege'],
  角色: ['role', 'permission', 'position'],
  身份: ['identity', 'profile', 'credential'],

  // ===== 表单与校验 =====
  表单: ['form', 'input', 'submit'],
  提交: ['submit', 'send', 'confirm'],
  确认: ['confirm', 'submit', 'ok', 'approve'],
  取消: ['cancel', 'abort', 'dismiss'],
  保存: ['save', 'store', 'persist'],
  验证: ['validate', 'verify', 'check'],
  校验: ['validate', 'verify', 'check', 'validation'],
  必填: ['required', 'mandatory'],
  错误: ['error', 'err', 'fail', 'failure'],
  提示: ['hint', 'tip', 'prompt', 'message'],
  弹窗: ['modal', 'dialog', 'popup'],
  对话框: ['dialog', 'modal'],

  // ===== 数据与查询 =====
  数据: ['data', 'record', 'item'],
  查询: ['query', 'search', 'find', 'list'],
  搜索: ['search', 'query', 'find'],
  筛选: ['filter', 'query', 'search'],
  过滤: ['filter', 'exclude'],
  分页: ['page', 'pagination', 'pager'],
  列表: ['list', 'table', 'data', 'items'],
  表格: ['table', 'grid', 'list'],
  详情: ['detail', 'info', 'view', 'show'],
  新增: ['add', 'create', 'new', 'insert'],
  创建: ['create', 'add', 'new', 'generate'],
  编辑: ['edit', 'update', 'modify'],
  修改: ['update', 'edit', 'modify', 'change'],
  删除: ['delete', 'remove', 'destroy', 'del'],
  导出: ['export', 'download'],
  导入: ['import', 'upload'],
  下载: ['download', 'export'],
  上传: ['upload', 'import', 'file'],
  文件: ['file', 'upload', 'oss', 'storage', 'document'],
  附件: ['attachment', 'file', 'upload'],
  图片: ['image', 'img', 'picture', 'photo'],
  状态: ['status', 'state', 'condition'],

  // ===== 商品与订单 =====
  商品: ['product', 'goods', 'item', 'sku'],
  产品: ['product', 'item', 'goods'],
  订单: ['order', 'ordering'],
  购物车: ['cart', 'shopping-cart', 'basket'],
  支付: ['pay', 'payment', 'checkout'],
  付款: ['pay', 'payment', 'pay'],
  退款: ['refund', 'return', 'money-back'],
  价格: ['price', 'amount', 'cost'],
  金额: ['amount', 'price', 'money', 'total'],
  库存: ['stock', 'inventory', 'quantity'],
  分类: ['category', 'classify', 'catalog'],
  品牌: ['brand', 'trademark'],
  规格: ['spec', 'specification', 'sku'],

  // ===== 营销与活动 =====
  营销: ['marketing', 'promotion', 'promo'],
  活动: ['activity', 'campaign', 'event'],
  优惠券: ['coupon', 'voucher'],
  秒杀: ['seckill', 'flash', 'flash-sale'],
  团购: ['group', 'groupon', 'group-buy'],
  折扣: ['discount', 'sale', 'off'],
  积分: ['point', 'score', 'credit', 'bonus'],
  等级: ['level', 'grade', 'rank', 'tier'],
  会员等级: ['vip', 'member-level', 'tier'],

  // ===== 社交与互动 =====
  评论: ['comment', 'review', 'reply'],
  回复: ['reply', 'comment', 'respond'],
  收藏: ['favorite', 'collect', 'star', 'bookmark'],
  点赞: ['like', 'thumb', 'vote', 'praise'],
  关注: ['follow', 'subscribe', 'watch'],
  粉丝: ['follower', 'fan'],
  消息: ['message', 'msg', 'notification', 'notify', 'chat'],
  通知: ['notification', 'notify', 'notice', 'alert'],
  推送: ['push', 'notification', 'notify'],
  聊天: ['chat', 'message', 'im', 'conversation'],
  分享: ['share', 'forward'],

  // ===== 系统与管理 =====
  管理: ['admin', 'manage', 'management'],
  管理员: ['admin', 'administrator', 'manager'],
  系统: ['system', 'sys', 'platform'],
  平台: ['platform', 'system'],
  配置: ['config', 'setting', 'setting', 'configuration'],
  设置: ['setting', 'config', 'preference'],
  参数: ['param', 'parameter', 'config', 'option'],
  选项: ['option', 'config', 'setting'],
  日志: ['log', 'logger', 'audit', 'record'],
  审计: ['audit', 'log', 'review'],
  统计: ['stats', 'statistics', 'analytics', 'analysis'],
  报表: ['report', 'chart', 'dashboard'],
  仪表盘: ['dashboard', 'chart', 'stats'],
  字典: ['dict', 'dictionary', 'enum'],
  枚举: ['enum', 'dict', 'dictionary'],
  标签: ['tag', 'label', 'badge'],
  地区: ['region', 'area', 'district', 'location'],
  地址: ['address', 'location', 'position'],
  部门: ['department', 'dept', 'org', 'organization'],
  组织: ['org', 'organization', 'group'],
  岗位: ['position', 'post', 'job'],
  员工: ['employee', 'staff', 'worker'],
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

/** 从字符串中提取命中的中文词典 key（CN_EN_MAP） */
function findChineseKeys(s: string): string[] {
  const keys: string[] = [];
  for (const cnKey of Object.keys(CN_EN_MAP)) {
    if (s.includes(cnKey)) keys.push(cnKey);
  }
  return keys;
}

/** 从需求名中提取关键词 */
function extractKeywords(name: string): string[] {
  const keywords: string[] = [name, ...findChineseKeys(name)];

  // 英文/数字：按分隔符拆分
  const parts = name.split(/[-_\s./]+/).filter((p) => p.length > 1);
  if (parts.length > 1) {
    keywords.push(...parts);
  }

  return Array.from(new Set(keywords)).slice(0, 10); // 最多 10 个关键词
}

/**
 * 将查询词展开为英文等价词集合（跨语言桥接：中文查询 -> 英文代码标识符）
 *
 * 包含：原词 + 命中的中文词典 key + 其英文等价词 + 英文 token。
 * 供语义检索的词汇加权（lexBoost）复用，避免维护两套词典。
 */
export function expandQueryToEnglish(query: string): string[] {
  const result = new Set<string>();
  result.add(query);

  // 中文词 + 英文等价词
  for (const cnKey of findChineseKeys(query)) {
    result.add(cnKey);
    for (const en of CN_EN_MAP[cnKey]) {
      result.add(en);
    }
  }

  // 英文 token 原样保留
  const parts = query.split(/[-_\s./]+/).filter((p) => p.length > 1);
  for (const p of parts) result.add(p);

  return Array.from(result).slice(0, 20);
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
