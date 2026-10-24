export const TARGETS: string[];
export const RESERVED_IDS: Set<string>;
export function listDocFiles(root: string): string[];
export function findReservedNodeIds(markdown: string): { line: number; id: string }[];
export function checkFile(file: string): string[];
export function checkAll(root: string): string[];
