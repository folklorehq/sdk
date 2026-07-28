// Terminal zod types that CANNOT carry a free string — safe to stop at with no leaf.
const NO_STRING_LEAF = new Set([
    'ZodNumber',
    'ZodBigInt',
    'ZodBoolean',
    'ZodDate',
    'ZodEnum',
    'ZodNativeEnum',
    'ZodLiteral',
    'ZodNull',
    'ZodUndefined',
    'ZodVoid',
    'ZodNever',
    'ZodNaN',
    'ZodFunction',
]);
function defOf(schema) {
    const def = schema._def;
    return def ?? null;
}
function shapeOf(schema) {
    const shape = schema.shape;
    return shape ?? null;
}
function unionBranches(def) {
    const options = def.options;
    if (Array.isArray(options))
        return options;
    if (options instanceof Map)
        return [...options.values()];
    return [];
}
/** Every dot-path in a zod schema whose leaf is a free `z.string()` (or a wildcard). Fail-closed. */
export function stringLeafPaths(schema) {
    const out = new Set();
    collect(schema, '', out);
    return [...out].sort();
}
function collect(schema, path, out) {
    const def = defOf(schema);
    if (!def)
        return;
    const typeName = def.typeName ?? 'unknown';
    if (NO_STRING_LEAF.has(typeName))
        return;
    const handler = HANDLERS[typeName];
    if (!handler) {
        // Fail-closed: an unhandled node might carry content invisibly (e.g. z.record(z.string())).
        // Break the build until it is classified rather than silently ship it green.
        throw new Error(`zod-introspect: unhandled ZodType "${typeName}" at "${path || '<root>'}" — ` +
            'classify it (content-free vs content-bearing) and extend the introspector (leak-guard).');
    }
    handler(schema, def, path, out);
}
const HANDLERS = {
    ZodString: (_s, _d, path, out) => out.add(path),
    // A wildcard could hold anything — surface it as a distinct leaf so the frozen set forces review.
    ZodAny: (_s, _d, path, out) => out.add(`${path}<any>`),
    ZodUnknown: (_s, _d, path, out) => out.add(`${path}<any>`),
    ZodOptional: (_s, def, path, out) => collect(def.innerType, path, out),
    ZodNullable: (_s, def, path, out) => collect(def.innerType, path, out),
    ZodDefault: (_s, def, path, out) => collect(def.innerType, path, out),
    ZodReadonly: (_s, def, path, out) => collect(def.innerType, path, out),
    ZodCatch: (_s, def, path, out) => collect(def.innerType, path, out),
    ZodBranded: (_s, def, path, out) => collect(def.type ?? def.innerType, path, out),
    ZodPromise: (_s, def, path, out) => collect(def.type, path, out),
    ZodEffects: (_s, def, path, out) => collect(def.schema, path, out),
    ZodLazy: (_s, def, path, out) => collect(def.getter?.(), path, out),
    ZodArray: (_s, def, path, out) => collect(def.type, `${path}[]`, out),
    ZodSet: (_s, def, path, out) => collect(def.valueType, `${path}{}`, out),
    ZodRecord: (_s, def, path, out) => {
        collect(def.keyType, `${path}<rkey>`, out);
        collect(def.valueType, `${path}{}`, out);
    },
    ZodMap: (_s, def, path, out) => {
        collect(def.keyType, `${path}<mkey>`, out);
        collect(def.valueType, `${path}{}`, out);
    },
    ZodTuple: (_s, def, path, out) => (def.items ?? []).forEach((item, i) => collect(item, `${path}[${i}]`, out)),
    ZodObject: (schema, _d, path, out) => collectObject(schema, path, out),
    ZodUnion: (_s, def, path, out) => unionBranches(def).forEach((b) => collect(b, path, out)),
    ZodDiscriminatedUnion: (_s, def, path, out) => unionBranches(def).forEach((b) => collect(b, path, out)),
    ZodIntersection: (_s, def, path, out) => {
        collect(def.left, path, out);
        collect(def.right, path, out);
    },
    ZodPipeline: (_s, def, path, out) => {
        collect(def.in, path, out);
        collect(def.out, path, out);
    },
};
function collectObject(schema, path, out) {
    const shape = shapeOf(schema);
    if (!shape)
        return;
    for (const [key, child] of Object.entries(shape)) {
        collect(child, path ? `${path}.${key}` : key, out);
    }
}
//# sourceMappingURL=zod-introspect.js.map