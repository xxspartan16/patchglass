/** A deliberately bounded JSON Patch implementation. No browser or UI dependencies. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Mutation =
  { op: 'add' | 'replace'; path: string; value: JsonValue } | { op: 'remove'; path: string };
export type Operation = Mutation | { op: 'test'; path: string; value: JsonValue };
export type Change = {
  operation: Mutation;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
  caution: string | null;
};
export type Migration = {
  before: JsonValue;
  after: JsonValue;
  patch: Mutation[];
  inverse: Mutation[];
  changes: Change[];
};

export const LIMITS = {
  bytes: 200_000,
  patchBytes: 1_000_000,
  depth: 40,
  nodes: 20_000,
  operations: 1_000,
} as const;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const jsonType = (value: JsonValue): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

export function validateJson(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  const active = new Set<object>();
  function visit(item: unknown, depth: number) {
    if (++nodes > LIMITS.nodes)
      throw new PatchError(`Document exceeds ${LIMITS.nodes.toLocaleString()} values.`);
    if (depth > LIMITS.depth)
      throw new PatchError(`Document nesting exceeds ${LIMITS.depth} levels.`);
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || item === null)
      throw new PatchError('Only finite JSON values are supported.');
    if (active.has(item)) throw new PatchError('Circular values are not JSON.');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      throw new PatchError('Only plain JSON objects are supported.');
    active.add(item);
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        if (!own(item, String(i))) throw new PatchError('Sparse arrays are not JSON.');
        visit(item[i], depth + 1);
      }
    } else {
      for (const [key, child] of Object.entries(item)) {
        if (forbidden.has(key)) throw new PatchError(`Reserved key “${key}” is not supported.`);
        visit(child, depth + 1);
      }
    }
    active.delete(item);
  }
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > LIMITS.bytes)
    throw new PatchError('Document exceeds the 200 KB limit.');
}

export function parseDocument(text: string): JsonValue {
  if (new TextEncoder().encode(text).length > LIMITS.bytes)
    throw new PatchError('Document exceeds the 200 KB limit.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new PatchError(
      `Invalid JSON: ${error instanceof Error ? error.message : 'Unable to parse document.'}`,
    );
  }
  validateJson(value);
  return value;
}

export function equal(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, i) => equal(item, right[i]));
  if (isObject(left) && isObject(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => own(right, key) && equal(left[key], right[key]))
    );
  }
  return false;
}

export const escapeToken = (token: string): string =>
  token.replace(/~/g, '~0').replace(/\//g, '~1');
export function decodePointer(path: string): string[] {
  if (path === '') return [];
  if (!path.startsWith('/'))
    throw new PatchError('A JSON Pointer must start with “/”, or be empty for the root.');
  const tokens = path
    .slice(1)
    .split('/')
    .map((token) => {
      if (/~(?:[^01]|$)/.test(token)) throw new PatchError(`Invalid escape in pointer “${path}”.`);
      return token.replace(/~1/g, '/').replace(/~0/g, '~');
    });
  if (tokens.length > LIMITS.depth) throw new PatchError('Pointer exceeds the nesting limit.');
  for (const token of tokens)
    if (forbidden.has(token))
      throw new PatchError(`Reserved pointer segment “${token}” is not supported.`);
  return tokens;
}

function arrayIndex(token: string, length: number, insertion = false): number {
  if (insertion && token === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(token))
    throw new PatchError(`“${token}” is not a canonical array index.`);
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index < 0 || index >= length + Number(insertion))
    throw new PatchError(`Array index ${token} is out of bounds.`);
  return index;
}

function getChild(parent: JsonValue, token: string): JsonValue {
  if (Array.isArray(parent)) return parent[arrayIndex(token, parent.length)];
  if (isObject(parent) && own(parent, token)) return parent[token];
  throw new PatchError(`Path segment “${token}” does not exist.`);
}

export function readPointer(document: JsonValue, path: string): JsonValue {
  return decodePointer(path).reduce<JsonValue>((value, token) => getChild(value, token), document);
}

export function validatePatch(input: unknown): Operation[] {
  if (!Array.isArray(input)) throw new PatchError('A patch must be an array of operations.');
  if (input.length > LIMITS.operations)
    throw new PatchError(`A patch may contain at most ${LIMITS.operations} operations.`);
  const operations: Operation[] = input.map((item: unknown, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new PatchError(`Operation ${index + 1} must be an object.`);
    const operation = item as Record<string, unknown>;
    if (
      typeof operation.op !== 'string' ||
      !['add', 'remove', 'replace', 'test'].includes(operation.op)
    )
      throw new PatchError(
        `Operation ${index + 1}: only add, remove, replace, and test are supported.`,
      );
    if (typeof operation.path !== 'string')
      throw new PatchError(`Operation ${index + 1} needs a string path.`);
    decodePointer(operation.path);
    if (operation.op === 'remove') {
      if (operation.path === '')
        throw new PatchError('Removing the document root is not supported. Use replace with null.');
      return { op: 'remove', path: operation.path };
    }
    if (!own(operation, 'value'))
      throw new PatchError(`Operation ${index + 1} needs a value (null is allowed).`);
    validateJson(operation.value);
    return {
      op: operation.op as 'add' | 'replace' | 'test',
      path: operation.path,
      value: structuredClone(operation.value),
    };
  });
  if (new TextEncoder().encode(JSON.stringify(operations, null, 2)).length > LIMITS.patchBytes - 1)
    throw new PatchError('Patch exceeds the 1 MB limit. Compare smaller documents.');
  return operations;
}

/** Mutates only the caller's private clone; returns replacement root when necessary. */
function applyOne(document: JsonValue, operation: Operation): JsonValue {
  const tokens = decodePointer(operation.path);
  if (operation.op === 'test') {
    if (!equal(readPointer(document, operation.path), operation.value))
      throw new PatchError(
        `Precondition failed at ${operation.path || '(root)'}. The source document has changed.`,
      );
    return document;
  }
  if (tokens.length === 0)
    return structuredClone((operation as Exclude<Mutation, { op: 'remove' }>).value);
  const token = tokens.pop()!;
  const parent = tokens.reduce<JsonValue>((value, key) => getChild(value, key), document);
  if (Array.isArray(parent)) {
    const index = arrayIndex(token, parent.length, operation.op === 'add');
    if (operation.op === 'add') parent.splice(index, 0, structuredClone(operation.value));
    else if (operation.op === 'remove') parent.splice(index, 1);
    else parent[index] = structuredClone(operation.value);
  } else if (isObject(parent)) {
    if (operation.op !== 'add' && !own(parent, token))
      throw new PatchError(`Target “${operation.path}” does not exist.`);
    if (operation.op === 'remove') delete parent[token];
    else parent[token] = structuredClone(operation.value);
  } else throw new PatchError(`Parent of “${operation.path}” is not an object or array.`);
  return document;
}

