export const MARKER_ICONS: readonly string[] = [
    'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
];

// Build a pin-shaped marker icon embedding the given number, used to indicate
// the order of stations chosen for multi-select route building.
export function numberedMarkerIcon(n: number): google.maps.Icon {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">` +
        `<path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="#1a73e8" stroke="#ffffff" stroke-width="2"/>` +
        `<text x="16" y="22" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="15" font-weight="bold">${n}</text>` +
        `</svg>`;
    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(32, 40),
        anchor: new google.maps.Point(16, 40),
    };
}
