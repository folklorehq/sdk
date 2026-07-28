import type { NormalizedRecords } from '@folklore/connectors';
import { type FolkloreInitConfig } from './init.js';
export interface CorpusFile {
    records: NormalizedRecords;
    themes?: Array<{
        name: string;
        factSourceIds: string[];
    }>;
}
export interface IngestResult {
    factCount: number;
    containerCount: number;
    themeCount: number;
    indexPath: string;
}
export declare function corpusThemes(corpus: CorpusFile): Array<{
    name: string;
    factSourceIds: string[];
}>;
export declare function loadCorpusFile(fixturePath: string): CorpusFile;
export declare function runIngest(options: {
    cwd: string;
    fixturePath: string;
    config?: FolkloreInitConfig;
}): Promise<IngestResult>;
//# sourceMappingURL=ingest.d.ts.map