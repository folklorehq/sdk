export interface FolkloreInitConfig {
    version: 1;
    orgId: string;
    databaseUrl: string;
    redisUrl: string;
    indexPath?: string;
    userId?: string;
}
export declare function initProject(cwd: string, dirName?: string): {
    configPath: string;
    created: boolean;
};
export declare function readProjectConfig(cwd: string, dirName?: string): FolkloreInitConfig;
//# sourceMappingURL=init.d.ts.map