export declare const SUBDOMAIN_LABEL_MIN_LENGTH = 3;
export declare const SUBDOMAIN_LABEL_MAX_LENGTH = 40;
export declare const RESERVED_SUBDOMAINS: ReadonlySet<string>;
export declare function isValidSubdomainLabel(label: string): boolean;
export declare function isReservedSubdomain(label: string): boolean;
/** A tenant subdomain is a valid DNS label that no platform host has reserved. */
export declare function isValidTenantSubdomain(label: string): boolean;
export declare function resolveTenantFromHost(hostname: string, rootDomain?: string): string | null;
//# sourceMappingURL=tenant.d.ts.map