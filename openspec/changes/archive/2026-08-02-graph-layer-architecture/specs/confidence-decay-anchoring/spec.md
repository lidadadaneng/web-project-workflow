## Purpose

Implements the Confidence Decay Weighting algorithm for anchor point selection in semantic graph search. The algorithm dynamically adjusts the weight of L1 (module) layer search results based on the confidence of C-layer (capability) matches, balancing precision and recall in subgraph context generation.

## ADDED Requirements

### Requirement: Confidence decay weighting algorithm
The system SHALL apply an exponential decay function to L1 layer similarity scores based on the maximum C-layer similarity, reducing L1 anchor influence when C-layer matches are high-confidence.

The L1 weight is computed as:
`w_L1 = exp(-α * Conf_C)`

where `Conf_C` is the maximum similarity score among C-layer candidates, and α is the decay coefficient (default: 3.0).

#### Scenario: High C-layer confidence suppresses L1
- **WHEN** the top C-layer similarity score is >= 0.8
- **THEN** L1 node effective scores are multiplied by a weight <= ~0.09 (with α=3.0)
- **AND** L1 nodes are effectively suppressed in anchor selection

#### Scenario: Low C-layer confidence preserves L1
- **WHEN** the top C-layer similarity score is <= 0.2
- **THEN** L1 node effective scores are multiplied by a weight >= ~0.55 (with α=3.0)
- **AND** L1 nodes contribute meaningfully to anchor selection

#### Scenario: No C-layer nodes gives full L1 weight
- **WHEN** there are zero C-layer nodes (cold start or no specs)
- **THEN** `Conf_C = 0` and `w_L1 = 1.0`
- **AND** L1 nodes are treated with full original similarity scores

### Requirement: L2 and L3 layers not decayed
L2 (file) and L3 (element) layer similarity scores SHALL NOT be modified by the confidence decay mechanism. Only L1 (module) layer scores are decayed.

#### Scenario: L2 and L3 scores unchanged
- **WHEN** confidence decay weighting is applied
- **THEN** L2 and L3 node scores remain at their original similarity values
- **AND** only L1 node scores are multiplied by `w_L1`

#### Scenario: Fine-grained layers always contribute
- **WHEN** L2 or L3 nodes match the query semantically
- **THEN** they participate in anchor selection with full weight regardless of C-layer confidence
- **AND** they provide fine-grained anchor points that don't inflate subgraph size

### Requirement: Unified anchor ranking after decay
After applying decay weighting, the system SHALL rank all candidate nodes (C, L1, L2, L3) by their effective scores and select the top-K as anchors.

#### Scenario: Mixed-layer anchor selection
- **WHEN** semantic search returns candidates across multiple layers
- **THEN** all candidates are ranked by their effective scores (decayed for L1, original for others)
- **AND** the top-K nodes are selected as anchors regardless of layer distribution

#### Scenario: Anchor limit respected
- **WHEN** more than K candidates exist after ranking
- **THEN** only the top-K are selected as anchors
- **AND** K is configurable via the `anchorLimit` parameter (default: 5)

### Requirement: Configurable decay coefficient
The decay coefficient α SHALL be configurable via the graph search configuration.

#### Scenario: Default decay coefficient
- **WHEN** no custom α is configured
- **THEN** the system uses α = 3.0 as the default

#### Scenario: Custom decay coefficient
- **WHEN** the configuration specifies a custom `decayAlpha` value
- **THEN** the system uses the configured α value for decay computation

### Requirement: Decay only affects anchor selection
The confidence decay weighting SHALL only affect anchor point selection. It does NOT modify node vectors, edge weights, or subgraph expansion logic.

#### Scenario: Decay applied at anchor selection stage
- **WHEN** generating graph context
- **THEN** decay weighting is applied during the anchor selection phase (after semantic search, before subgraph expansion)
- **AND** subsequent subgraph trimming and compression are unaffected

#### Scenario: Direct anchor mode skips decay
- **WHEN** anchors are specified directly via `--anchors` (bypassing semantic search)
- **THEN** confidence decay weighting is not applied
- **AND** all specified anchors are used as-is
