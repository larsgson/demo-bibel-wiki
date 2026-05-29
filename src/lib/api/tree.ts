import { apiFetch } from './client';
import type { AllTreesResponse, TreeBranch } from './types';

export type TreeName =
    | 'scripture'
    | 'bible'
    | 'source'
    | 'kind'
    | 'term'
    | 'topic'
    | 'entity'
    | 'methodology'
    | 'pericope'
    | 'lexicon'
    | 'morphology'
    | 'transcript'
    | 'aquifer';

export function getAllTrees(lang = 'en'): Promise<AllTreesResponse> {
    return apiFetch<AllTreesResponse>(`/api/trees?lang=${lang}`);
}

export function getTreeRoot(tree: TreeName, lang = 'en'): Promise<TreeBranch> {
    return apiFetch<TreeBranch>(`/api/tree/${tree}?lang=${lang}`);
}

export function getTreeNode(tree: TreeName, path: string[], lang = 'en'): Promise<TreeBranch> {
    const segs = path.map((s) => encodeURIComponent(s)).join('/');
    return apiFetch<TreeBranch>(`/api/tree/${tree}/${segs}?lang=${lang}`);
}
