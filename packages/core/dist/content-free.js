// SPDX-License-Identifier: Apache-2.0
const FORBIDDEN_KEY_SUBSTRINGS = [
    'message',
    'body',
    'content',
    'text',
    'title',
    'summary',
    'description',
    'query',
    'prompt',
    'email',
    'stack',
    'secret',
    'token',
    'password',
    'plaintext',
    'snippet',
    'excerpt',
];
const EXACT_FORBIDDEN_KEYS = new Set(['name']);
const MAX_VALUE_LENGTH = 256;
function matchesForbidden(normalizedKey) {
    return FORBIDDEN_KEY_SUBSTRINGS.some((substring) => normalizedKey.includes(substring));
}
function isShortPrimitive(value) {
    if (value === null || value === undefined)
        return true;
    if (typeof value === 'number' || typeof value === 'boolean')
        return true;
    return typeof value === 'string' && value.length <= MAX_VALUE_LENGTH;
}
export function checkContentFree(event, properties) {
    for (const [key, value] of Object.entries(properties)) {
        const normalized = key.toLowerCase();
        if (EXACT_FORBIDDEN_KEYS.has(normalized) || matchesForbidden(normalized)) {
            return `field "${key}" on "${event}" is content-bearing`;
        }
        if (!isShortPrimitive(value)) {
            return `field "${key}" on "${event}" is not a short primitive`;
        }
    }
    return null;
}
export function checkDistinctId(distinctId) {
    if (distinctId.length > MAX_VALUE_LENGTH)
        return 'distinctId exceeds the max length';
    if (distinctId.includes('@'))
        return 'distinctId looks like an email, not an id';
    return null;
}
export class ContentFreeViolationError extends Error {
}
export function assertContentFree(event, properties) {
    const violation = checkContentFree(event, properties);
    if (violation)
        throw new ContentFreeViolationError(violation);
}
//# sourceMappingURL=content-free.js.map