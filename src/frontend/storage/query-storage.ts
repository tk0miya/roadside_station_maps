
import { Storage } from './types';

interface Queries {
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
}

export class QueryStorage implements Storage {
    mode: string = 'shared';
    c1: Set<string> = new Set();
    c2: Set<string> = new Set();
    c3: Set<string> = new Set();
    c4: Set<string> = new Set();
    queries: Queries = {};

    constructor(queries?: Queries) {
        if (queries) {
            this.queries = queries;
        }
    }

    getItem(key: string): string | null {
        // Work with stationId directly
        if (this.c1.has(key)) {
            return "1";
        }
        if (this.c2.has(key)) {
            return "2";
        }
        if (this.c3.has(key)) {
            return "3";
        }
        if (this.c4.has(key)) {
            return "4";
        }
        return null;
    }

    setItem(key: string, value: string): void {
        // Remove from all sets first
        this.removeItem(key);

        // Add to appropriate set
        if (value === "1") this.c1.add(key);
        else if (value === "2") this.c2.add(key);
        else if (value === "3") this.c3.add(key);
        else if (value === "4") this.c4.add(key);
    }

    removeItem(key: string): void {
        this.c1.delete(key);
        this.c2.delete(key);
        this.c3.delete(key);
        this.c4.delete(key);
    }

    listItems(): string[] {
        return [...this.c1, ...this.c2, ...this.c3, ...this.c4];
    }

    clearItems(): void {
        this.c1.clear();
        this.c2.clear();
        this.c3.clear();
        this.c4.clear();
    }
}
