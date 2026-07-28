const noop = () => { };
export const noopLogger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child() {
        return noopLogger;
    },
};
//# sourceMappingURL=noop-logger.js.map