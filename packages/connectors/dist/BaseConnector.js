import { ExternalServiceError, RateLimitError } from '@folklore/errors';
/** Shared connector machinery: injected logger + `call()`, which maps transport failures onto typed `@folklore/errors` so ingestion workers can apply retry/backoff uniformly. */
export class BaseConnector {
    logger;
    constructor(context) {
        this.logger = context.logger;
    }
    async call(operation, fn) {
        try {
            return await fn();
        }
        catch (err) {
            throw this.mapError(operation, err);
        }
    }
    mapError(operation, err) {
        const status = err?.status;
        const options = { cause: err, component: this.kind, context: { operation } };
        if (status === 429 || status === 403) {
            return new RateLimitError(`${this.kind}: rate limited during ${operation}`, options);
        }
        return new ExternalServiceError(`${this.kind}: ${operation} failed`, options);
    }
}
//# sourceMappingURL=BaseConnector.js.map