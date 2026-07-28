// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { stringLeafPaths } from '../src/zod-introspect.js';

describe('zod string-leaf introspector is fail-closed and container-aware', () => {
  it('surfaces a string hidden in a record value (the z.record leak vector)', () => {
    const schema = z.object({ id: z.string(), meta: z.record(z.string()) });
    expect(stringLeafPaths(schema)).toContain('meta{}');
  });

  it('surfaces strings in tuples, sets, maps, unions, intersections, lazy, and pipelines', () => {
    const lazy: z.ZodType<unknown> = z.lazy(() => z.object({ note: z.string() }));
    const schema = z.object({
      tup: z.tuple([z.number(), z.string()]),
      set: z.set(z.string()),
      map: z.map(z.string(), z.string()),
      uni: z.union([z.number(), z.string()]),
      inter: z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })),
      lazy,
      piped: z.string().pipe(z.string()),
    });
    const paths = stringLeafPaths(schema);
    expect(paths).toContain('tup[1]');
    expect(paths).toContain('set{}');
    expect(paths).toContain('map{}');
    expect(paths).toContain('uni');
    expect(paths).toContain('inter.a');
    expect(paths).toContain('lazy.note');
    expect(paths).toContain('piped');
  });

  it('surfaces a wildcard (z.any / z.unknown) as a distinct reviewable leaf', () => {
    expect(stringLeafPaths(z.object({ blob: z.any() }))).toEqual(['blob<any>']);
    expect(stringLeafPaths(z.object({ blob: z.unknown() }))).toEqual(['blob<any>']);
  });

  it('does NOT surface enums, literals, numbers, or dates as string leaves', () => {
    const schema = z.object({
      kind: z.enum(['a', 'b']),
      lit: z.literal('x'),
      n: z.number(),
      when: z.date(),
    });
    expect(stringLeafPaths(schema)).toEqual([]);
  });

  it('THROWS on an unhandled zod type rather than shipping it green (fail-closed)', () => {
    const unhandled = { _def: { typeName: 'ZodSomethingNew' } };
    expect(() => stringLeafPaths(unhandled)).toThrow(/unhandled ZodType "ZodSomethingNew"/);
  });
});
