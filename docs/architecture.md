# Architecture and design notes

## Boundary first

The engine accepts JSON values and has no knowledge of React, files, the DOM, or downloads. `parseDocument` limits UTF-8 bytes before parsing and validates finite numbers, bounded nesting/node counts, plain objects, and restricted keys. Programmatic inputs pass the same checks.

Imported patches are size-limited by the UI, then validated operation by operation. A patch is data, never executable code. React renders text nodes; there is no HTML interpolation or `eval`.

## Tree comparison

`diff(before, after)` recursively compares values:

1. Equal values stop traversal. Object ordering is ignored; array ordering is significant.
2. Two objects remove absent keys in sorted order, then visit target keys in sorted order. New keys become `add` operations.
3. Two arrays compare their shared prefix by position. Excess source items are removed from the end to preserve indices; excess target items are appended in order.
4. Different scalars or types become `replace` operations, including at the root.

Sorting makes output deterministic. Positional arrays are explainable and testable; the cost is a noisy patch for reorderings or front insertions. Worst-case tree work includes deep equality at visited subtrees: O(n × depth), plus object-key sorting. This is not presented as a linear-time or minimum-edit algorithm.

## Atomic apply and preconditions

`applyPatch` validates the source and all operation structures, then clones the source. Operations modify only that clone. Missing targets, invalid array indices, failed tests, bad pointers, and resource-limit failures throw `PatchError`. A later failure never mutates the caller's original document.

The root `test` guard compares values, not raw strings. Property reordering passes; any changed value or array position fails. UI apply and rollback always use this guard. Exports enable it by default and allow deliberate omission.

The result is revalidated after each operation, bounding intermediate documents at the cost of O(operations × document size) validation. Current limits constrain this cost. A worker and incremental budgets would be preferable for much larger inputs.

## Rollback and replay

The inverse is `diff(after, before)`, not a mechanical reversal. This yields the same supported operation subset without hidden mutable state. `createMigration` verifies the forward result against the target and applies the inverse to verify restoration of original values.

Replay applies the first N mutations to a fresh source clone. It does not retain every full snapshot, avoiding O(steps × document size) retained memory. Rewinding does not re-execute external effects because the tool has none.

## UI state

- Editable texts are separate from the last valid compared migration.
- Any edit marks the plan stale and disables apply, rollback, and patch exports until successful comparison.
- The working copy is separate from both editors.
- Replay derives from migration and selected step; it never changes the working copy.
- Imported patches produce target values and a regenerated structural plan.
- Errors leave the previous valid plan available for inspection.

No persistence is intentional. Refreshing discards unsaved state, as disclosed in the interface.

## Verification

The engine has 47 tests, including 250 seeded generated document pairs in one property-oriented test. Invariants include round trips, bounds, ordering, scalar types, atomic failure, guards, and pointer correctness.

UI smoke checks should cover invalid editor input, compare, filtering, replay, apply/rollback, downloads, imports, and narrow layouts. TypeScript and the build are part of `npm run check`.

## Independent future slices

- **Keyed arrays:** user-selected identity keys, duplicate detection, and explicit positional fallback.
- **Worker execution:** request IDs, cancellation, and stale-result suppression around the pure engine.
- **CLI:** reuse the engine with different exit codes for equal, changed, and invalid input.
- **Schema layer:** separate compatibility checking from migration generation.

These are roadmap items, not current features.
