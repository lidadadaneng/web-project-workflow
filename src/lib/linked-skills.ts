import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as https from 'https';

export interface LinkedSkillDef {
  /** 逻辑名（即 @ 引用名） */
  name: string;
  /** GitHub 仓库，形如 "owner/repo" */
  repo: string;
  /** 可选分支；省略则用仓库默认分支（始终拉最新） */
  ref?: string;
  /** 仓库内子路径，"." 表示根 */
  subpath: string;
  /** 安装目录名（@ 引用名）；默认同 name */
  installAs?: string;
  description?: string;
}

export interface LinkedSkillsConfig {
  skills: LinkedSkillDef[];
}

export interface SkillManifestEntry {
  name: string;
  installAs: string;
  repo: string;
  ref: string;
  commit: string;
  fetchedAt: string;
  source: string;
}

export interface SkillManifest {
  skills: SkillManifestEntry[];
}

export const MANIFEST_NAME = '.linked-skills-manifest.json';

/** 从 configDir 读取 linked-skills.json */
export function loadLinkedSkillsConfig(configDir: string): LinkedSkillsConfig {
  const file = path.join(configDir, 'linked-skills.json');
  if (!fs.existsSync(file)) return { skills: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 读取已存在的 manifest */
export function loadLinkedSkillsManifest(manifestPath: string): SkillManifest | null {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

export interface FetchOptions {
  /** 写入 <installAs>/ 与 manifest 的目录 */
  destDir: string;
  /** linked-skills.json 所在目录 */
  configDir: string;
}

/**
 * 抓取所有联动 Skill 到 destDir/<installAs>/，并写 manifest。
 * 纯 Node 实现：GitHub API 取默认分支与 commit SHA，codeload 取 tar.gz，zlib 解压 + 自解 tar。
 * 不依赖 git / curl / tar CLI，跨平台；每 skill 仅 2 次 API + 1 次 tarball。
 */
export async function fetchLinkedSkills(opts: FetchOptions): Promise<SkillManifest> {
  const { destDir, configDir } = opts;
  const config = loadLinkedSkillsConfig(configDir);
  if (config.skills.length === 0) {
    throw new Error(`未在 ${configDir} 找到联动 Skill 配置（linked-skills.json）`);
  }
  fs.mkdirSync(destDir, { recursive: true });

  const entries: SkillManifestEntry[] = [];
  for (const skill of config.skills) {
    const installAs = skill.installAs ?? skill.name;
    process.stderr.write(`  抓取 ${installAs} ← ${skill.repo} ...\n`);
    entries.push(await fetchOne(skill, installAs, destDir));
  }

  const manifest: SkillManifest = { skills: entries };
  fs.writeFileSync(path.join(destDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function fetchOne(
  skill: LinkedSkillDef,
  installAs: string,
  destDir: string,
): Promise<SkillManifestEntry> {
  const repoInfo = await httpsGetJson(`https://api.github.com/repos/${skill.repo}`);
  const ref = skill.ref ?? repoInfo.default_branch;
  const commitInfo = await httpsGetJson(
    `https://api.github.com/repos/${skill.repo}/commits/${encodeURIComponent(ref)}`,
  );
  const commit: string = commitInfo.sha;

  const tarball = await httpsGetBuffer(
    `https://codeload.github.com/${skill.repo}/tar.gz/refs/heads/${encodeURIComponent(ref)}`,
  );
  const ungzip = zlib.gunzipSync(tarball);

  const dest = path.join(destDir, installAs);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  try {
    extractTarSubpath(ungzip, skill.subpath, dest);
  } catch (e) {
    throw new Error(`${skill.name}: ${(e as Error).message}`);
  }
  // 统一 skill 的 name 字段为 installAs，确保 @<installAs> 引用可解析
  // （上游 name 可能大小写或命名不同，如 requesting-code-review → code-reviewer）
  const skillMd = path.join(dest, 'SKILL.md');
  if (fs.existsSync(skillMd)) rewriteSkillName(skillMd, installAs);

  return {
    name: skill.name,
    installAs,
    repo: skill.repo,
    ref,
    commit,
    fetchedAt: new Date().toISOString(),
    source: skill.subpath,
  };
}

function httpsGetBuffer(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      headers: { 'User-Agent': 'wpw-cli', ...headers },
    };
    https
      .get(url, opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          res.resume();
          if (!loc) return reject(new Error(`重定向无 Location: ${url}`));
          return resolve(httpsGetBuffer(loc, headers));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function httpsGetJson(url: string): Promise<any> {
  const buf = await httpsGetBuffer(url, { Accept: 'application/vnd.github+json' });
  return JSON.parse(buf.toString('utf8'));
}

/**
 * 从 tar 字节流中抽取 subpath 下的文件到 destDir。
 * tar 条目名形如 `<repo>-<ref>/<subpath>/<file>`，先剥离顶层目录，再按 subpath 过滤。
 * 跳过 .git / node_modules；支持 GNU @LongLink 长文件名。
 */
function extractTarSubpath(buf: Buffer, subpath: string, destDir: string): void {
  const sub = subpath === '.' ? '' : subpath.replace(/^\.\/+|\/+$/g, '');
  let offset = 0;
  let longName: string | null = null;
  let extracted = 0;

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // 归档结束
    const nameField = header.toString('utf8', 0, 100).replace(/\0/g, '');
    const size = parseInt(header.toString('utf8', 124, 136).replace(/[\0 ]/g, ''), 8) || 0;
    const typeflag = String.fromCharCode(header[156] ?? 0);

    const dataStart = offset + 512;
    const data = buf.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    let name = longName ?? nameField;
    longName = null;

    if (typeflag === 'L') {
      // GNU long name：下一条目的真实名字
      longName = data.toString('utf8').replace(/\0/g, '');
      continue;
    }
    if (typeflag === '5') continue; // 目录
    if (typeflag !== '0' && typeflag !== '\0') continue; // 跳过链接/pax 等

    const slashIdx = name.indexOf('/');
    if (slashIdx < 0) continue;
    let rel = name.slice(slashIdx + 1); // 剥离顶层 <repo>-<ref>/

    if (sub) {
      if (rel === sub || rel.startsWith(sub + '/')) {
        rel = rel.slice(sub.length).replace(/^\/+/, '');
      } else {
        continue;
      }
    }
    if (!rel) continue;
    if (rel === '.git' || rel.startsWith('.git/') || rel.startsWith('node_modules/')) continue;

    const outPath = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    extracted++;
  }
  if (extracted === 0) {
    throw new Error(`子路径 ${subpath || '.'} 下未抽取到任何文件`);
  }
}

/**
 * 将 SKILL.md frontmatter 的 name 字段重写为指定值，
 * 使 @<name> 引用能解析（目录名、name 字段、@ 引用三者一致）。
 */
function rewriteSkillName(skillMdPath: string, name: string): void {
  let content = fs.readFileSync(skillMdPath, 'utf8');
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return; // 无 frontmatter，跳过
  let fm = m[1];
  if (/^name:/m.test(fm)) {
    fm = fm.replace(/^name:.*$/m, `name: ${name}`);
  } else {
    fm = `name: ${name}\n${fm}`;
  }
  fs.writeFileSync(skillMdPath, `---\n${fm}\n---\n${m[2]}`);
}