/** Atomic to the caller: failed operations never mutate the input document. */
export function applyPatch(document: JsonValue, input: unknown): JsonValue {
  validateJson(document);
  const operations = validatePatch(input);
  let result = structuredClone(document);
  for (let i = 0; i < operations.length; i++) {
    try {
      result = applyOne(result, operations[i]);
      validateJson(result);
    } catch (error) {
      throw new PatchError(
        `Operation ${i + 1}: ${error instanceof Error ? error.message : 'Patch failed.'}`,
      );
    }
  }
  return result;
}

export function diff(before: JsonValue, after: JsonValue): Mutation[] {
  validateJson(before);
  validateJson(after);
  const patch: Mutation[] = [];
  function emit(operation: Mutation) {
    if (patch.length >= LIMITS.operations - 1)
      throw new PatchError('Too many changes. Compare smaller documents (up to 999 changes).');
    patch.push(operation);
  }
  function walk(left: JsonValue, right: JsonValue, path: string) {
    if (equal(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      const common = Math.min(left.length, right.length);
      for (let i = 0; i < common; i++) walk(left[i], right[i], `${path}/${i}`);
      for (let i = left.length - 1; i >= right.length; i--)
        emit({ op: 'remove', path: `${path}/${i}` });
      for (let i = left.length; i < right.length; i++)
        emit({ op: 'add', path: `${path}/${i}`, value: structuredClone(right[i]) });
    } else if (isObject(left) && isObject(right)) {
      for (const key of Object.keys(left).sort())
        if (!own(right, key)) emit({ op: 'remove', path: `${path}/${escapeToken(key)}` });
      for (const key of Object.keys(right).sort()) {
        const childPath = `${path}/${escapeToken(key)}`;
        if (own(left, key)) walk(left[key], right[key], childPath);
        else emit({ op: 'add', path: childPath, value: structuredClone(right[key]) });
      }
    } else emit({ op: 'replace', path, value: structuredClone(right) });
  }
  walk(before, after, '');
  return patch;
}

export function createMigration(before: JsonValue, after: JsonValue): Migration {
  const patch = diff(before, after);
  const inverse = diff(after, before);
  let current = structuredClone(before);
  const changes: Change[] = patch.map((operation) => {
    const previous =
      operation.op === 'add' ? undefined : structuredClone(readPointer(current, operation.path));
    current = applyOne(current, operation);
    const next =
      operation.op === 'remove' ? undefined : structuredClone(readPointer(current, operation.path));
    const caution =
      operation.op === 'remove'
        ? 'Value removed'
        : previous !== undefined && next !== undefined && jsonType(previous) !== jsonType(next)
          ? `Type changes: ${jsonType(previous)} → ${jsonType(next)}`
          : null;
    return { operation, before: previous, after: next, caution };
  });
  if (!equal(current, after) || !equal(applyPatch(before, patch), after))
    throw new PatchError('Migration verification failed.');
  if (!equal(applyPatch(after, inverse), before))
    throw new PatchError('Rollback verification failed.');
  const migration = {
    before: structuredClone(before),
    after: structuredClone(after),
    patch,
    inverse,
    changes,
  };
  validatePatch(guardedPatch(migration));
  validatePatch(guardedPatch(migration, 'rollback'));
  return migration;
}

/** Whole-document guards reject stale sources; object key order is intentionally irrelevant. */
export function guardedPatch(
  migration: Migration,
  direction: 'forward' | 'rollback' = 'forward',
): Operation[] {
  return direction === 'forward'
    ? [
        { op: 'test', path: '', value: structuredClone(migration.before) },
        ...structuredClone(migration.patch),
      ]
    : [
        { op: 'test', path: '', value: structuredClone(migration.after) },
        ...structuredClone(migration.inverse),
      ];
}

export function replay(migration: Migration, step: number): JsonValue {
  if (!Number.isInteger(step) || step < 0 || step > migration.patch.length)
    throw new PatchError('Replay step is outside this migration.');
  return applyPatch(migration.before, migration.patch.slice(0, step));
}
