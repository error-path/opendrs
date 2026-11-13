# Contributing

## Setup

Node 22 or newer.

```sh
npm ci
npm run check        # typecheck + tests
```

## Layout

Dependencies point inward: `domain` ← `git`, `graph`, `llm` ← `signals` ← `model`, `policy` ←
`engine` ← `cli`, `mcp`, `action`. Shared types live in `src/domain/types.ts`; changing one is an
interface change, so update `docs/specs/` in the same PR. Adapters (CLI, MCP, Action) hold no
scoring logic.

## Rules

- No new runtime dependencies without discussion. GitHub and LLM calls use plain `fetch`.
- TypeScript strict, ESM, imports with `.js` suffixes. Small files with one job.
- Tests first. Most tests build real temporary git repositories with `tests/helpers/repo.ts`.
- Every signal reports its provenance and evidence. A value that cannot be computed is `unknown`,
  never zero.
- If you change anything under `src/` that the Action uses, run `npm run build:action` and commit
  `action/dist`. CI fails when the bundle is out of date.
- Conventional Commit messages (`feat(cli): ...`, `fix(action): ...`).
- Docs: plain, specific sentences. Say what a thing does and what it does not.

## Code comments

Function comments use [TSDoc](https://tsdoc.org/). Every new function gets one. When you edit an
existing function's comment, move it to this format. Don't reformat comments you aren't changing.

```ts
/**
 * Calculates the discount for a loyalty customer.
 *
 * @param amount - The order subtotal, before taxes.
 * @param tier - The customer's verified tier.
 * @returns The value to subtract from the total.
 * @throws {@link OpendrsError} If amount is negative.
 */
```

- Start with one short sentence that says what the function does.
- Add `@param` for each parameter, `@returns` unless it returns nothing, and `@throws` if callers
  need to handle an error.
- Don't repeat types in the tags: the signature already has them.
- Use Markdown, not HTML.
- One-line helpers and constants can use a single `/** ... */` line.
- Inside a function, use `//`, and only to explain why.

## Naming

opendrs is read by people seeing the code for the first time, so a name should say what the value
is without reading the code around it.

- Use whole words that name the thing: `scoreResult`, not `r`; `baseRef`, not `base`, when the value
  is a git ref such as `origin/main`; `baseSha` when it is a commit hash.
- No single-letter names, except `i`/`j` for a loop index and the conventional `_` for an unused
  value. Name callback parameters too: `(rule) => rule.id`, not `(r) => r.id`.
- Booleans read as a yes/no question: `isEmpty`, `hasBlockedPath`, `shouldComment`.
- Functions start with a verb: `loadConfig`, `renderBrief`, `isIgnored`.
- Rename only what your change touches: a variable you add, or one in a line you are already
  changing. Don't rename across files you aren't otherwise changing; the code gets more readable
  one PR at a time.

## Reporting a security problem

Do not open a public issue for a way around the Action's approval rails. Use GitHub's private
vulnerability reporting on this repository.
