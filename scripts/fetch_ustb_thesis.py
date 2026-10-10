# -*- coding: utf-8 -*-
"""
北科大学位论文系统论文抓取工具（通过校园 VPN 代理）

功能：输入论文阅读页链接（pdfindex1.jsp?fid=...），抓取全部页面图片并合并为 PDF。

用法：
  1. 先用浏览器登录 https://n.ustb.edu.cn （扫码），从 Cookie 中复制
     wengine_vpn_ticketn_ustb_edu_cn 的值（或整串 Cookie）
  2. 把 Cookie 写入 scripts/.ustb_vpn_cookie（一行纯文本）
  3. 运行：
     Python311\\python.exe scripts/fetch_ustb_thesis.py \
         "https://n.ustb.edu.cn/https/77726476706e69737468656265737421e4ff448f2e2326456d1c8be29d51367b9915/read/pdfindex1.jsp?fid=XXXX" \
         --name 论文标题

注意：Cookie 随 VPN 会话过期，过期后需重新登录获取。
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

VPN_PREFIX = "https://n.ustb.edu.cn/https/77726476706e69737468656265737421e4ff448f2e2326456d1c8be29d51367b9915"
REAL_HOST = "https://thesis.ustb.edu.cn"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COOKIE_FILE = os.path.join(SCRIPT_DIR, ".ustb_vpn_cookie")


def load_cookie(cli_cookie):
    if cli_cookie:
        return cli_cookie
    if os.path.exists(COOKIE_FILE):
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    sys.exit("缺少 Cookie：请用 --cookie 传入，或写入 %s" % COOKIE_FILE)


def http_get(url, cookie, referer=None, retries=3, timeout=60):
    headers = {"User-Agent": UA, "Cookie": cookie}
    if referer:
        headers["Referer"] = referer
    last_err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(2 * (i + 1))
    raise RuntimeError("请求失败 %s: %s" % (url, last_err))


def parse_reader_page(html):
    def grab(field):
        m = re.search(r'id="%s"\s*/?>' % field, html)
        if not m:
            m = re.search(r'value="([^"]*)"\s+id="%s"' % field, html)
            return m.group(1) if m else None
        m2 = re.search(r'value="([^"]*)"[^>]*id="%s"' % field, html)
        return m2.group(1) if m2 else None

    page_count = re.search(r'value="(\d+)"\s+id="pageCount"', html)
    fid = re.search(r'value="([0-9a-f]+)"\s+id="fid"', html)
    filename = re.search(r'value="([^"]+\.pdf)"\s+id="filename"', html)
    if not (page_count and fid and filename):
        sys.exit("解析阅读页失败：fid 未在当前会话激活或 Cookie 过期。"
                 "需先在已登录浏览器里打开该论文的阅读页（或走一遍 drmView 流程），"
                 "同一会话下 fid 才会返回真实 pageCount（否则为 null）")
    return int(page_count.group(1)), fid.group(1), filename.group(1)


def collect_page_urls(page_count, fid, filename, cookie, reader_url):
    urls = {}
    page = 0
    while len(urls) < page_count and page < page_count:
        api = ("%s/read/jumpServlet?page=%d&fid=%s&userid=&filename=%s&visitid="
               % (VPN_PREFIX, page, fid, filename))
        raw = http_get(api, cookie, referer=reader_url)
        data = json.loads(raw.decode("utf-8"))
        got_new = False
        for item in data.get("list", []):
            pid = int(item["id"])
            if pid not in urls:
                urls[pid] = item["src"]
                got_new = True
        if not got_new:
            break
        page += 3
        time.sleep(0.3)
    if len(urls) < page_count:
        print("警告：只拿到 %d/%d 页地址" % (len(urls), page_count))
    return urls


def download_pages(urls, out_dir, cookie, reader_url):
    os.makedirs(out_dir, exist_ok=True)
    paths = {}
    for pid in sorted(urls):
        dst = os.path.join(out_dir, "page_%03d.jpg" % pid)
        paths[pid] = dst
        if os.path.exists(dst) and os.path.getsize(dst) > 10000:
            continue  # 断点续传
        src = urls[pid].replace(REAL_HOST, VPN_PREFIX)
        blob = http_get(src, cookie, referer=reader_url)
        with open(dst, "wb") as f:
            f.write(blob)
        print("  下载 %d/%d 页 (%d KB)" % (pid + 1, len(urls), len(blob) // 1024))
        time.sleep(0.3)
    return paths


def merge_pdf(paths, pdf_path):
    from PIL import Image
    images = []
    for pid in sorted(paths):
        img = Image.open(paths[pid]).convert("RGB")
        images.append(img)
    if not images:
        sys.exit("没有可合并的页面")
    images[0].save(pdf_path, save_all=True, append_images=images[1:])
    print("已生成 PDF：%s（%d 页）" % (pdf_path, len(images)))


def main():
    ap = argparse.ArgumentParser(description="北科大学位论文抓取（经 VPN 代理）")
    ap.add_argument("url", help="阅读页 URL（pdfindex1.jsp?fid=...）或直接给 fid")
    ap.add_argument("--name", default=None, help="输出文件名（不含扩展名），默认用 fid")
    ap.add_argument("--out", default=".", help="输出目录")
    ap.add_argument("--cookie", default=None, help="VPN Cookie 串")
    ap.add_argument("--no-pdf", action="store_true", help="只下载页图，不合并 PDF")
    args = ap.parse_args()

    cookie = load_cookie(args.cookie)
    if re.fullmatch(r"[0-9a-f]{32}", args.url):
        reader_url = "%s/read/pdfindex1.jsp?fid=%s" % (VPN_PREFIX, args.url)
    else:
        reader_url = args.url.replace(REAL_HOST, VPN_PREFIX)
        if not reader_url.startswith("http"):
            reader_url = VPN_PREFIX + "/" + reader_url.lstrip("/")

    print("读取论文信息…")
    html = http_get(reader_url, cookie).decode("utf-8", "ignore")
    page_count, fid, filename = parse_reader_page(html)
    print("总页数 %d，fid=%s" % (page_count, fid))

    name = args.name or fid
    out_dir = os.path.join(args.out, name)
    urls = collect_page_urls(page_count, fid, filename, cookie, reader_url)
    print("共 %d 页待下载" % len(urls))
    paths = download_pages(urls, out_dir, cookie, reader_url)

    if not args.no_pdf:
        merge_pdf(paths, os.path.join(args.out, name + ".pdf"))
    print("完成。")


if __name__ == "__main__":
    main()
