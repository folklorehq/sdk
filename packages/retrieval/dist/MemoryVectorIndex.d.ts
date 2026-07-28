export interface VectorEntry {
    factId: string;
    vector: number[];
}
export interface VectorSearchHit {
    factId: string;
    score: number;
}
export declare class MemoryVectorIndex {
    private readonly entries;
    insert(factId: string, vector: number[]): void;
    search(query: number[], limit: number): VectorSearchHit[];
    toJSON(): VectorEntry[];
    static fromJSON(entries: VectorEntry[]): MemoryVectorIndex;
}
export declare function loadVectorIndex(path: string): MemoryVectorIndex;
export declare function saveVectorIndex(path: string, index: MemoryVectorIndex): void;
//# sourceMappingURL=MemoryVectorIndex.d.ts.map