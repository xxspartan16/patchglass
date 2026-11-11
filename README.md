# Patchglass

**A local workbench for JSON configuration changes, with a way back.**

Patchglass turns two JSON documents into an inspectable migration: a deterministic structural diff, a guarded JSON Patch, and a verified rollback. It is a personal developer tool built around the ordinary problem of changing a configuration without overlooking an important value.

**Status:** working v0.1. All examples are synthetic. This project was developed with AI assistance; its implementation, limitations, and tests are included for review. It is not a record of commercial deployments or prior employment work.

## Why this project

Automation and local assistant setups accumulate configuration changes: timeouts, new routines, renamed keys, arrays of devices. Text diffs can hide useful changes behind formatting differences. A structural view makes those edits easier to review, and an explicit rollback gives the change a clear reverse path.

The engineering focus is deterministic tree traversal, immutable state transformations, safe failure behavior, and explaining the boundaries of a small implementation.

## Try the complete flow

1. Choose **Smart home**, **API settings**, or **Workshop inventory**. These are synthetic fixtures.
2. Edit the **Before** and **After** documents or import JSON files.
3. Select **Compare documents**. Inspect additions, removals, and replacements; search by pointer or value.
4. Click a change to open **Replay** at that step. Replay never modifies the working copy.
5. Select **Apply to working copy**, then **Roll back**. The original JSON values are restored.
6. Download a forward patch, rollback patch, or the resulting document.

An imported patch is applied to the current **Before** document, then its result is normalized into a new structural migration plan. The imported operation order is therefore not preserved in the generated plan.

## Run locally

Use Node.js 22.12 or later; Node.js 24 is recommended.

```bash
npm ci
npm run dev
```

Verify and build:

```bash
npm run check
npm run preview
```

`check` runs TypeScript, domain tests, and the production build. Vercel can use the included `vercel.json` without credentials or environment variables. The app is static and has no runtime backend or paid API dependency. Vite uses relative asset paths so the build also works in a subdirectory.

## Implemented behavior

| Capability          | Behavior                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Structural diff     | Recursive object comparison with sorted keys; whitespace and object ordering do not count as changes.                             |
| Arrays              | Compare by position; remove excess tails from the end and append new tails in order.                                              |
| JSON Pointer        | Correct `~0` and `~1` escaping; canonical array indices and pointer validation.                                                   |
| Patch operations    | `add`, `remove`, `replace`, and `test`; mutations use a private clone.                                                            |
| Source precondition | An optional root `test` rejects stale source data. Enabled by default in exports and always used for UI apply/rollback.           |
| Rollback            | Generate a reverse structural patch and verify restoration of the source values.                                                  |
| Replay              | Reconstruct the document after N operations without changing the working copy.                                                    |
| Review hints        | Flag removals and type changes; these are not schema compatibility verdicts.                                                      |
| Import/export       | JSON documents, forward/rollback patches, and migrated/restored documents.                                                        |
| Privacy             | No fetch calls, analytics, accounts, document transmission, or local storage. Fonts are bundled. Refreshing clears the workspace. |

### Engine example

```ts
import { createMigration, guardedPatch, applyPatch } from './src/domain/patch';

const before = { volume: 65, routines: ['morning'] };
const after = { volume: 35, routines: ['morning', 'evening'] };
const migration = createMigration(before, after);
const changed = applyPatch(before, guardedPatch(migration));
const restored = applyPatch(changed, guardedPatch(migration, 'rollback'));
// restored has the same JSON values as before.
```

## Tests that matter

The 47 domain tests cover malformed input, Unicode byte limits, finite numbers, depth/node limits, reserved keys, circular values, pointer escape order, empty property names, inherited properties, array bounds, missing versus null, object-order invariance, deterministic output, root replacement, atomic failure, stale sources, immutable references, replay, and rollback.

One property-oriented test generates **250 deterministic pairs of nested JSON documents** and checks both `apply(before, diff(before, after)) = after` and the reverse transformation. This is a regression check, not a proof covering all possible inputs.

## Deliberate tradeoffs and limitations

- **A documented JSON Patch subset.** `move` and `copy` are not implemented. Root removal is rejected; use replacement with `null` where appropriate. Unknown operation members are ignored as in the RFC, while required fields are validated.
- **Positional arrays.** Reordering can produce several replacements. There is no identity inference, LCS alignment, or minimum-edit guarantee. Predictability was preferable to guessing whether two objects represent the same entity.
- **Values, not original text.** Formatting, comments, number spelling, and object key order are not preserved. Duplicate object keys follow `JSON.parse` semantics (last value wins). Numbers use JavaScript precision; do not use this version for arbitrary-precision identifiers.
- **Conservative key restrictions.** `__proto__`, `prototype`, and `constructor` are rejected in documents and pointers. This is stricter than RFC 6901/6902 and avoids prototype-related ambiguity in JavaScript consumers.
- **Resource limits.** Documents are at most 200,000 UTF-8 bytes; patch imports and generated exports are at most 1,000,000 bytes. Documents contain at most 20,000 values and 40 nesting levels. Generated plans allow 999 mutations, reserving one slot for a guard. Patches accept at most 1,000 operations.
- **No persistence or collaboration.** The working copy lives in memory. This is a review tool, not a deployment service or team approval system.
- **No full schema analysis.** A removal can be intentional; a same-type replacement can still break a consumer. Hints are not a compatibility verdict.

## Repository map

```text
src/domain/patch.ts       Validation, pointers, diff, apply, rollback, replay
src/domain/patch.test.ts  Behavioral and generated round-trip tests
src/domain/examples.ts    Three synthetic configurations
src/components/          Editors and safe text-based code rendering
src/App.tsx              User actions and workspace state
docs/architecture.md     Design, boundaries, complexity, and roadmap
public/examples/         Portable source/target fixture files
```

## Next meaningful work

1. Add an opt-in keyed-array strategy with ambiguity detection.
2. Move comparisons to a Web Worker with cancellation.
3. Add RFC `move`/`copy` operations and inverse tests.
4. Add a CLI using the same engine for CI checks.
5. Add schema checking as a separate layer.

## Standards and acknowledgments

- [RFC 6901 — JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)
- [RFC 6902 — JSON Patch](https://www.rfc-editor.org/rfc/rfc6902)
- React, Vite, TypeScript, Vitest, Lucide, and Fontsource provide UI/build tooling. The patch engine is implemented in this repository.

MIT. See [LICENSE](LICENSE). Dependencies and bundled fonts retain their own licenses; Fontsource packages include upstream font licenses.
