// SPDX-License-Identifier: Apache-2.0
/** Strips markdown code fences some models wrap around JSON, then parses. */
export function parseJsonFence(raw) {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    return JSON.parse(cleaned);
}
/** The first JSON object substring (first `{` to last `}`) in model output, or `{}`. */
export function extractJsonObject(raw) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    return start === -1 || end <= start ? '{}' : raw.slice(start, end + 1);
}
//# sourceMappingURL=json.js.map