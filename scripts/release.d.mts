export function bumpVersion(rootDir: string, newVersion: string, releaseDate: string): string[];
export function pinPlugin(rootDir: string, version: string): string[];
export function pinDogfood(rootDir: string, version: string, commit: string): string[];
export function releaseNotes(rootDir: string, version: string): string;
