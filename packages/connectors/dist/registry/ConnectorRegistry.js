export class ConnectorRegistry {
    byKind = new Map();
    register(registration) {
        if (this.byKind.has(registration.kind)) {
            throw new Error(`duplicate connector kind: ${registration.kind}`);
        }
        this.byKind.set(registration.kind, registration);
    }
    normalizeWebhook(kind, event, ctx) {
        const registration = this.byKind.get(kind);
        if (!registration?.createForWebhook) {
            return { facts: [], containers: [] };
        }
        return registration.createForWebhook(ctx).normalizeWebhook(event);
    }
    createPullConnector(kind, deps) {
        const registration = this.byKind.get(kind);
        if (!registration?.createForPull) {
            return null;
        }
        return registration.createForPull(deps);
    }
    listPullKinds() {
        return [...this.byKind.entries()]
            .filter(([, registration]) => registration.createForPull !== undefined)
            .map(([kind]) => kind);
    }
}
//# sourceMappingURL=ConnectorRegistry.js.map