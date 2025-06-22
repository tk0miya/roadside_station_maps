
function encode(array: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(array)));
}


function decode(buf: string | undefined): Uint8Array {
    if (buf) {
        try {
            return new Uint8Array(atob(buf).split("").map((c) => {
                return c.charCodeAt(0);
            }));
        } catch (e) {
            console.log(e);
        }
    }
    return new Uint8Array();
}


interface Queries {
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
}

export class QueryStorage {
    mode: string;
    c1: Uint8Array;
    c2: Uint8Array;
    c3: Uint8Array;
    c4: Uint8Array;

    constructor() {
        this.mode = 'shared';
        this.c1 = new Uint8Array();
        this.c2 = new Uint8Array();
        this.c3 = new Uint8Array();
        this.c4 = new Uint8Array();
    }

    loadFromLocalStorage(): void {
        const styles: Record<string, number[]> = {"1": [], "2": [], "3": [], "4": []};
        Object.keys(localStorage).forEach((stationId) => {
            const styleId = localStorage.getItem(stationId);
            if (styleId && styles[styleId]) {
                styles[styleId].push(parseInt(stationId));
            }
        });

        Object.keys(styles).forEach((styleId) => {
            const stationIds = styles[styleId];
            if (stationIds.length > 0) {
                const maxStyleId = Math.max.apply(null, stationIds);
                const size = Math.ceil(maxStyleId / 8);
                const buf = new Uint8Array(size);

                stationIds.forEach((stationId) => {
                    const idx = Math.floor(stationId / 8);
                    const shift = stationId % 8;
                    buf[idx] |= 1 << shift;
                });
                (this as any)["c" + styleId] = encode(buf);
            }
        });
    }

    loadFromQueries(queries: Queries): void {
        this.c1 = decode(queries.c1);
        this.c2 = decode(queries.c2);
        this.c3 = decode(queries.c3);
        this.c4 = decode(queries.c4);
    }

    getItem(key: string): string | null {
        const id = parseInt(key);
        const idx = Math.floor(id / 8);
        const shift = id % 8;

        if (this.c1[idx] & 1 << shift) {
            return "1";
        }
        if (this.c2[idx] & 1 << shift) {
            return "2";
        }
        if (this.c3[idx] & 1 << shift) {
            return "3";
        }
        if (this.c4[idx] & 1 << shift) {
            return "4";
        }
        return null;
    }

    setItem(_key: string, _value: string): void {
        // skip
    }

    removeItem(_key: string): void {
        // skip
    }
}


