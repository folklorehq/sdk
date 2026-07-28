export interface RecoveryMaterial {
    mnemonic: string;
    words: string[];
    publicKeyHex: string;
    privateKeyHex: string;
    fingerprint: string;
}
export interface RecoverySubmission {
    publicKeyHex: string;
    fingerprint: string;
}
export declare function recoveryFingerprint(publicKeyHex: string): string;
export declare function deriveRecoveryMaterial(mnemonic: string): RecoveryMaterial;
export declare function generateRecoveryMaterial(): RecoveryMaterial;
export declare function toRecoverySubmission(material: RecoveryMaterial): RecoverySubmission;
export declare function isRecoveryPublicKeyHex(value: string): boolean;
//# sourceMappingURL=keygen.d.ts.map