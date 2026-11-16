# Instructions for coding agents

Read these before you change code in this repository, and follow them in every change:

- [`CONTRIBUTING.md`](CONTRIBUTING.md): layout and dependency direction, rules (tests first,
  rebuild `action/dist` when `src/` changes, Conventional Commits), the **TSDoc comment standard**
  for every function you add or edit, and the **naming standard** (whole words, no single-letter
  names, rename only what your change touches).
- [`docs/maintaining.md`](docs/maintaining.md): how changes are merged and released, and which
  areas (`src/action/`, `src/policy/`, `.github/workflows/`) are read line by line.

Checks before you commit: `npm run check` (typecheck, `npm test` and `npm run test:slow`), and
`npm run build:action` when `src/` changes. These work on Windows too.
