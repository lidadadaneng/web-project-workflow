# -*- coding: utf-8 -*-
"""迁移原第 4 章 wpw 系统设计与实现 -> 第 5 章（重编号 + 切除 4.6 系统测试）。"""
import io
import re

SRC = r"F:\project\web-project-workflow\论文\4.wpw系统设计与实现.md"
DST = r"F:\project\web-project-workflow\论文\5.系统设计与实现.md"
STASH = r"F:\project\web-project-workflow\论文\迁移暂存-4.6系统测试.md"

text = io.open(SRC, encoding="utf-8").read()

# 1. 切出 4.6 系统测试块（含标题，到 4.7 前），暂存供第 6 章重组使用
m = re.search(r"## 4\.6 系统测试.*?(?=## 4\.7 本章小结)", text, re.S)
assert m, "4.6 block not found"
block_46 = m.group(0).rstrip() + "\n"
io.open(STASH, "w", encoding="utf-8").write(block_46)
text = text[: m.start()] + text[m.end() :]

# 2. 章标题与开篇段（衔接新第 4 章）
text = text.replace("# 第 4 章 wpw 系统设计与实现", "# 第 5 章 wpw 系统设计与实现", 1)
old_open = "第 3 章给出了面向 AI 编程智能体的软件工程上下文工程方法。本章以 wpw 系统作为该方法的工程实现，说明其如何将流程约束架构、能力-代码双层知识模型、任务上下文生成和 Spec 增量知识演化落实为可执行的软件组件。"
new_open = "第 4 章分析了 wpw 系统的使用者、功能需求、非功能需求和建设边界。本章说明该系统的设计与实现，即第 3 章提出的流程约束架构、能力-代码双层知识模型、图谱驱动的任务上下文生成和 Spec 增量知识演化如何落实为可执行的软件组件。"
assert old_open in text, "opening not found"
text = text.replace(old_open, new_open, 1)

# 3. 小结节号：4.7 -> 5.6（先做，避免被通用规则改成 5.7）
text = text.replace("## 4.7 本章小结", "## 5.6 本章小结", 1)

# 4. 其余节号 4.x -> 5.x
text = text.replace("### 4.", "### 5.").replace("## 4.", "## 5.")

# 5. 小节号联动引用修复（章内回指不用节号）
old_ref = "该步骤将工作流的终点与第 4.5 节的长期知识维护相连接。"
assert old_ref in text, "4.5 ref not found"
text = text.replace(old_ref, "该步骤将工作流的终点与增量维护模块的长期知识维护相连接。", 1)

# 6. 小结末段：补系统测试已移入第 6 章的表述
old_tail = "第 6 章将在共同 SDD 任务和统一配置下，以 OpenSpec-based SDD 为任务级开发基线；"
new_tail = "第 6 章将先对 wpw 进行系统功能测试，再在共同 SDD 任务和统一配置下，以 OpenSpec-based SDD 为任务级开发基线开展方法验证；"
assert old_tail in text, "summary tail not found"
text = text.replace(old_tail, new_tail, 1)

# 7. 图表清单删除 4.6 对应行（随系统测试移入第 6 章）
text = re.sub(r"- 表4-6 wpw 系统测试环境\n", "", text)
text = re.sub(r"- 表4-7 wpw 系统功能测试结果\n", "", text)

# 8. 图/表/公式/图片路径重编号
text = text.replace("图表/第4章/", "图表/第5章/")
for a, b in [
    ("图4-", "图5-"),
    ("表4-", "表5-"),
    ("Figure 4-", "Figure 5-"),
    ("Table 4-", "Table 5-"),
    (r"\tag{4-", r"\tag{5-"),
]:
    text = text.replace(a, b)

io.open(DST, "w", encoding="utf-8").write(text)

# 9. 校验残留
residual = re.findall(r"图4-|表4-|Figure 4-|Table 4-|tag\{4-|## 4\.|### 4\.|图表/第4章|第 4 章", text)
print("residual:", residual)
heads = re.findall(r"^#{1,3} .*$", text, re.M)
print("headings:")
for h in heads:
    print(" ", h)
print("written:", DST, len(text.splitlines()), "lines")
