# weft — Taste

Best-effort stylistic preferences for builders. Deviate with justification when a concrete reason calls for it; note deviations in the handoff. The reviewer does not enforce taste.

For non-negotiable technical rules (no `class`, named exports only, snake_case, etc.) see [`constraints.md`](./constraints.md). For visual tokens (colors, type, spacing) see [`design.md`](./design.md). For the architectural shape and rationale see [`docs/architecture.md`](../docs/architecture.md).

## Comments

- Only where intent is non-obvious. Don't restate what the code says.
- Limit em dashes in comments and user-facing strings; prefer commas, colons, or separate sentences.

## Commits

- Conventional commits: `feat(scope): summary`, `fix(scope): summary`, `refactor(scope): summary`, `docs(scope): summary`, `test(scope): summary`, `chore(scope): summary`.
- Imperative summary, ≤ 72 chars. Body wraps at 72.
- One commit per logical unit; bundle related changes in a single PR.

## TypeScript style

- Prefer narrowing through discriminated unions over `typeof` checks.
- Prefer `ReadonlyArray<T>` and `readonly` on input types.
- Prefer adding a CSS token in `canvas.css` (or `index.css`) over hard-coding a value at the call site.
- Prefer fewer files of the right size over many tiny files; a `.ts` file under ~20 lines often belongs inline somewhere.

## Visual decisions

- Match the cream-paper subway palette in `design.md`. Don't introduce new hues; extend an existing kind family.
- Animations are reserved for state change (active pulse, emit flash). Decoration animations are off the table.

## When in doubt

- Pick the simpler of two reasonable patterns.
- Write the test first when the behavior is contractual; write the test after when the behavior is exploratory.
- If a refactor is implied but not asked for, leave a TODO and ship the requested change first.
