export interface GitHubAppCredentials {
    appId: string;
    privateKey: string;
}
export interface InstallationToken {
    token: string;
    expiresAt: string;
}
export declare function mintInstallationToken(credentials: GitHubAppCredentials, installationId: string): Promise<InstallationToken>;
//# sourceMappingURL=installation-auth.d.ts.map