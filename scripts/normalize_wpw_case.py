"""把论文正文中的系统名 wpw 统一为大写 WPW。

只替换正文里的系统名；代码块（``` 与 ~~~）和行内代码（`...`）中的
命令行字面量、`.wpw.yaml`、`wpw/archived/` 等路径保持原样。

用法：
    python -X utf8 normalize_wpw_case.py --dry    # 只打印待改与跳过项
    python -X utf8 normalize_wpw_case.py          # 落盘

脚本先全部处理成功，最后统一写文件（中途异常不会留下半改状态）。
"""

import argparse
import os
import re
import sys

THESIS_DIR = r"E:\project\web-project-workflow\论文"

# 论文正文（含摘要、章、目录大纲）；工作记录与备份不在此列
FILES = [
    "0.摘要.md",
    "1.引言.md",
    "2.相关技术.md",
    "3.上下文工程方法.md",
    "4.系统需求分析.md",
    "5.系统设计与实现.md",
    "6.系统测试与结果分析.md",
    "7.总结与展望.md",
    "index.md",
]

SENTINEL = "\x00{}\x00"
CODE_RE = re.compile(r"```.*?```|~~~.*?~~~|`[^`\n]*`", re.S)

# 只替换正文里的系统名。以下情形的 wpw 保留原样：
#   - 代码块与行内代码（CODE_RE 已处理）
#   - 紧邻 / - . _ 或字母数字，即路径、文件名、命令行与包名的一部分，
#     例如 wpw/archived/、.wpw.yaml、/wpw、图4-1-wpw系统总体用例图.png
NAME_RE = re.compile(r"(?<![0-9A-Za-z_/.\-])wpw(?![0-9A-Za-z_/.\-])")
ANY_RE = re.compile(r"wpw")


def split_code(text):
    """把代码块与行内代码替换成哨兵，返回 (占位文本, 代码片段表)。"""
    spans = []

    def keep(m):
        spans.append(m.group(0))
        return SENTINEL.format(len(spans) - 1)

    return CODE_RE.sub(keep, text), spans


def restore_code(text, spans):
    return re.sub(r"\x00(\d+)\x00", lambda m: spans[int(m.group(1))], text)


def process(text):
    """返回 (新文本, 替换数)。dry 与落盘走同一条代码路径，仅写入与否不同。"""
    masked, spans = split_code(text)
    new, replaced = NAME_RE.subn("WPW", masked)
    return restore_code(new, spans), replaced


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只报告，不写文件")
    args = ap.parse_args()

    planned = []
    for name in FILES:
        path = os.path.join(THESIS_DIR, name)
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        new, replaced = process(text)
        if new != text:
            planned.append((name, path, new, replaced))

    total_r = 0
    for name, path, new, replaced in planned:
        total_r += replaced
        print(f"{name}: 替换 {replaced} 处")
        # 替换后仍含小写 wpw 的行 = 有意保留（路径、文件名、命令行、包名）
        for i, line in enumerate(new.splitlines(), 1):
            if ANY_RE.search(line):
                print(f"    [保留] L{i}: {line.strip()[:130]}")

    print(f"\n合计：替换 {total_r} 处；涉及 {len(planned)} 个文件")

    if args.dry:
        print("（dry run，未写入）")
        return

    for name, path, new, _ in planned:
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(new)
    print("已写入。")


if __name__ == "__main__":
    sys.exit(main())