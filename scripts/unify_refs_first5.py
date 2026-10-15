# -*- coding: utf-8 -*-
"""统一参考文献：删章末引用块 -> 文末按 GB/T 7714-2015 建表 -> 正文引用上标。"""
import copy
import re
import docx
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

DOCX = r'E:\project\web-project-workflow\论文\面向AI辅助软件开发的图谱驱动上下文工程方法研究与系统实现-前5章.docx'

REFS = [
    'HOU X, JARZABEK S, et al. Large language models for software engineering: a systematic literature review[J]. ACM Transactions on Software Engineering and Methodology, 2024, 33(8): 1-79.',
    'ROBBES R, et al. Agentic much? Adoption of coding agents on GitHub[EB/OL]. arXiv:2601.18341, 2026.',
    'LI H, et al. The rise of AI teammates in software engineering (SE 3.0): how autonomous coding agents are reshaping software engineering[EB/OL]. arXiv:2507.15003, 2025.',
    'LIU N F, LIN T, HEWITT J, et al. Lost in the middle: how language models use long contexts[EB/OL]. arXiv:2307.03172, 2023.',
    'LEWIS P, PEREZ E, PIKTUS A, et al. Retrieval-augmented generation for knowledge-intensive NLP tasks[C]//Advances in Neural Information Processing Systems 33 (NeurIPS 2020). 2020: 9459-9474.',
    'ZHOU H, et al. Self-evolving coding agents: a survey[EB/OL]. arXiv:2608.03392, 2026.',
    'PISKALA K. Spec-driven development: from code to contract in the age of AI coding assistants[EB/OL]. arXiv:2602.00180, 2026.',
    'GitHub. GitHub Spec Kit[EB/OL]. https://github.com/github/spec-kit.',
    'OBRA. Superpowers: an agentic skills framework & software development methodology[EB/OL]. https://github, 2026.com/obra/superpowers.',
    'HORIKAWA K, et al. Agentic refactoring: an empirical study of AI coding agents[EB/OL]. arXiv:2511.04824, 2025.',
    'GUO D, REN S, LU S, et al. GraphCodeBERT: pre-training code representations with data flow[C]//Proceedings of the 9th International Conference on Learning Representations (ICLR 2021). 2021.',
    'HUSAIN H, WU H H, GAZIT T, et al. CodeSearchNet challenge: evaluating the state of semantic code search[EB/OL]. arXiv:1909.09436, 2019.',
    'CLELAND-HUANG J, ZEMONT G, LUKASIK W. A heterogeneous solution for improving the return on investment of requirements traceability[C]//Proceedings of the 12th IEEE International Requirements Engineering Conference (RE 2004). 2004: 174-183.',
    'BORG M, et al. Recovering from a decade: a systematic mapping of information retrieval approaches to software traceability[J]. Empirical Software Engineering, 2014, 19(6): 1565-1616.',
    'SULTANOV H, et al. Application of swarm techniques to requirements tracing[J]. Requirements Engineering, 2011, 16(3): 209-226.',
    'JIMENEZ C E, YANG J, WETTINGER D, et al. SWE-bench: can language models resolve real-world GitHub issues?[C]//Proceedings of the 12th International Conference on Learning Representations (ICLR 2024). 2024.',
    'YANG J, JIMENEZ C E, WETTINGER D, et al. SWE-agent: agent-computer interfaces enable automated software engineering[C]//Advances in Neural Information Processing Systems 37 (NeurIPS 2024). 2024.',
    'YAMAGUCHI F, GOLDE N, ARP D, et al. Modeling and discovering vulnerabilities with code property graphs[C]//Proceedings of the 2014 IEEE Symposium on Security and Privacy (S&P 2014). 2014: 590-604.',
    'EDGE D, TRINH H, CHENG N, et al. From local to global: a Graph RAG approach to query-focused summarization[EB/OL]. arXiv:2404.16130, 2024.',
    '国务院. 关于深入实施“人工智能+”行动的意见[EB/OL]. (2025-08-26). https://www.gov.cn/zhengce/content/202508/content_7037670.htm.',
    '阿里云. 通义千问大模型开放平台[EB/OL]. https://tongyi.aliyun.com/.',
    '百度智能云. 文心大模型平台[EB/OL]. https://cloud.baidu.com/wenxin.html.',
    '腾讯云. 混元大模型[EB/OL]. https://hunyuan.tencent.com/.',
    '火山引擎. 豆包大模型服务平台[EB/OL]. https://www.volcengine.com/product/doubao.',
    '智谱AI. 智谱开放平台GLM系列模型[EB/OL]. https://open.bigmodel.cn/.',
    '月之暗面. Kimi智能助手[EB/OL]. https://kimi.moonshot.cn/.',
    '深度求索. DeepSeek开放平台[EB/OL]. https://platform.deepseek.com/.',
    'Anthropic. Claude Code[EB/OL]. https://claude.com/product/claude-code.',
    '智谱AI. CodeGeeX智能编程助手[EB/OL]. https://codegeex.cn/.',
    'ROZIERE B, GEHRING J, GLOECKLE F, et al. Code Llama: open foundation models for code[EB/OL]. arXiv:2308.12950, 2023.',
    'GUO D, ZHU Q, YANG D, et al. DeepSeek-Coder: when the large language model meets programming[EB/OL]. arXiv:2401.14196, 2024.',
    'COGNITION. Devin[EB/OL]. https://devin.ai.',
    'All-Hands-AI. OpenHands (formerly OpenDevin)[EB/OL]. https://github.com/All-Hands-AI/OpenHands.',
    'PAN Z, HU X, XIA X, et al. CatCoder: repository-level code generation with relevant code and type context[J]. ACM Transactions on Software Engineering and Methodology. DOI: 10.1145/3779217.',
    'BAIRI R, SONWANE A, KANADE A, et al. CodePlan: repository-level coding using LLMs and planning[C]//Proceedings of the ACM on Software Engineering, 2024, 1(FSE 2024): 675-698.',
    'PHAN H N, et al. RepoHyper: search-expand-refine on semantic graphs for repository-level code completion[EB/OL]. arXiv:2403.06095, 2024.',
    'HOGAN A, et al. Knowledge graphs[J]. ACM Computing Surveys, 2022, 54(4): 1-37.',
    'YANG B, et al. KGCompass: enhancing repository-level software repair via repository-aware knowledge graphs[EB/OL]. arXiv:2503.21710, 2025.',
    'ATHALE M, et al. Knowledge graph based repository-level code generation[EB/OL]. arXiv:2505.14394, 2025.',
    'CHERNY-SHAHAR T, YEHUDAI A. Repository intelligence graph: deterministic architectural map for LLM code assistants[EB/OL]. arXiv:2601.10112, 2026.',
    'GAO H, KUANG H, et al. TRIAD: automated traceability recovery based on biterm-enhanced deduction of transitive links among artifacts[C]//Proceedings of the 46th International Conference on Software Engineering (ICSE 2024). 2024.',
    '中国工商银行软件开发中心. 程序血缘分析技术在工商银行软件工程中的应用[J]. 中国金融电脑, 2025(1).',
    # ---------- 第 2 章新增 [43]-[59]（2026-08-23；[58] 题录待补占位） ----------
    'VASWANI A, SHAZEER N, PARMAR N, et al. Attention is all you need[C]//Advances in Neural Information Processing Systems 30 (NeurIPS 2017). 2017: 5998-6008.',
    'DEVLIN J, CHANG M W, LEE K, et al. BERT: pre-training of deep bidirectional transformers for language understanding[C]//Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics (NAACL 2019). 2019: 4171-4186.',
    'YAO S, ZHAO J, YU D, et al. ReAct: synergizing reasoning and acting in language models[C]//International Conference on Learning Representations (ICLR 2023). 2023.',
    'SCHICK T, DWIVEDI-YU J, DESSI R, et al. Toolformer: language models can teach themselves to use tools[C]//Advances in Neural Information Processing Systems 36 (NeurIPS 2023). 2023.',
    'XIAO S, LIU Z, SHAO Y, et al. C-Pack: packaged resources to advance general Chinese embedding[C]//Proceedings of the 47th International ACM SIGIR Conference on Research and Development in Information Retrieval (SIGIR 2024). 2024: 641-649.',
    'RESNICK P, IACOVOU N, SUCHAK M, et al. GroupLens: an open architecture for collaborative filtering of netnews[C]//Proceedings of the 1994 ACM Conference on Computer Supported Cooperative Work (CSCW 1994). 1994: 175-186.',
    'SARWAR B, KARYPIS G, KONSTAN J, et al. Item-based collaborative filtering recommendation algorithms[C]//Proceedings of the 10th International Conference on World Wide Web (WWW 2001). 2001: 285-295.',
    'BURKE R. Hybrid recommender systems: survey and experiments[J]. User Modeling and User-Adapted Interaction, 2002, 12(4): 331-370.',
    'PAZZANI M J, BILLSUS D. Content-based recommendation systems[M]//The Adaptive Web. Berlin: Springer, 2007: 325-341.',
    'BRUNSFELD J, et al. Tree-sitter[EB/OL]. https://tree-sitter.github.io/tree-sitter/.',
    'VMware. Spring Boot[EB/OL]. https://spring.io/projects/spring-boot.',
    'Vue.js Team. Vue.js[EB/OL]. https://vuejs.org/.',
    'MEI L, YAO J, GE Y, et al. A survey of context engineering for large language models[EB/OL]. arXiv:2507.13334, 2025.',
    'JIANG H, WU Q, LIN C Y, et al. LLMLingua: compressing prompts for accelerated inference of large language models[C]//Proceedings of the 2023 Conference on Empirical Methods in Natural Language Processing (EMNLP 2023). 2023: 13358-13376.',
    'ZHANG Z, ZHANG Y, LI K, et al. A survey on memory mechanisms of large language model based agents[EB/OL]. arXiv:2404.13501, 2024.',
    'ContextBench（编码智能体上下文检索评测基准）[EB/OL].（题录待补：作者/题名/出处待核实后替换）.',
    'WANG Z Z, MAO J, FRIED D, et al. Agent workflow memory[EB/OL]. arXiv:2409.07429, 2024.',
    'HAERI A, GHELICHI M. Specification grounding drives test effectiveness for LLM code[EB/OL]. arXiv:2607.06636, 2026.',
    'TUFANO M, et al. Grounding AI agents in contracts: an empirical evaluation of spec-driven test generation[EB/OL]. arXiv:2608.17177 / SpecOps 2026, 2026.',
    'SAHA S, et al. From vibe coding to specification-driven agentic development: a taxonomy, lifecycle model, and artifact-based empirical analysis[EB/OL]. 2026.',
    'CHINTHAREDDY M R. Reliable Graph-RAG for codebases: AST-derived graphs vs LLM-extracted knowledge graphs[EB/OL]. 2026.',
    'ABEDU S, KHATOONABADI S H, SHIHAB E. Synergizing LLMs and knowledge graphs for software repository-related question answering[J]. ACM Transactions on Software Engineering and Methodology, 2026.',
    'JIANG J, et al. KG-Agent: an efficient autonomous agent framework for complex reasoning over knowledge graph[C]//Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (ACL 2025). 2025.',
    'HILL B. Does spec-driven development reduce defects?[EB/OL]. 2026.',
    'MANNING C D, RAGHAVAN P, SCHÜTZE H. Introduction to information retrieval[M/OL]. Cambridge: Cambridge University Press, 2008. https://nlp.stanford.edu/IR-book/.',
    'SAAD-FALCON J, KHATTAB O, POTTS C, et al. ARES: an automated evaluation framework for retrieval-augmented generation systems[C]//Proceedings of NAACL-HLT 2024. 2024: 338-354. https://aclanthology.org/2024.naacl-long.20/.',
]

