import { registerBuiltinConnectors } from './builtin.js';
import { ConnectorRegistry } from './connector-registry.js';
const defaultRegistry = new ConnectorRegistry();
registerBuiltinConnectors(defaultRegistry);
export function getDefaultConnectorRegistry() {
    return defaultRegistry;
}
export function normalizeWebhookEvent(source, eventType, payload, ctx) {
    return defaultRegistry.normalizeWebhook(source, { type: eventType, payload }, ctx);
}
export function createPullConnector(kind, deps) {
    return defaultRegistry.createPullConnector(kind, deps);
}
export function listPullConnectorKinds() {
    return defaultRegistry.listPullKinds();
}
export { ConnectorRegistry } from './connector-registry.js';
//# sourceMappingURL=index.js.map