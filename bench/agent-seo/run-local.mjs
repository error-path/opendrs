// Runs the agent search benchmark with no Claude tokens: a scripted search-and-recommend loop driven
// by a local Ollama model. Output files match the Claude runs, so score.mjs reads both.
//
// Usage: node run-local.mjs [--out raw-local-<date>] [--runs 3] [--model qwen2.5-coder:7b]
//                           [--only q01,q07] [--backend brave|google|bing] [--country us]
// Needs Ollama on localhost:11434. Backends: brave needs BRAVE_API_KEY (free tier 2,000/month);
// google needs GOOGLE_API_KEY and GOOGLE_CX (Programmable Search, 100 free/day, real Google
// results per country); bing scrapes bing.com and degrades after a few requests, so it is only a
// fallback and the run stops when results turn unrelated.
//
// Each run: search the query, let the model choose one follow-up search, fetch the top pages of
// both searches, then ask the model for 3 recommendations. The model never sees the word
// "opendrs" unless a search result or page contains it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
/** Returns the value after `--name`, or the fallback. */
const option = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const today = new Date().toISOString().slice(0, 10);
const outDir = new URL(option('out', `raw-local-${today}`) + '/', import.meta.url);
const runCount = Number(option('runs', '3'));
const model = option('model', 'qwen2.5-coder:7b');
const backend = option('backend', process.env.BRAVE_API_KEY ? 'brave' : process.env.GOOGLE_CX ? 'google' : 'chrome');
const country = option('country', 'us');
const onlyIds = option('only', '')?.split(',').filter(Boolean) ?? [];
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const pagesToFetch = 5;
const pageCharacters = 2500;

/** Waits the given number of milliseconds. */
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Decodes Bing's click-tracking link back to the result URL.
 *
 * @param href - The `href` of a Bing result link.
 * @returns The destination URL, or the input when it is not a tracking link.
 */
function decodeBingLink(href) {
  const encoded = href.replace(/&amp;/g, '&').match(/[?&]u=a1([^&]+)/)?.[1];
  if (!encoded) return href;
  return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Searches the web with the chosen backend and returns the first 20 results in order.
 *
 * @param query - The search text.
 * @returns Ranked results with title and URL.
 * @throws If the backend answers with an error or a bot check.
 */
async function search(query) {
  if (!searchCache.has(query)) searchCache.set(query, await searchUncached(query));
  return searchCache.get(query);
}

/** Results per query for this invocation: repeated runs on one day see the same results. */
const searchCache = new Map();

/**
 * Calls the search backend without the cache.
 *
 * @param query - The search text.
 * @returns Ranked results with title and URL.
 * @throws If the backend fails, blocks the request or returns unrelated results.
 */
async function searchUncached(query) {
  if (backend === 'brave') {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?count=20&country=${country}&q=${encodeURIComponent(query)}`,
      { headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY ?? '', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Brave HTTP ${response.status}`);
    const body = await response.json();
    const results = (body.web?.results ?? []).map((result, index) => ({ rank: index + 1, title: result.title, url: result.url }));
    assertRelevant(query, results);
    return results;
  }
  if (backend === 'chrome') return searchInChrome(query);
  if (backend === 'google') {
    const results = [];
    for (const start of [1, 11]) {
      const response = await fetch(`https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CX}` +
        `&gl=${country}&num=10&start=${start}&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Google HTTP ${response.status}`);
      for (const item of (await response.json()).items ?? []) results.push({ rank: results.length + 1, title: item.title, url: item.link });
    }
    assertRelevant(query, results);
    return results;
  }
  const results = [];
  for (const first of [1, 11]) {
    const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=us&setlang=en&first=${first}`,
      { headers: { 'User-Agent': userAgent, 'Accept-Language': 'en-US' } });
    const html = await response.text();
    if (!response.ok || /captcha|unusual traffic/i.test(html)) throw new Error(`Bing blocked or failed (HTTP ${response.status})`);
    for (const block of html.split('<li class="b_algo"').slice(1)) {
      const link = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) continue;
      results.push({ rank: results.length + 1, title: link[2].replace(/<[^>]+>/g, '').trim(), url: decodeBingLink(link[1]) });
    }
    await sleep(2000);
  }
  assertRelevant(query, results);
  return results;
}

/** The real-Chrome page used by the chrome backend, opened on first use. */
let chromePage = null;

/**
 * Searches Bing in a real Chrome window driven by playwright-core, which Bing answers with real
 * results where scripted requests get unrelated ones. playwright-core is loaded from
 * OPENDRS_BENCH_TOOLS (default ~/.opendrs-bench-tools) so the repository gains no dependency.
 *
 * @param query - The search text.
 * @returns The first 20 results in order.
 * @throws If results are still unrelated after one retry.
 */
async function searchInChrome(query) {
  if (!chromePage) {
    const toolsDir = process.env.OPENDRS_BENCH_TOOLS ?? join(homedir(), '.opendrs-bench-tools');
    const { chromium } = createRequire(join(toolsDir, 'package.json'))('playwright-core');
    const context = await chromium.launchPersistentContext(join(toolsDir, 'chrome-profile'),
      { channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    chromePage = await context.newPage();
    await chromePage.goto('https://www.bing.com/?cc=us&setlang=en');
    await sleep(5000);
  }
  for (let attempt = 1; ; attempt += 1) {
    const results = [];
    for (const first of [1, 11]) {
      await chromePage.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=us&setlang=en&first=${first}`);
      await sleep(3000);
      const links = await chromePage.$$eval('li.b_algo h2 a', (anchors) => anchors.map((anchor) => ({ title: anchor.textContent, href: anchor.href })));
      for (const link of links) results.push({ rank: results.length + 1, title: link.title.trim(), url: decodeBingLink(link.href) });
      await sleep(8000);
    }
    try {
      assertRelevant(query, results);
      return results;
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(20000);
    }
  }
}

