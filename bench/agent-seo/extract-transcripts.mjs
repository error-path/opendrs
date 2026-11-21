// Rebuilds each run's record from the agent's own Claude Code transcript instead of trusting the
// JSON the agent wrote: every WebSearch query with the results the tool actually returned, every
// WebFetch URL, and the recommendations from the agent's final file.
// Usage: node extract-transcripts.mjs <subagentsDir> <rawDirName> <outDir>
//   <rawDirName> is the folder name the agents wrote to (for example "full"); only transcripts that
//   wrote a <id>-<run>.json file into a folder of that name are used.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [subagentsDir, rawDirName, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

/**
 * Reads one subagent transcript and returns its run record, or null when it is not a benchmark run.
 *
 * @param transcriptPath - Path of the `agent-*.jsonl` transcript.
 * @returns The run id (such as `q01-r1`) and its record built from real tool calls and results.
 */
function extractRun(transcriptPath) {
  const toolCalls = new Map();
  const searches = [];
  const fetches = [];
  let runId = null;
  let recommendations = [];
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const blocks = entry.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type === 'tool_use') {
        toolCalls.set(block.id, block);
        if (block.name === 'WebFetch') fetches.push(block.input?.url);
        const writePath = String(block.input?.file_path ?? '').replace(/\\/g, '/');
        const match = writePath.match(new RegExp(`/${rawDirName}/(q\\d+-r\\d+)\\.json$`));
        if (block.name === 'Write' && match) {
          runId = match[1];
          try { recommendations = JSON.parse(block.input.content).recommendations ?? []; } catch { recommendations = []; }
        }
      }
      if (block.type === 'tool_result' && toolCalls.get(block.tool_use_id)?.name === 'WebSearch') {
        const text = typeof block.content === 'string'
          ? block.content
          : (block.content ?? []).map((part) => part.text ?? '').join('');
        const linksJson = text.match(/Links: (\[.*?\])\n/s)?.[1];
        let links = [];
        try { links = JSON.parse(linksJson ?? '[]'); } catch { links = []; }
        searches.push({
          query: toolCalls.get(block.tool_use_id).input?.query,
          results: links.map((link, index) => ({ rank: index + 1, title: link.title, url: link.url })),
        });
      }
    }
  }
  return runId ? { runId, record: { searches, fetches, recommendations } } : null;
}

let written = 0;
for (const fileName of readdirSync(subagentsDir).filter((name) => name.endsWith('.jsonl'))) {
  const run = extractRun(join(subagentsDir, fileName));
  if (!run) continue;
  writeFileSync(join(outDir, `${run.runId}.json`), JSON.stringify(run.record, null, 1));
  written += 1;
}
console.error(`wrote ${written} runs to ${outDir}`);
