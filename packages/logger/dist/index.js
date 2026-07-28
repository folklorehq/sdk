import pino from 'pino';
/** Pino-backed adapter for the `Logger` port. */
export class PinoLogger {
    pino;
    constructor(options = {}) {
        const { level = 'info', pretty = false, name, bindings } = options;
        const opts = {
            level,
            ...(name ? { name } : {}),
            ...(pretty
                ? {
                    transport: {
                        target: 'pino-pretty',
                        options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
                    },
                }
                : {}),
        };
        const instance = pino(opts);
        this.pino = bindings ? instance.child(bindings) : instance;
    }
    static fromInstance(instance) {
        const logger = Object.create(PinoLogger.prototype);
        logger.pino = instance;
        return logger;
    }
    trace(message, context) {
        this.pino.trace(context ?? {}, message);
    }
    debug(message, context) {
        this.pino.debug(context ?? {}, message);
    }
    info(message, context) {
        this.pino.info(context ?? {}, message);
    }
    warn(message, context) {
        this.pino.warn(context ?? {}, message);
    }
    error(message, context) {
        this.pino.error(context ?? {}, message);
    }
    fatal(message, context) {
        this.pino.fatal(context ?? {}, message);
    }
    child(bindings) {
        return PinoLogger.fromInstance(this.pino.child(bindings));
    }
}
//# sourceMappingURL=index.js.map