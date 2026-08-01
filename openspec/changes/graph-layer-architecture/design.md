## Context

See proposal.md for motivation. Current state:
- Four-layer model: L1(requirement) → L2(module) → L3(file) → L4(element)
- L1 and L2 are connected by business_map, NOT contain — they are different dimensions, not a hierarchy
- Requirement nodes come and go with workflow, making the graph unstable
- No steady-state business capability layer
- Semantic search mixes all layers with equal weight in anchor selection, causing L1(module) to inflate subgraphs

## Goals / Non-Goals

**Goals:**
- Rename layers to accurately reflect their nature: C (capability) + L1/L2/L3 (structure)
- Replace requirement nodes with capability nodes from wpw/specs/ (steady-state specs)
- Implement confidence decay weighting algorithm for anchor selection
- Schema version 3.0 with clean break (full rebuild required, no migration path)
- Archive workflow generates/updates capability specs in wpw/specs/

**Non-Goals:**
- Migrating existing graph data (full rebuild only)
- Interactive user confirmation during AI capability naming (AI decides autonomously)
- Changing subgraph trimming and compression logic (only anchor selection changes)
- L2/L3 decay weighting (only L1 is decayed — fine-grained layers don't inflate subgraphs)

## Decisions

### 1. Layer naming: C + L1/L2/L3

**Chosen:** Capability layer called "C" (level field value = 'C'), structure layers called L1/L2/L3 (module/file/element).

**Rationale:**
- C clearly distinguishes the business dimension from the structural L-numbering
- L1/L2/L3 aligns with the actual containment hierarchy depth
- Avoids the misleading implication that C-layer is "above" L1 in a containment sense

**Alternatives considered:**
- Keep L1 but change meaning (too confusing)
- Use full words like 'capability' everywhere (verbose)
- Add a separate dimension field instead of level (over-engineering)

### 2. C-layer source = wpw/specs/ in OpenSpec spec format

**Chosen:** C-layer nodes are parsed from `wpw/specs/**/spec.md` files following OpenSpec format (Purpose + Requirements + Scenarios).

**Rationale:**
- Aligns with OpenSpec's spec-driven philosophy
- Structured format enables automated extraction of features and descriptions
- Specs are the "truth source" — graph is an index of them
- Archiving a requirement → updating a spec → updating the graph

**Alternatives considered:**
- C-layer nodes from archived requirements directly (not steady-state, keeps changing)
- Separate YAML config for capabilities (less structured, not spec-compatible)

### 3. Confidence decay weighting with exponential function

**Chosen:** Exponential decay: w_L1 = exp(-α · Conf_C), with α=3.0 default.

**Rationale:**
- Smooth, differentiable function — no hard threshold jumps
- Intuitive physical meaning: higher C-confidence → lower L1-weight
- Single parameter α controls decay speed, easy to tune
- Suitable for academic presentation (thesis-worthy)
- Can be extended with additional factors (diversity, count) later

**Alternatives considered:**
- Hard threshold (simple but discontinuous, less rigorous)
- Linear decay (simple but hits zero at some point, can go negative)
- Sigmoid function (S-shaped, more parameters, less intuitive meaning)
- Information gain based (theoretically sound but computationally expensive)

### 4. Only L1 decays, L2/L3 stay at full weight

**Chosen:** Confidence decay applies only to L1 (module) layer. L2 (file) and L3 (element) scores remain unchanged.

**Rationale:**
- L1 is the problematic layer — it's coarse-grained and inflates subgraphs when added as anchor
- L2/L3 are fine-grained (file/element level); even if not perfectly relevant, they don't add many nodes
- Simpler model, fewer parameters
- L2/L3 provide precision anchors that complement C-layer's business semantics

**Alternatives considered:**
- All layers decay with different rates (more parameters, harder to justify)
- All layers decay equally (doesn't match the intuition that fine-grained = less inflation)

### 5. Clean break: schema 3.0, no migration, full rebuild only

**Chosen:** Schema version jumps from 2.0.0 to 3.0.0. Old graphs are incompatible. Auto-upgrade triggers full rebuild.

**Rationale:**
- Changing layer identities is fundamentally incompatible
- No meaningful way to "migrate" requirement nodes to capability nodes
- Full rebuild is simple and correct
- User already has `wpw graph rebuild` command

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking change disrupts existing users | Clear upgrade messaging, auto-full-rebuild on version mismatch |
| Cold start: empty C-layer means no business dimension | L1 fallback via confidence decay ensures structure-based search works |
| AI-generated capability specs may be inconsistent quality | Spec format is structured; quality improves iteratively as more requirements archive |
| α=3.0 default might not be optimal for all projects | Configurable; can tune per-project |
| All AI-layer docs need updating for new naming | Included in tasks; comprehensive sweep |

## Architecture Overview

```
wpw/specs/                    wpw/active/         wpw/archived/
  (能力规范，稳态)             (活跃需求，临时)    (归档需求，历史)
       │                            │                   │
       ▼                            ▼                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     知识图谱                                       │
│                                                                  │
│   C 层 (capability)                                               │
│     来源：wpw/specs/ 解析                                        │
│     节点：业务能力                                                │
│     边：business_map → L1/L2/L3                                   │
│                                                                  │
│   L1 层 (module)   ← 原 L2                                       │
│     来源：源码目录结构 / 手动配置                                 │
│     节点：业务模块                                                │
│     边：contain → L2                                             │
│                                                                  │
│   L2 层 (file)     ← 原 L3                                       │
│     来源：源码文件解析                                            │
│     节点：文件                                                    │
│     边：contain → L3, import → 其他 L2                           │
│                                                                  │
│   L3 层 (element)  ← 原 L4                                       │
│     来源：AST 解析                                               │
│     节点：function/class/component/...                           │
│     边：call → 其他 L3, inherit → 其他 L3                        │
└──────────────────────────────────────────────────────────────────┘

锚点选择算法：
  语义检索 → 计算各层相似度
         → Conf_C = max(C层得分)
         → w_L1 = exp(-α · Conf_C)
         → L1有效分 = L1原始分 × w_L1
         → 所有节点按有效分排序
         → Top-K 作为锚点
```

## Migration Plan

No incremental migration path. On first run after upgrade:
1. `wpw graph update` detects schema version < 3.0.0
2. Outputs clear message: "图谱架构升级至 3.0，正在全量重建..."
3. Performs full rebuild automatically
4. New graph has C + L1/L2/L3 structure

Users can also manually run `wpw graph rebuild` at any time.

## Open Questions

None — all key decisions resolved during exploration.
