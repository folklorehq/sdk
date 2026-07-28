// SPDX-License-Identifier: Apache-2.0
export function groupBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        const group = map.get(key) ?? [];
        group.push(item);
        map.set(key, group);
    }
    return map;
}
export function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
}
//# sourceMappingURL=collection.js.map