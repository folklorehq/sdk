import { ConnectorRegistry } from '@folklore/connectors';
export interface ConnectorTestInput {
    kind: string;
    eventType: string;
    fixturePath: string;
    registry?: ConnectorRegistry;
}
export declare function runConnectorTest(input: ConnectorTestInput): unknown;
export declare function runConnectorTestWithDefaultNormalizer(input: Omit<ConnectorTestInput, 'registry'>): import("@folklore/connectors").NormalizedRecords;
//# sourceMappingURL=connector-test.d.ts.map