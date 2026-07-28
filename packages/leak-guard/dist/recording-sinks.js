export class RecordingLogger {
    records;
    bindings;
    constructor(records = [], bindings = {}) {
        this.records = records;
        this.bindings = bindings;
    }
    trace(message, context) {
        this.record('trace', message, context);
    }
    debug(message, context) {
        this.record('debug', message, context);
    }
    info(message, context) {
        this.record('info', message, context);
    }
    warn(message, context) {
        this.record('warn', message, context);
    }
    error(message, context) {
        this.record('error', message, context);
    }
    fatal(message, context) {
        this.record('fatal', message, context);
    }
    child(bindings) {
        return new RecordingLogger(this.records, { ...this.bindings, ...bindings });
    }
    record(level, message, context) {
        this.records.push({ level, message, context, bindings: this.bindings });
    }
}
export class RecordingCache {
    writes = [];
    store = new Map();
    async get(key) {
        return this.store.get(key) ?? null;
    }
    async set(key, value, ttlSeconds) {
        this.writes.push({ key, value, ttlSeconds });
        this.store.set(key, value);
    }
    async del(...keys) {
        let removed = 0;
        for (const key of keys)
            if (this.store.delete(key))
                removed += 1;
        return removed;
    }
    async close() { }
}
export class RecordingTelemetryClient {
    calls = [];
    track(event, distinctId, properties) {
        this.calls.push({ kind: 'track', event, distinctId, properties });
    }
    captureError(report, distinctId) {
        this.calls.push({ kind: 'captureError', report, distinctId });
    }
    async flush() { }
}
/** Duck-typed stand-in for the AWS S3 client that captures every PutObject body. */
export class RecordingS3Client {
    puts = [];
    async send(command) {
        const input = command.input;
        if (input?.Bucket !== undefined && input.Key !== undefined && 'Body' in input) {
            this.puts.push({
                bucket: input.Bucket,
                key: input.Key,
                body: input.Body,
                contentType: input.ContentType,
                metadata: input.Metadata,
            });
        }
        return {};
    }
    async close() { }
}
//# sourceMappingURL=recording-sinks.js.map