d = docx.Document(DOCX)
body = d.element.body

# ---------- 1. 删除章末引用块 ----------
# 第1章：从「本章参考文献映射」到章末；第3章：从「本章参考文献」到「本章图表清单」或章末
def delete_range(start_pred, stop_keep=None):
    """从 start_pred 命中段开始删除，直到下一个 Heading 1（保留）或 stop_keep 命中段（保留）。"""
    started = False
    removed = 0
    for el in list(body.iterchildren()):
        if el.tag != qn('w:p'):
            continue
        text = ''.join(t.text or '' for t in el.iter(qn('w:t')))
        if not started:
            if start_pred(text):
                started = True
                body.remove(el)
                removed += 1
            continue
        # 已在删除区间内：遇到章标题或保留标记则停止
        p = Paragraph(el, d)
        if p.style.name == 'Heading 1' or (stop_keep and stop_keep(text)):
            return removed
        xml = el.xml
        if 'w:sectPr' in xml or 'type="page"' in xml or 'fldChar' in xml:
            continue
        body.remove(el)
        removed += 1
    return removed

r1 = delete_range(lambda t: t.strip().startswith('本章参考文献映射'))
print('ch1 引用块删除段数:', r1)

r3 = delete_range(
    lambda t: t.strip().startswith('本章参考文献') and '映射' not in t,
    stop_keep=lambda t: t.strip().startswith('本章图表清单'))
