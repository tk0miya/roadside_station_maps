
import { Storage } from './types';
import type { ParsedQuery } from 'query-string';

export class QueryStorage implements Storage {
    mode: string = 'shared';
    private storage: Map<string, string> = new Map();
    queries: ParsedQuery<string> = {};

    constructor(queries: ParsedQuery<string> = {}) {
        this.queries = queries;
    }

    getItem(key: string): string | null {
        return this.storage.get(key) || null;
    }

    setItem(key: string, value: string): void {
        this.storage.set(key, value);
    }

    removeItem(key: string): void {
        this.storage.delete(key);
    }

    listItems(): string[] {
        return Array.from(this.storage.keys());
    }

    clearItems(): void {
        this.storage.clear();
    }
}
