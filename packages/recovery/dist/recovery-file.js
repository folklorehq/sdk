function numberedWords(words) {
    return words.map((word, i) => `${String(i + 1).padStart(2, ' ')}. ${word}`).join('\n');
}
export function buildRecoveryFileContents(material, context = {}) {
    const when = (context.generatedAt ?? new Date()).toISOString();
    const org = context.orgName ? ` for ${context.orgName}` : '';
    return [
        `Folklore master-key recovery phrase${org}`,
        `Generated: ${when}`,
        '',
        'THIS IS THE ONLY COPY. Folklore never sees it and CANNOT recover it for you.',
        'If you lose these words, your data becomes permanently unrecoverable.',
        'Store this file offline, backed up, and access-controlled — like a root secret.',
        '',
        '24-word recovery phrase:',
        numberedWords(material.words),
        '',
        `Recovery public key (shared with Folklore, not secret): ${material.publicKeyHex}`,
        `Fingerprint (verify this matches the console): ${material.fingerprint}`,
        '',
        'To recover: follow docs/security/master-key-recovery.md. The phrase above derives',
        'the X25519 private key that decrypts your sealed recovery blob.',
        '',
    ].join('\n');
}
//# sourceMappingURL=recovery-file.js.map