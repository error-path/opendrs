// Summarizes raw agent runs: was opendrs found, at what rank, recommended, and what was cited instead.
// Usage: node score.mjs <rawDir> <runLabel> > out.jsonl
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [rawDir, runLabel] = process.argv.slice(2);
const queries = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8'));
/** True when a URL, title or name points at opendrs or its GitHub owner. */
const isOpendrs = (text) => /opendrs|error-path/i.test(text ?? '');

for (const fileName of readdirSync(rawDir).filter((name) => name.endsWith('.json')).sort()) {
  const [queryId, run] = fileName.replace('.json', '').split('-');
  const query = queries.find((entry) => entry.id === queryId);
  let raw;
  try { raw = JSON.parse(readFileSync(join(rawDir, fileName), 'utf8')); }
  catch (error) { console.log(JSON.stringify({ queryId, run, error: String(error) })); continue; }
  const searches = raw.searches ?? [];
  let firstHit = null;
  searches.forEach((search, searchIndex) => {
    for (const result of search.results ?? []) {
      if (!firstHit && isOpendrs(`${result.url} ${result.title}`)) {
        firstHit = { searchNumber: searchIndex + 1, rank: result.rank, url: result.url };
      }
    }
  });
  const recommendations = raw.recommendations ?? [];
  const opendrsRecommendation = recommendations.find((item) => isOpendrs(`${item.name} ${item.url}`));
  console.log(JSON.stringify({
    date: runLabel, queryId, run, query: query?.query,
    searchCount: searches.length, fetchCount: (raw.fetches ?? []).length,
    foundInResults: Boolean(firstHit), firstHit,
    fetchedOpendrs: (raw.fetches ?? []).some(isOpendrs),
    recommended: Boolean(opendrsRecommendation),
    opendrsDescription: opendrsRecommendation?.description ?? null,
    recommendations: recommendations.map((item) => ({ name: item.name, url: item.url })),
  }));
}
