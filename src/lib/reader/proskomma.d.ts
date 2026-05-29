declare module 'proskomma-core' {
    export class Proskomma {
        selectors: Array<{ name: string; type: string; regex: string }>;
        gqlQuerySync(query: string, callback?: (r: unknown) => void): any;
        gqlQuery(query: string, callback?: (r: unknown) => void): Promise<any>;
        validateSelectors(): void;
        loadSuccinctDocSet(succinctOb: unknown): any;
        docSets: unknown[];
    }
}
