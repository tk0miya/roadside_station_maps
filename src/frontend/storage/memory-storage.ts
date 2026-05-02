import { Storage } from './types';

/**
 * In-memory Storage. Used as the backing store for the shared-view mode
 * (populated from the shares API) and as a lightweight test fake.
 */
export class MemoryStorage implements Storage {
    private storage: Map<string, string> = new Map();

    constructor(entries: Iterable<[string, string]> = []) {
        for (const [key, value] of entries) {
            this.storage.set(key, value);
        }
    }

    getItem(key: string): string | null {
        return this.storage.get(key) ?? null;
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

    async flush(): Promise<void> {}
}
