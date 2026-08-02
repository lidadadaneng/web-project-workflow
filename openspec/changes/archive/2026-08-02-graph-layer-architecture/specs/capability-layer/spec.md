## Purpose

Defines the Capability layer (C-layer) of the knowledge graph — business capability nodes derived from wpw/specs/ steady-state specifications, serving as the business-dimension index that maps semantic queries to code structures via business_map edges.

## ADDED Requirements

### Requirement: Capability nodes from wpw/specs/
The system SHALL generate C-layer (Capability) graph nodes from `wpw/specs/**/spec.md` files in OpenSpec spec format. Each capability spec becomes one C-layer node.

#### Scenario: Capability specs parsed as C-layer nodes
- **WHEN** `wpw graph build` is executed and `wpw/specs/` contains capability spec files
- **THEN** each spec file generates one C-layer node
- **AND** the node name is the spec directory name (kebab-case English)
- **AND** the node description is extracted from the spec's Purpose section

#### Scenario: No specs directory yields no C-layer nodes
- **WHEN** `wpw graph build` is executed and `wpw/specs/` does not exist
- **THEN** zero C-layer nodes are generated
- **AND** graph build completes normally with only structure-layer nodes

#### Scenario: Capability nodes carry structured features
- **WHEN** a capability spec contains requirement sections with scenarios
- **THEN** the C-layer node's `attrs.features` array includes structured feature entries extracted from the spec
- **AND** feature IDs and names are derived from requirement headings

### Requirement: Capability business_map edges
C-layer capability nodes SHALL be connected to structure-layer nodes (L1 modules, L2 files, L3 elements) via `business_map` edges, using the same multi-source evidence fusion (noisy-OR) mechanism as the original requirement-to-code mapping.

#### Scenario: Multi-source evidence fusion for capabilities
- **WHEN** building business_map edges for C-layer nodes
- **THEN** the system aggregates evidence from doc-extract (spec content), semantic (vector similarity), and name-match sources
- **AND** weights are computed via the noisy-OR formula: `finalWeight = 1 − ∏(1 − baseWeightᵢ)`
- **AND** edge `source` field records the most authoritative evidence source

#### Scenario: Semantic evidence uses spec content
- **WHEN** computing semantic similarity for a capability node
- **THEN** the vector text includes the spec's purpose, requirements, and scenario descriptions
- **AND** similarity is computed against L1/L2/L3 node vectors

### Requirement: Requirements not in graph
Active requirements (in `wpw/active/`) and archived requirements (in `wpw/archived/`) SHALL NOT appear as graph nodes. Requirements are workflow artifacts, not graph entities.

#### Scenario: Active requirements not in graph
- **WHEN** the graph is built and there are active requirements in `wpw/active/`
- **THEN** no nodes are generated from active requirement directories
- **AND** requirement state files are only read by the workflow CLI, not by graph builders

#### Scenario: Archived requirements not in graph
- **WHEN** the graph is built and there are archived requirements in `wpw/archived/`
- **THEN** no nodes are generated from archived requirement directories
- **AND** archived requirements exist only as historical records in wpw/

### Requirement: Capability spec generation on archive
When a requirement is archived, the system SHALL generate or update a capability spec in `wpw/specs/` based on the requirement's content.

#### Scenario: New capability created on archive
- **WHEN** a requirement is archived and no matching capability spec exists
- **THEN** AI generates a new capability spec file at `wpw/specs/<capability-name>/spec.md`
- **AND** the spec follows OpenSpec format with Purpose and Requirements sections
- **AND** the capability name is English kebab-case, derived from the requirement's content

#### Scenario: Existing capability updated on archive
- **WHEN** a requirement is archived and a matching capability spec already exists
- **THEN** AI updates the existing spec with delta changes from the requirement
- **AND** the spec version is incremented (new requirements added, modified requirements updated)

#### Scenario: AI recommends capability归属
- **WHEN** archiving a requirement
- **THEN** AI analyzes the requirement content to determine which capability domain it belongs to
- **AND** AI selects the best matching existing capability or proposes a new capability name
- **AND** no user confirmation is required — AI decides directly
