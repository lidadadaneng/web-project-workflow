# 北科大学位论文抓取 SOP

> 适用对象：北科大学位论文管理系统（thesis.ustb.edu.cn，经校园 VPN 代理 n.ustb.edu.cn）
> 原理：系统全文防下载，阅读器按页返回 JPEG 图片。流程 = 登录拿 Cookie → 检索拿 fid → 逐页抓图 → Pillow 合并 PDF
> 配套脚本：`scripts/fetch_ustb_thesis.py`

## 0. 前置条件

- Python 3.11（`C:\Users\14548\AppData\Local\Programs\Python\Python311\python.exe`），已装 Pillow
- Claude Code 的 chrome-devtools MCP 浏览器（用于扫码登录 + 页内调接口）
- 北科大 VPN 账号（微信/企微扫码）

## 1. 登录，拿 VPN Cookie

1. 让 Claude 打开 MCP 浏览器访问 `https://n.ustb.edu.cn/login`
2. 微信/企微扫码登录
3. 登录后让 Claude 从任意一条网络请求的 **请求头**里取 `wengine_vpn_ticketn_ustb_edu_cn` 的值
   （注意：`document.cookie` 是空的，Cookie 被 VPN 虚拟化了，只能从请求头拿）
4. 写入 `scripts/.ustb_vpn_cookie`，内容形如：

```
show_vpn=0; show_fast=0; heartbeat=1; show_faq=0; wengine_vpn_ticketn_ustb_edu_cn=wrdvpn1-xxxxxxxx; i18n_language=zh; refresh=0
```

## 2. 获取论文 fid（两种方式）

### 方式 A：自己浏览（最简单）

在已登录的浏览器里检索、点开"查看全文"，阅读页地址里的 `fid=xxx` 直接复制给 Claude 即可。
**该方式天然完成 fid 激活，推荐。**

### 方式 B：程序化检索（批量时用）

让 Claude 在已登录的论文系统页面里执行页内 fetch（两步）：

```js
// 第 1 步：检索拿 keyid
fetch('/md/papersearch/simpSearch', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    indexname: "paper", curpage: 1, pagesize: 10, papertype: "paper",
    newsearh: 0, searchtype: 1, sortfields: [], filterextents: [],
    searchfields: [{fieldname: "all", keytype: "ordinary", keyword: "检索词",
                    relation: "AND", searchtype: "match_phrase"}]
  })
})
// 返回 data.array[]，每项含 title/author/degree_year/keyid

// 第 2 步：keyid 换 fid（同时完成激活）
const dr = await fetch('/md/docobject/drmView?keyid=' + keyid + '&isappend=0&onlineflag=online');
const dj = await dr.json();
const pr = await fetch(dj.data.replace('https://thesis.ustb.edu.cn', ''));
const fid = new URL(pr.url).searchParams.get('fid');
```

注意：
- 检索关键词别太长（10 字以内），后端是 ES 分词匹配，整句容易搜不到；用标题里的特色词
- `keySearch` 接口是 POST 且 keyid 要**双重 URL 编码**（查元数据用，拿 fid 不需要它）

## 3. 抓取下载

```bash
cd F:\project\web-project-workflow
PY="/c/Users/14548/AppData/Local/Programs/Python/Python311/python.exe"

# 单篇
"$PY" scripts/fetch_ustb_thesis.py <fid> --name "作者-标题" --out tmp_thesis

# 批量：写清单文件（每行 fid|名称），循环跑
while IFS='|' read -r fid name; do
  "$PY" scripts/fetch_ustb_thesis.py "$fid" --name "$name" --out tmp_thesis
done < tmp_thesis/batch_list.txt
```

产物：`tmp_thesis/<名称>.pdf` + `tmp_thesis/<名称>/page_*.jpg` 页图目录（支持断点续传，中断后重跑同命令即可续）。

## 4. 常见坑（都踩过）

| 现象 | 原因 | 解法 |
|---|---|---|
| 报"解析阅读页失败" | fid 未在当前 VPN 会话激活 | 在已登录浏览器里打开一次该论文阅读页，或重跑方式 B 的第 2 步 |
| `pageCount` 值是 `null` | 同上（激活的标志就是 pageCount 变成真实数字） | 同上 |
| `drmView` 返回 500 | 该论文全文未加工上线（部分在途批次） | 抓不了，等系统更新；或让用户自己在浏览器里点"查看全文"试试 |
| 检索 `simpSearch` 返回 400/405 | 请求必须带 Cookie 且在**已登录页面上下文**里发（wengine 会改写请求），裸 curl POST 不行 | 用 MCP 浏览器 evaluate_script 页内 fetch |
| `pdfoffServlet` 404 | 官方下载口已被禁用 | 正常现象，只能逐页抓图 |
| Cookie 突然全部失效 | VPN 会话过期/Claude Code 重启导致浏览器重置 | 回到第 1 步重新扫码；已下载的页图不丢，重跑命令续传 |

## 5. 收尾

```bash
# 只留 PDF，删页图和中间文件
cd tmp_thesis
for d in */; do [ -f "${d%/}.pdf" ] && rm -rf "$d"; done
```

## 备注

- 生成的 PDF 是页图合并版，带学校 IP 水印，仅供个人离线阅读，勿外传
- 个别论文可能缺 1 页（服务端某页加密地址未返回），属正常
- 完整技术细节见记忆库 `ustb-thesis-fetch-workflow`