print('ch3 引用块删除段数:', r3)

# ch1 尾部的「全文参考文献规模规划」引言块（若未被上述覆盖）
for el in list(body.iterchildren()):
    if el.tag != qn('w:p'):
        continue
    text = ''.join(t.text or '' for t in el.iter(qn('w:t')))
    if text.strip().startswith('全文参考文献规模规划'):
        body.remove(el)
        print('已删除：全文参考文献规模规划段')

# ---------- 2. 重建参考文献表 ----------
# 定位：u1级标题「参考文献」之后到 u附录标题 之前的旧示例段落
ref_start = None
app_start = None
for el in body.iterchildren():
    if el.tag != qn('w:p'):
        continue
    p = Paragraph(el, d)
    if p.style.name == 'u1级标题' and p.text.strip() == '参考文献':
        ref_start = el
    elif p.style.name == 'u附录标题' and app_start is None:
        app_start = el
assert ref_start is not None and app_start is not None

removed_refs = 0
started = False
for el in list(body.iterchildren()):
    if el is ref_start:
        started = True
        continue
    if el is app_start:
        break
    if started:
        if el.tag == qn('w:p'):
            body.remove(el)
            removed_refs += 1
        elif el.tag == qn('w:tbl'):
            body.remove(el)
            removed_refs += 1
