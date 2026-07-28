/** Build a task→model map; tasks left unmapped fall through to the backend's default model. */
export function tieredTaskModels(smallModel, largeModel) {
    const map = {
        labeling: smallModel,
        'noise-filter': smallModel,
        classification: smallModel,
        extraction: smallModel,
    };
    if (largeModel !== undefined) {
        map.synthesis = largeModel;
        map.query = largeModel;
    }
    return map;
}
/** Wraps a backend and substitutes the task-configured model for untagged `generate`/`stream` calls; everything else delegates unchanged. */
export class RoutingInferenceBackend {
    base;
    taskModels;
    constructor(base, taskModels) {
        this.base = base;
        this.taskModels = taskModels;
        if (base.getAttestationReport) {
            this.getAttestationReport = () => base.getAttestationReport();
        }
        if (base.generateStructured) {
            this.generateStructured = (prompt, options) => base.generateStructured(prompt, this.routeStructured(options));
        }
    }
    embed(text, options) {
        return this.base.embed(text, options);
    }
    generate(prompt, options) {
        return this.base.generate(prompt, this.route(options));
    }
    stream(prompt, options) {
        return this.base.stream(prompt, this.route(options));
    }
    getAttestationReport;
    generateStructured;
    close() {
        return this.base.close();
    }
    route(options) {
        if (options?.model !== undefined || options?.task === undefined)
            return options;
        const model = this.taskModels[options.task];
        return model === undefined ? options : { ...options, model };
    }
    routeStructured(options) {
        const routed = this.route(options);
        return routed === undefined ? options : { ...options, ...routed };
    }
}
//# sourceMappingURL=model-router.js.map