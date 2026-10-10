#!/usr/bin/env node
'use strict';

// Batch semantic queries against one frozen wpw graph while loading the
// embedding model only once.  This is intentionally a thin wrapper around
// wpw's public graph classes; it does not implement an alternative retriever.

const fs = require('fs');
const path = require('path');

const wpwRoot = path.resolve(__dirname, '..');
const {
  JsonlGraphStore,
  BinaryVectorStore,
  VectorMappingStore,
  GraphQuerier,
  SemanticSearcher,
  ContextPipeline,
  loadGraphConfig,
} = require(path.join(wpwRoot, 'dist', 'graph'));

async function main() {
  const [graphDir, queryFile, outputFile] = process.argv.slice(2);
  if (!graphDir || !queryFile || !outputFile) {
    throw new Error('usage: node run_graph_query_batch.js <graph-dir> <queries.json> <output.json>');
  }

  const store = new JsonlGraphStore(path.resolve(graphDir));
  const vectorStore = new BinaryVectorStore(path.resolve(graphDir));
  const mappingStore = new VectorMappingStore(path.resolve(graphDir));
  const data = store.load();
  const vectors = vectorStore.load();
  const mapping = mappingStore.load();
  const dimensions = vectorStore.getDimensions();
  if (!vectors || !mapping || !dimensions) {
    throw new Error(`graph vector index is incomplete: ${graphDir}`);
  }

  const queries = JSON.parse(fs.readFileSync(path.resolve(queryFile), 'utf8'));
  const querier = new GraphQuerier(data);
  const searcher = new SemanticSearcher(querier, vectors, dimensions, mapping, 3.0);
  const projectRoot = path.resolve(graphDir, '..', '..', '..', '..');
  const config = loadGraphConfig(projectRoot);
  const pipeline = new ContextPipeline(data, vectors, dimensions, mapping, config);
  const rows = [];
  for (let i = 0; i < queries.length; i += 1) {
    const q = queries[i];
    const started = performance.now();
    const results = await searcher.search(q.query, { limit: 50, threshold: 0 });
    const codeResults = await searcher.search(q.query, {
      limit: 50,
      threshold: 0,
      level: ['L2', 'L3'],
      decay: false,
    });
    const capabilityResults = await searcher.search(q.query, {
      limit: 8,
      threshold: 0,
      level: 'C',
      decay: false,
    });
    const context = await pipeline.generate({
      anchors: codeResults.slice(0, 8).map((result) => result.node.id),
      depth: 2,
      minWeight: 0.3,
      maxNodes: 100,
      compression: 'extreme',
    });
    rows.push({
      id: q.id,
      query: q.query,
      elapsed_ms: performance.now() - started,
      results: results.map((r) => ({ node: r.node, score: r.score, effectiveScore: r.effectiveScore })),
      code_results: codeResults.map((r) => ({ node: r.node, score: r.score, effectiveScore: r.effectiveScore })),
      capability_results: capabilityResults.map((r) => ({ node: r.node, score: r.score, effectiveScore: r.effectiveScore })),
      pipeline: {
        anchors: context.anchors,
        nodes: context.subgraph.nodes.map((node) => ({
          node,
          distance: context.subgraph.distances.get(node.id),
          score: context.subgraph.scores.get(node.id),
        })),
        edges: context.subgraph.edges,
        compressed_text: context.compressedText,
        stats: context.stats,
      },
    });
    process.stderr.write(`\r${i + 1}/${queries.length}`);
  }
  process.stderr.write('\n');
  fs.writeFileSync(path.resolve(outputFile), JSON.stringify(rows, null, 2), 'utf8');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