print('旧参考文献示例删除:', removed_refs)

# 样式 id
style_id = None
for s in d.styles:
    if s.name == 'u参考文献条目顺序编码制':
        style_id = s.style_id
        break
print('参考文献样式 id:', style_id)

def xml_escape(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def make_ref_para(text):
    safe = xml_escape(text)
    p = docx.oxml.parse_xml(
        f'<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:pPr><w:pStyle w:val="{style_id}"/>'
        f'<w:spacing w:beforeLines="10" w:before="10" w:afterLines="10" w:after="10" '
        f'w:line="312" w:lineRule="auto"/></w:pPr>'
        f'<w:r><w:t xml:space="preserve">{safe}</w:t></w:r></w:p>')
    return p

for ref in REFS:
    # 直接操作底层段落节点，避免 Paragraph 包装对象在重复运行时
    # 将新节点挂到错误的父节点或被 python-docx 丢弃。
    app_start.addprevious(make_ref_para(ref))
print('HAERI 节点插入数:', sum(1 for el in body.iterchildren() if 'HAERI' in getattr(el, 'xml', '')))
print('新参考文献条目:', len(REFS))

# ---------- 3. 正文引用上标 ----------
CITE = re.compile(r'\[(\d{1,2}(?:[,-]\d{1,2})*)\]')

def ok_citation(nums_str):
    for part in re.split(r'[,-]', nums_str):
        if not (1 <= int(part) <= len(REFS)):
            return False
    return True

sup_count = 0
for p in d.paragraphs:
    if p.style.name != 'u正文':
        continue
    text = p.text
    if '[' not in text:
        continue
    for r in list(p.runs):
        rt = r.text
        if '[' not in rt:
            continue
        # 幂等保护：已是上标的引用 run 不重复处理（避免重复 vertAlign）
        rpr0 = r._r.find(qn('w:rPr'))
        if rpr0 is not None and rpr0.find(qn('w:vertAlign')) is not None:
            continue
        parts = CITE.split(rt)
        if len(parts) < 2:
            continue
        # 重建该 run：交替 普通/引用 片段
        rpr = r._r.find(qn('w:rPr'))
        new_runs = []
        for i, seg in enumerate(parts):
            if seg == '':
                continue
            is_cite = (i % 2 == 1)
            if is_cite and not ok_citation(seg):
                is_cite = False
            nr = copy.deepcopy(r._r)
            for t in list(nr.findall(qn('w:t'))):
                nr.remove(t)
            t = nr.makeelement(qn('w:t'), {})
            t.text = ('[' + seg + ']') if is_cite else seg
            t.set(qn('xml:space'), 'preserve')
            if is_cite:
                nrpr = nr.find(qn('w:rPr'))
                if nrpr is None:
                    nrpr = nr.makeelement(qn('w:rPr'), {})
                    nr.insert(0, nrpr)
                va = nrpr.makeelement(qn('w:vertAlign'), {})
                va.set(qn('w:val'), 'superscript')
                nrpr.append(va)
            nr.append(t)
            new_runs.append(nr)
        if new_runs:
            anchor = r._r
            for nr in new_runs:
                anchor.addnext(nr)
                anchor = nr
            r._r.getparent().remove(r._r)
            sup_count += 1

d.save(DOCX)
print('引用上标处理的 run 数:', sup_count)
