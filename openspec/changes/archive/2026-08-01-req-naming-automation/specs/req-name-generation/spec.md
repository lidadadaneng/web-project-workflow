## Purpose

Provides automated English kebab-case requirement name generation and semantic duplicate detection, ensuring consistent naming across the knowledge graph and preventing creation of duplicate or near-duplicate requirements.

## ADDED Requirements

### Requirement: AI generates English requirement name from description
The system SHALL generate a kebab-case English requirement name automatically from the user's natural language requirement description, without requiring user confirmation.

#### Scenario: Name generated from Chinese description
- **WHEN** the user invokes `/wpw:brd` with a Chinese requirement description
- **THEN** the AI generates a kebab-case English requirement name based on the description content
- **AND** the name follows the `<domain>-<action>` structure with 2-4 words

#### Scenario: Name generated from English description
- **WHEN** the user invokes `/wpw:brd` with an English requirement description
- **THEN** the AI generates a kebab-case English requirement name based on the description content

#### Scenario: Name is used as directory and node identifier
- **WHEN** the requirement is created
- **THEN** the generated name is used as the requirement directory name, state name, and L1 graph node name

### Requirement: Semantic duplicate detection before creation
The system SHALL check the knowledge graph for semantically similar requirements before creating a new one, and prevent creation when a highly similar requirement already exists.

#### Scenario: Exact name match blocks creation
- **WHEN** the generated name exactly matches an existing requirement (active or archived)
- **THEN** the system rejects the creation with a clear error message

#### Scenario: High semantic similarity blocks creation
- **WHEN** the semantic search returns a requirement with similarity >= 0.85 against the new requirement description
- **THEN** the system blocks creation and reports the similar requirement

#### Scenario: Medium semantic similarity warns but continues
- **WHEN** the semantic search returns requirements with similarity between 0.7 and 0.85
- **THEN** the system logs a warning listing the similar requirements
- **AND** proceeds with creation

#### Scenario: No graph available skips semantic check
- **WHEN** the knowledge graph does not exist (first use / cold start)
- **THEN** the system skips semantic duplicate detection
- **AND** performs only exact name checking

### Requirement: CLI name format validation
The CLI SHALL validate that requirement names follow kebab-case format before creating a new requirement.

#### Scenario: Valid kebab-case name accepted
- **WHEN** `wpw new cart-batch-delete` is called
- **THEN** the requirement is created successfully

#### Scenario: Chinese characters rejected
- **WHEN** `wpw new 购物车删除` is called
- **THEN** the system rejects with a format error message

#### Scenario: Spaces rejected
- **WHEN** `wpw new "cart delete"` is called
- **THEN** the system rejects with a format error message

#### Scenario: Uppercase characters rejected
- **WHEN** `wpw new Cart-Delete` is called
- **THEN** the system rejects with a format error message

### Requirement: Graph search uses English query convention
All AI-layer prompts SHALL enforce English search terms when invoking `wpw graph search` and `wpw graph context`. This applies to every workflow stage that queries the knowledge graph (BRD cost estimation, Explore, Design, Plan, Apply, Code Review).

#### Scenario: AI always uses English search terms
- **WHEN** any AI-layer command (brd/explore/design/plan/apply/cr) invokes `wpw graph search` or `wpw graph context`
- **THEN** the query text SHALL be in English, translated from the requirement/task description if necessary
- **AND** Chinese search terms are NOT used

#### Scenario: Map command examples use English
- **WHEN** the `/wpw:map` command documentation shows search examples
- **THEN** all example queries use English search terms

#### Scenario: English search documented as mandatory rule
- **WHEN** the user reads the graph search documentation
- **THEN** the documentation explicitly states that English search terms are the standard convention
- **AND** the wpw-workflow skill includes this as a mandatory rule for all AI operations

#### Scenario: Multi-query mode uses English
- **WHEN** `wpw graph context --multi` is used with multiple keywords
- **THEN** all comma-separated keywords SHALL be in English
