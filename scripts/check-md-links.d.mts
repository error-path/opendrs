export const TARGETS: string[];
export function listDocFiles(root: string): string[];
export function slugify(heading: string): string;
export function headingSlugs(markdown: string): Set<string>;
export function findLinks(markdown: string): { line: number; url: string }[];
export function checkFile(file: string, slugCache: Map<string, Set<string> | null>): string[];
export function checkAll(root: string): string[];