/**
 * Stops the run when a search engine has silently swapped in unrelated results, which Bing does
 * after a few scripted requests; scoring those would corrupt the benchmark.
 *
 * @param query - The search text.
 * @param results - The ranked results returned for it.
 * @throws If none of the top 5 results shares a word of 4+ letters with the query.
 */
function assertRelevant(query, results) {
  const words = query.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const relevant = results.slice(0, 5).filter((result) => words.some((word) => `${result.title} ${result.url}`.toLowerCase().includes(word)));
  if (words.length > 0 && relevant.length === 0) throw new Error(`degraded results for "${query}" (top 5 unrelated); use --backend brave or google`);
}

/**
 * Fetches a page and returns its visible text, shortened.
 *
 * @param url - The page to read.
 * @returns Up to `pageCharacters` of text, or an empty string when the page cannot be read.
 */
async function readPage(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(10000) });
    const html = await response.text();
    return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, pageCharacters);
  } catch {
    return '';
  }
}

/**
 * Asks the local model for a JSON answer.
 *
 * @param prompt - The full instruction, including the JSON shape wanted.
 * @param seed - Seed for this run, so runs differ the way repeated agent runs do.
 * @returns The parsed JSON object.
 * @throws If Ollama is not reachable.
 */
async function askModel(prompt, seed) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model, prompt, format: 'json', stream: false, options: { temperature: 0.7, seed, num_ctx: 16384 } }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  try { return JSON.parse((await response.json()).response); } catch { return {}; }
}

/** Formats search results as the numbered list the model reads. */
const listResults = (results) => results.map((result) => `${result.rank}. ${result.title} - ${result.url}`).join('\n');

/**
 * Runs one search-and-recommend loop for one query.
 *
 * @param entry - One entry of queries.json.
 * @param seed - Seed for the model in this run.
 * @returns The run record: searches, fetched URLs and recommendations.
 */
async function runOnce(entry, seed) {
  const firstResults = await search(entry.query);
  const plan = await askModel(
    `You are helping someone who needs ${entry.need}. You searched for "${entry.query}" and got:\n${listResults(firstResults)}\n\n` +
    'Choose one follow-up web search that would help you recommend the best tools. Answer as JSON: {"followUpQuery": "..."}', seed);
  const searches = [{ query: entry.query, results: firstResults }];
  if (typeof plan.followUpQuery === 'string' && plan.followUpQuery.trim()) {
    searches.push({ query: plan.followUpQuery.trim(), results: await search(plan.followUpQuery.trim()) });
  }
  const candidates = [...new Set(searches.flatMap((item) => item.results.slice(0, 3).map((result) => result.url)))].slice(0, pagesToFetch);
  const pages = [];
  for (const url of candidates) pages.push({ url, text: await readPage(url) });
  const answer = await askModel(
    `Someone needs ${entry.need}. Using only the search results and page excerpts below, recommend 3 options with links.\n\n` +
    searches.map((item) => `Search "${item.query}":\n${listResults(item.results)}`).join('\n\n') + '\n\n' +
    pages.map((page) => `Page ${page.url}:\n${page.text}`).join('\n\n') +
    '\n\nAnswer as JSON: {"recommendations": [{"name": "...", "url": "...", "description": "one sentence"}]}', seed);
  return { searches, fetches: candidates, recommendations: Array.isArray(answer.recommendations) ? answer.recommendations.slice(0, 3) : [] };
}

const queries = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8'))
  .filter((entry) => onlyIds.length === 0 || onlyIds.includes(entry.id));
mkdirSync(outDir, { recursive: true });
// Stop after 3 failed runs in a row: the network or the search engine is down, and waiting it out
// in a loop only produces errors.
let failuresInARow = 0;
runLoop: for (const entry of queries) {
  for (let run = 1; run <= runCount; run += 1) {
    const runId = `${entry.id}-r${run}`;
    try {
      const record = await runOnce(entry, run);
      failuresInARow = 0;
      writeFileSync(join(outDir.pathname.replace(/^\/([A-Za-z]:)/, '$1'), `${runId}.json`), JSON.stringify(record, null, 1));
      const hit = record.searches.flatMap((item) => item.results).find((result) => /opendrs|error-path/i.test(result.url + result.title));
      console.log(`${runId} searches=${record.searches.length} found=${hit ? hit.rank : '-'} recommended=${record.recommendations.some((item) => /opendrs|error-path/i.test(`${item.name} ${item.url}`))}`);
    } catch (error) {
      console.log(`${runId} ERROR ${error.message.split(String.fromCharCode(10))[0]}`);
      failuresInARow += 1;
      if (failuresInARow >= 3) { console.log('stopping: 3 failed runs in a row'); break runLoop; }
      continue;
    }
  }
}
if (chromePage) await chromePage.context().close();
