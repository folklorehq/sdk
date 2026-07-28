import { type AttestationManifest } from './schema.js';
export interface VerifyAttestationOptions {
    attestationPath: string;
    expectedCommit?: string;
    eifPath?: string;
}
export interface VerifyAttestationResult {
    manifest: AttestationManifest;
    warnings: string[];
}
export declare function loadAttestationManifest(path: string): AttestationManifest;
export declare function verifyAttestationManifest(options: VerifyAttestationOptions): VerifyAttestationResult;
//# sourceMappingURL=verify.d.ts.map