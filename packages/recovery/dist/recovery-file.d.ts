import type { RecoveryMaterial } from './keygen.js';
export interface RecoveryFileContext {
    orgName?: string;
    generatedAt?: Date;
}
export declare function buildRecoveryFileContents(material: RecoveryMaterial, context?: RecoveryFileContext): string;
//# sourceMappingURL=recovery-file.d.ts.map