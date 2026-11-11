import { describe, expect, it } from 'vitest';
import {
  applyPatch,
  createMigration,
  decodePointer,
  diff,
  equal,
  escapeToken,
  guardedPatch,
  LIMITS,
  parseDocument,
  readPointer,
  replay,
  validateJson,
  validatePatch,
} from './patch';
import type { JsonValue } from './patch';
import { examples } from './examples';

describe('strict JSON boundaries', () => {
  it('parses every JSON root type', () => {
    for (const value of [null, false, 3, 'hello', [], {}])
      expect(parseDocument(JSON.stringify(value))).toEqual(value);
  });
  it('reports malformed JSON', () =>
    expect(() => parseDocument('{"value":')).toThrow('Invalid JSON'));
  it('bounds UTF-8 bytes rather than character count', () =>
    expect(() => parseDocument(JSON.stringify('é'.repeat(LIMITS.bytes / 2)))).toThrow('200 KB'));
  it('rejects nonfinite values including overflowing JSON exponents', () => {
    expect(() => parseDocument('1e999')).toThrow('finite');
    expect(() => validateJson(Number.NaN)).toThrow('finite');
  });
  it('rejects prototype-related keys at every depth', () => {
    for (const key of ['__proto__', 'constructor', 'prototype'])
      expect(() => parseDocument(`{"safe":{"${key}":1}}`)).toThrow('Reserved key');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('bounds nested documents before recursive work', () => {
    let value: JsonValue = 1;
    for (let i = 0; i <= LIMITS.depth; i++) value = [value];
    expect(() => validateJson(value)).toThrow('nesting');
  });
  it('bounds node counts independently of byte size', () =>
    expect(() => validateJson(Array(LIMITS.nodes).fill(0))).toThrow('values'));
  it('rejects cycles, sparse arrays, and exotic prototypes', () => {
    const circular: unknown[] = [];
    circular.push(circular);
    expect(() => validateJson(circular)).toThrow('Circular');
    expect(() => validateJson(new Array(2))).toThrow('Sparse');
    expect(() => validateJson(new Date())).toThrow('plain');
  });
});

describe('JSON Pointer semantics', () => {
  it('escapes slash and tilde in the correct order', () => {
    expect(escapeToken('a~/b')).toBe('a~0~1b');
    expect(decodePointer('/a~0~1b')).toEqual(['a~/b']);
    expect(decodePointer('/~01')).toEqual(['~1']);
  });
  it('distinguishes the root pointer from an empty key', () => {
    const doc = { '': 4 };
    expect(readPointer(doc, '')).toEqual(doc);
    expect(readPointer(doc, '/')).toBe(4);
  });
  it('rejects malformed pointers and escapes', () => {
    for (const path of ['a', '#/a', '/~', '/a~2']) expect(() => decodePointer(path)).toThrow();
  });
  it('does not traverse inherited properties', () =>
    expect(() => readPointer({}, '/toString')).toThrow('does not exist'));
  it('rejects prototype pollution pointers', () => {
    for (const path of ['/__proto__/polluted', '/constructor/prototype/x', '/prototype'])
      expect(() => applyPatch({}, [{ op: 'add', path, value: true }])).toThrow('Reserved');
  });
  it('requires canonical array indices', () => {
    for (const path of ['/01', '/-1', '/1.0', '/+0', '/-'])
      expect(() => readPointer([1, 2], path)).toThrow('canonical');
  });
  it('permits numeric and hyphen object keys', () => {
    expect(readPointer({ '01': 3, '-': 4 }, '/01')).toBe(3);
    expect(readPointer({ '01': 3, '-': 4 }, '/-')).toBe(4);
  });
});

describe('deterministic structural differences', () => {
  it('ignores object key order and preserves type distinctions', () => {
    expect(diff({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    expect(equal(1, '1')).toBe(false);
    expect(equal(null, {})).toBe(false);
  });
  it('distinguishes missing values from explicit null', () => {
    expect(diff({}, { value: null })).toEqual([{ op: 'add', path: '/value', value: null }]);
    expect(diff({ value: null }, {})).toEqual([{ op: 'remove', path: '/value' }]);
  });
  it('sorts object keys for deterministic output', () =>
    expect(diff({ z: 1, c: 2 }, { b: 3, a: 4 })).toEqual([
      { op: 'remove', path: '/c' },
      { op: 'remove', path: '/z' },
      { op: 'add', path: '/a', value: 4 },
      { op: 'add', path: '/b', value: 3 },
    ]));
  it('compares arrays positionally rather than inferring moves', () =>
    expect(diff(['a', 'b'], ['b', 'a'])).toEqual([
      { op: 'replace', path: '/0', value: 'b' },
      { op: 'replace', path: '/1', value: 'a' },
    ]));
  it('removes array tails in reverse order', () =>
    expect(diff([0, 1, 2, 3], [0])).toEqual([
      { op: 'remove', path: '/3' },
      { op: 'remove', path: '/2' },
      { op: 'remove', path: '/1' },
    ]));
  it('adds array tails in forward order', () =>
    expect(diff([], [0, 1])).toEqual([
      { op: 'add', path: '/0', value: 0 },
      { op: 'add', path: '/1', value: 1 },
    ]));
  it('replaces types at the root', () => {
    expect(diff({ value: 1 }, null)).toEqual([{ op: 'replace', path: '', value: null }]);
    expect(diff(1, [1])).toEqual([{ op: 'replace', path: '', value: [1] }]);
  });
  it('does not mutate either source or expose source references', () => {
    const before = { value: { nested: 1 } };
    const after = { other: { nested: 2 } };
    const plan = createMigration(before, after);
    after.other.nested = 99;
    before.value.nested = 99;
    expect(plan.before).toEqual({ value: { nested: 1 } });
    expect(plan.after).toEqual({ other: { nested: 2 } });
  });
  it('limits generated operation count while reserving one guard', () => {
    const after = Object.fromEntries(
      Array.from({ length: LIMITS.operations }, (_, i) => [String(i), i]),
    );
    expect(() => diff({}, after)).toThrow('Too many changes');
  });
});

describe('atomic patch application', () => {
  it('adds, replaces, removes, and tests nested values', () => {
    expect(
      applyPatch({ a: [1, 2], b: true }, [
        { op: 'test', path: '/b', value: true },
        { op: 'add', path: '/a/1', value: 3 },
        { op: 'replace', path: '/a/0', value: 8 },
        { op: 'remove', path: '/b' },
      ]),
    ).toEqual({ a: [8, 3, 2] });
  });
  it('supports array append but not out-of-bounds insertion', () => {
    expect(applyPatch([1], [{ op: 'add', path: '/-', value: 2 }])).toEqual([1, 2]);
    expect(() => applyPatch([1], [{ op: 'add', path: '/2', value: 2 }])).toThrow('bounds');
  });
  it('add replaces an existing object member per RFC semantics', () =>
    expect(applyPatch({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }])).toEqual({ a: 2 }));
  it('supports root add/replace and explicitly rejects root remove', () => {
    expect(applyPatch({ a: 1 }, [{ op: 'add', path: '', value: 2 }])).toBe(2);
    expect(() => applyPatch({}, [{ op: 'remove', path: '' }])).toThrow('root');
  });
  it('requires existing parents and existing replace/remove targets', () => {
    for (const operation of [
      { op: 'add', path: '/missing/child', value: 1 },
      { op: 'replace', path: '/missing', value: 1 },
      { op: 'remove', path: '/missing' },
    ])
      expect(() => applyPatch({}, [operation])).toThrow('does not exist');
  });
  it('rejects traversal through scalar values', () =>
    expect(() => applyPatch({ a: null }, [{ op: 'add', path: '/a/b', value: 1 }])).toThrow(
      'not an object',
    ));
  it('keeps the source unchanged after a later operation fails', () => {
    const source = { values: [1, 2] };
    expect(() =>
      applyPatch(source, [
        { op: 'replace', path: '/values/0', value: 99 },
        { op: 'remove', path: '/values/5' },
      ]),
    ).toThrow('Operation 2');
    expect(source).toEqual({ values: [1, 2] });
  });
  it('validates patch shape, required values, and unsupported operations', () => {
    for (const invalid of [
      {},
      [null],
      [{ op: 'move', from: '/a', path: '/b' }],
      [{ op: 'replace', path: '/a' }],
      [{ op: 'remove', path: 1 }],
    ])
      expect(() => validatePatch(invalid)).toThrow();
  });
  it('rejects operation names that only coerce to supported strings', () => {
    for (const op of [['add'], { toString: () => 'add' }, null, 1])
      expect(() => validatePatch([{ op, path: '/a', value: 1 }])).toThrow('only add');
  });
  it('rejects patches larger than the operation budget', () =>
    expect(() =>
      validatePatch(Array(LIMITS.operations + 1).fill({ op: 'test', path: '', value: null })),
    ).toThrow('at most'));
  it('clones operation values to isolate outputs', () => {
    const value = { x: [1] };
    const result = applyPatch({}, [{ op: 'add', path: '/a', value }]);
    value.x.push(2);
    expect(result).toEqual({ a: { x: [1] } });
  });
  it('does not interpret strings as code or HTML', () => {
    const literal = '<script>throw new Error("bad")</script>';
    expect(applyPatch({}, [{ op: 'add', path: '/content', value: literal }])).toEqual({
      content: literal,
    });
  });
});

describe('guarded migration and replay', () => {
  it('rejects oversized intermediate states even when final documents fit', () => {
    const large = 'a'.repeat(120_000);
    expect(() => createMigration([null, large], [large])).toThrow('200 KB');
  });
  it('bounds cumulative patch bytes rather than only each operation', () => {
    const value = 'a'.repeat(150_000);
    expect(() =>
      validatePatch(Array.from({ length: 7 }, () => ({ op: 'test', path: '', value }))),
    ).toThrow('1 MB');
  });
  it.each(examples)('round trips the $title fixture', (example) => {
    const plan = createMigration(example.before, example.after);
    const result = applyPatch(example.before, guardedPatch(plan));
    expect(result).toEqual(example.after);
    expect(applyPatch(result, guardedPatch(plan, 'rollback'))).toEqual(example.before);
  });
  it('fails safely when a guarded source is stale', () => {
    const plan = createMigration({ value: 1 }, { value: 2 });
    expect(() => applyPatch({ value: 3 }, guardedPatch(plan))).toThrow('Precondition failed');
  });
  it('guard comparison ignores only object ordering, not array order', () => {
    const plan = createMigration({ a: 1, b: [1, 2] }, { a: 2, b: [1, 2] });
    expect(applyPatch({ b: [1, 2], a: 1 }, guardedPatch(plan))).toEqual(plan.after);
    expect(() => applyPatch({ b: [2, 1], a: 1 }, guardedPatch(plan))).toThrow('Precondition');
  });
  it('reconstructs intermediate states without modifying the plan', () => {
    const plan = createMigration({ a: 1, b: 2 }, { a: 3, b: 4 });
    expect(replay(plan, 0)).toEqual({ a: 1, b: 2 });
    expect(replay(plan, 1)).toEqual({ a: 3, b: 2 });
    expect(replay(plan, 2)).toEqual({ a: 3, b: 4 });
    expect(plan.before).toEqual({ a: 1, b: 2 });
    for (const step of [-1, 0.5, 3]) expect(() => replay(plan, step)).toThrow('outside');
  });
  it('flags removals and type changes without claiming schema compatibility', () => {
    const plan = createMigration({ a: 1, b: false }, { a: '1' });
    expect(plan.changes.map((change) => change.caution)).toEqual([
      'Value removed',
      'Type changes: number → string',
    ]);
  });
  it('round trips escaped keys and nested arrays', () => {
    const before = { 'a/b': [{ '~key': null }, false], '': 1 };
    const after = { 'a/b': [{ '~key': { '/': true } }], '': 2 };
    const plan = createMigration(before, after);
    expect(applyPatch(before, guardedPatch(plan))).toEqual(after);
    expect(applyPatch(after, guardedPatch(plan, 'rollback'))).toEqual(before);
  });
  it('satisfies apply/diff and rollback properties for 250 seeded document pairs', () => {
    let seed = 82634;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    function generate(depth = 0): JsonValue {
      const type = Math.floor(random() * (depth > 2 ? 4 : 6));
      if (type === 0) return null;
      if (type === 1) return random() > 0.5;
      if (type === 2) return Math.floor(random() * 100);
      if (type === 3) return `v${Math.floor(random() * 10)}`;
      if (type === 4)
        return Array.from({ length: Math.floor(random() * 4) }, () => generate(depth + 1));
      return Object.fromEntries(
        Array.from({ length: Math.floor(random() * 4) }, (_, index) => [
          `key~/${index}`,
          generate(depth + 1),
        ]),
      );
    }
    for (let i = 0; i < 250; i++) {
      const before = generate();
      const after = generate();
      const plan = createMigration(before, after);
      expect(applyPatch(before, plan.patch)).toEqual(after);
      expect(applyPatch(after, plan.inverse)).toEqual(before);
    }
  });
});
