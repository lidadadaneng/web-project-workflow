## Context

See proposal.md for motivation. Current state:
- `/wpw:brd <需求名>` takes a Chinese name as the requirement identifier
- Requirement name is used directly as directory name, state key, and L1 graph node name
- No naming convention enforcement exists at any layer
- Exact duplicate check exists (active + archived) but no semantic duplicate detection
- Graph search examples and AI-layer prompts use Chinese search terms

## Goals / Non-Goals

**Goals:**
- AI auto-generates English kebab-case requirement names from natural language descriptions
- Semantic duplicate detection via graph search before creating new requirements
- CLI-level kebab-case format validation as a safety net
- Requirement nodes carry both English `name` (identifier) and Chinese `description` (display)
- All AI-layer prompts enforce English search terms when querying the graph (every stage: BRD, Explore, Design, Plan, Apply, CR)

**Non-Goals:**
- Migrating existing Chinese-named requirements (they stay as-is, backward compatible)
- Multi-language graph search (vector model is Chinese; English search works because node names are English text embedded in Chinese-trained model)
- Interactive name confirmation (AI decides, no user prompt)
- BRD/PRD document language change (documents remain Chinese)

## Decisions

### 1. Naming format: kebab-case English, 2-4 words

**Chosen:** English kebab-case with `<domain>-<action>` pattern, 2-4 words, max 30 chars.

**Rationale:**
- Aligns with OpenSpec change naming convention (familiar pattern)
- Directory-safe, URL-safe, CLI-argument-safe
- `<domain>-<action>` structure maps well to business capability naming
- English names match codebase identifiers, improving name-match evidence quality for `business_map` edges

**Alternatives considered:**
- Chinese pinyin (lower readability for English-speaking tools/AI)
- Random slug + display name (over-engineering for this use case)

### 2. Semantic duplicate detection thresholds

**Chosen:**
- >= 0.85: Block creation (high confidence duplicate)
- 0.7 - 0.85: Warn but continue (possible overlap, user decides)
- < 0.7: No action

**Rationale:**
- L1 nodes have relatively long vector text (BRD + PRD content), so similarity scores for truly duplicate requirements should be high
- Using requirement description (user input) as the query vector, comparing against existing L1 nodes
- Thresholds are initial values, can be tuned based on real-world usage

**Alternatives considered:**
- Single threshold (simpler but less nuanced)
- User confirmation on medium similarity (adds friction; we decided against confirmation flow)

### 3. Cold start: skip semantic check, only exact name check

**Chosen:** When graph doesn't exist, skip semantic duplicate detection and only check exact name match.

**Rationale:**
- First project use has no graph to compare against anyway
- Avoids requiring graph build before first requirement creation
- Exact name check still prevents obvious duplicates

### 4. Description extraction from BRD title

**Chosen:** Extract Chinese description from BRD document title or first heading. Fallback to requirement name if extraction fails.

**Rationale:**
- BRD title is the most natural source of a Chinese summary
- Keeps node display human-readable while name stays machine-friendly
- Minimal implementation cost

### 5. AI-layer changes are prompt-level, not code-level

**Chosen:** Modify `ai-layer/commands/wpw/brd.md` and `ai-layer/commands/wpw/map.md` markdown prompts. No code changes needed for the AI naming flow.

**Rationale:**
- BRD command is an AI-layer concept (the CLI `wpw new` just creates a directory)
- AI prompt updates are independent of CLI code changes
- Both layers need changes but they're loosely coupled

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| AI-generated names may be inconsistent in quality | CLI kebab-case validation as bottom-line enforcement; naming guidelines in brd.md prompt |
| Semantic duplicate detection may have false positives | Two-tier threshold (block vs warn); warn-level doesn't block flow |
| Existing Chinese-named requirements may cause confusion during graph search | Documentation clarifies both are valid; English is standard going forward |
| bge-small-zh-v1.5 (Chinese model) may not embed English names well | Vector text includes Chinese description + BRD/PRD content (Chinese), so semantic search still works on Chinese content; name-match edge works on exact English name |
