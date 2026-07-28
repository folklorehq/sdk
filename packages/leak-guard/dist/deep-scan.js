const MIN_ENCODED_RUN = 12;
const PREVIEW_RADIUS = 24;
const BASE64_RUN = /[A-Za-z0-9+/=]{12,}/g;
const BASE64URL_RUN = /[A-Za-z0-9\-_]{12,}/g;
const HEX_RUN = /[0-9a-fA-F]{12,}/g;
function toNeedles(marker) {
    if (typeof marker === 'string')
        return [marker];
    if (Array.isArray(marker))
        return [...marker];
    const sentinel = marker;
    return [sentinel.value, ...sentinel.fragments];
}
/** Recursively hunt for any sentinel needle in a value, defeating common encodings + Error objects. */
export function findSentinel(value, marker) {
    const out = [];
    walk(value, '$', toNeedles(marker), out, new Set());
    return out;
}
export function containsSentinel(value, marker) {
    return findSentinel(value, marker).length > 0;
}
function walk(value, path, needles, out, seen) {
    if (value === null || value === undefined)
        return;
    if (typeof value === 'string') {
        scanString(value, path, needles, out);
        return;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return;
    if (typeof value === 'symbol') {
        scanString(value.toString(), path, needles, out);
        return;
    }
    if (value instanceof Uint8Array) {
        scanBytes(value, path, needles, out);
        return;
    }
    if (typeof value === 'object') {
        if (seen.has(value))
            return;
        seen.add(value);
        if (value instanceof Error) {
            walkError(value, path, needles, out, seen);
            return;
        }
        walkContainer(value, path, needles, out, seen);
    }
}
// Object.entries misses the non-enumerable message/stack/cause — the exact fields a leaked Error carries.
function walkError(err, path, needles, out, seen) {
    scanString(err.message, `${path}.message`, needles, out);
    if (typeof err.stack === 'string')
        scanString(err.stack, `${path}.stack`, needles, out);
    const cause = err.cause;
    if (cause !== undefined)
        walk(cause, `${path}.cause`, needles, out, seen);
    const own = err;
    for (const key of Object.getOwnPropertyNames(err)) {
        if (key === 'message' || key === 'stack')
            continue;
        walk(own[key], `${path}.${key}`, needles, out, seen);
    }
}
function walkContainer(value, path, needles, out, seen) {
    if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`, needles, out, seen));
        return;
    }
    if (value instanceof Map) {
        for (const [k, v] of value) {
            walk(k, `${path}<key>`, needles, out, seen);
            walk(v, `${path}.${String(k)}`, needles, out, seen);
        }
        return;
    }
    if (value instanceof Set) {
        let i = 0;
        for (const item of value)
            walk(item, `${path}{${i++}}`, needles, out, seen);
        return;
    }
    for (const key of Object.getOwnPropertyNames(value)) {
        scanString(key, `${path}<key>`, needles, out);
        walk(value[key], `${path}.${key}`, needles, out, seen);
    }
}
function scanBytes(bytes, path, needles, out) {
    const buf = Buffer.from(bytes);
    scanString(buf.toString('utf8'), `${path}(utf8)`, needles, out);
    scanString(buf.toString('base64'), `${path}(base64)`, needles, out);
    scanString(buf.toString('hex'), `${path}(hex)`, needles, out);
}
function scanString(s, path, needles, out) {
    for (const needle of needles) {
        scanDirect(s, path, needle, out);
        scanEncodedForms(s, path, needle, out);
        scanDecodedRuns(s, path, needle, out);
    }
}
function scanDirect(s, path, needle, out) {
    const at = s.indexOf(needle);
    if (at >= 0) {
        out.push({ path, needle, encoding: 'raw', preview: preview(s, at, needle.length) });
        return;
    }
    const ci = s.toLowerCase().indexOf(needle.toLowerCase());
    if (ci >= 0) {
        out.push({ path, needle, encoding: 'raw-ci', preview: preview(s, ci, needle.length) });
    }
}
function scanEncodedForms(s, path, needle, out) {
    const buf = Buffer.from(needle, 'utf8');
    const forms = [
        ['base64', buf.toString('base64').replace(/=+$/, '')],
        ['base64url', buf.toString('base64url')],
        ['hex', buf.toString('hex')],
        ['url', encodeURIComponent(needle)],
    ];
    for (const [encoding, form] of forms) {
        if (form !== needle && s.includes(form)) {
            out.push({ path, needle, encoding, preview: form.slice(0, PREVIEW_RADIUS) });
        }
    }
}
function scanDecodedRuns(s, path, needle, out) {
    const hit = (encoding) => out.push({ path, needle, encoding, preview: needle });
    for (const d of decodeRuns(s, BASE64_RUN, (run) => Buffer.from(run, 'base64').toString('utf8'))) {
        if (d.includes(needle))
            hit('base64-decoded');
    }
    for (const d of decodeRuns(s, BASE64URL_RUN, (run) => Buffer.from(run, 'base64url').toString('utf8'))) {
        if (d.includes(needle))
            hit('base64-decoded');
    }
    for (const d of decodeRuns(s, HEX_RUN, (run) => run.length % 2 === 0 ? Buffer.from(run, 'hex').toString('utf8') : '')) {
        if (d.includes(needle))
            hit('hex-decoded');
    }
    if (s.includes('%')) {
        const decoded = safeDecode(() => decodeURIComponent(s));
        if (decoded && decoded !== s && decoded.includes(needle))
            hit('url-decoded');
    }
}
function decodeRuns(s, pattern, decode) {
    const decoded = [];
    for (const run of s.match(pattern) ?? []) {
        if (run.length < MIN_ENCODED_RUN)
            continue;
        const value = safeDecode(() => decode(run));
        if (value)
            decoded.push(value);
    }
    return decoded;
}
function safeDecode(fn) {
    try {
        return fn();
    }
    catch {
        return null;
    }
}
function preview(s, at, len) {
    return s.slice(Math.max(0, at - PREVIEW_RADIUS), at + len + PREVIEW_RADIUS);
}
//# sourceMappingURL=deep-scan.js.map