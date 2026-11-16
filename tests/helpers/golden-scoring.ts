import type { OpendrsConfig } from "../../src/domain/config.js";
import { makeRepo } from "./repo.js";

/** The fixed clock of the golden scoring: `now` in ms and `asOf` in seconds, after every commit. */
const NOW_SECONDS = 1_800_000_000;
const DAY = 86_400;

/** The part of `scoreDiff` the golden scoring calls, so the same scenario can run against another build of the engine. */
type ScoreDiff = (options: {
  repoDir: string;
  base: string;
  head: string;
  config: OpendrsConfig;
  llm: null;
  now: number;
  asOf: number;
  brief: { llm: false };
}) => Promise<unknown>;

/**
 * Scores a fixed pull request in full mode and returns the result as stable JSON.
 *
 * The repository is built with fixed authors, messages and commit times, and scored with a fixed
 * clock, so two runs differ only where the engine does. Commit hashes and the temporary directory
 * are blanked, so the JSON does not depend on the git version or the machine.
 *
 * @param scoreDiff - The engine's `scoreDiff`, from this branch or from another build.
 * @param config - The config to score with, from the same build.
 * @returns The result as indented JSON with a trailing newline.
 */
export async function scoreGoldenPullRequest(scoreDiff: ScoreDiff, config: OpendrsConfig): Promise<string> {
  const repo = makeRepo();
  try {
    const alice = { name: "Alice", email: "alice@example.com" };
    const bob = { name: "Bob", email: "bob@example.com" };
    let time = NOW_SECONDS - 120 * DAY;
    const at = () => (time += DAY);
    repo.commit(
      {
        "src/billing/invoice.ts": "export function total(lines: number[]) {\n  return lines.reduce((sum, line) => sum + line, 0);\n}\n",
        "src/billing/tax.ts": "export const RATE = 0.2;\nexport function tax(amount: number) {\n  return amount * RATE;\n}\n",
        "src/util/format.ts": "export const money = (value: number) => value.toFixed(2);\n",
        "tests/billing/invoice.test.ts": "import { total } from '../../src/billing/invoice';\ntest('total', () => expect(total([1, 2])).toBe(3));\n",
        "README.md": "# shop\n",
      },
      "initial import",
      alice,
      at(),
    );
    repo.commit({ "src/billing/tax.ts": "export const RATE = 0.21;\nexport function tax(amount: number) {\n  return amount * RATE;\n}\n" }, "fix: tax rate rounding", bob, at());
    repo.commit({ "src/billing/invoice.ts": "export function total(lines: number[]) {\n  if (lines.length === 0) return 0;\n  return lines.reduce((sum, line) => sum + line, 0);\n}\n" }, "fix: empty invoice crash", alice, at());
    repo.commit({ "src/util/format.ts": "export const money = (value: number) => `$${value.toFixed(2)}`;\n" }, "feat: currency sign", bob, at());
    const base = repo.commit({ "docs/billing.md": "# Billing\n\nTotals and tax.\n" }, "docs: billing", alice, at());

    repo.git("checkout", "-q", "-b", "feature");
    repo.commit(
      {
        "src/billing/invoice.ts":
          "import { tax } from './tax';\nexport function total(lines: number[], withTax = false) {\n  if (lines.length === 0) return 0;\n  const sum = lines.reduce((acc, line) => acc + line, 0);\n  return withTax && sum > 0 ? sum + tax(sum) : sum;\n}\n",
        "src/billing/discount.ts": "export function discount(amount: number, code?: string) {\n  if (!code) return amount;\n  switch (code) {\n    case 'TEN':\n      return amount * 0.9;\n    default:\n      return amount;\n  }\n}\n",
      },
      "feat: tax and discounts\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
      bob,
      at(),
    );
    const head = repo.commit({ "tests/billing/invoice.test.ts": null, "README.md": "# shop\n\nNow with discounts.\n" }, "chore: drop old test", bob, at());

    const result = await scoreDiff({ repoDir: repo.dir, base, head, config, llm: null, now: NOW_SECONDS * 1000, asOf: NOW_SECONDS, brief: { llm: false } });
    const json = JSON.stringify(result, null, 2)
      .replace(/\b[0-9a-f]{64}\b/g, "<sha256>")
      .replace(/\b[0-9a-f]{40}\b/g, "<sha>");
    return `${json.split(JSON.stringify(repo.dir).slice(1, -1)).join("<repo>")}\n`;
  } finally {
    repo.cleanup();
  }
}
