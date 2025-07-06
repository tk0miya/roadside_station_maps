import { Storage } from './types';

export class LocalStorage implements Storage {
    getItem(key: string): string | null {
        return localStorage.getItem(key);
    }

    setItem(key: string, value: string): void {
        localStorage.setItem(key, value);
    }

    removeItem(key: string): void {
        localStorage.removeItem(key);
    }

    listItems(): string[] {
        const items: string[] = [];
        Object.keys(localStorage).forEach((key) => {
            // Check if the key looks like a station ID (numeric)
            if (/^\d+$/.test(key)) {
                items.push(key);
            }
        });
        return items;
    }

}