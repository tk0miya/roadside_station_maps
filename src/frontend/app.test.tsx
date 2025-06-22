/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

// Mock React DOM
const mockRoot: Root = { render: vi.fn(), unmount: vi.fn() };

vi.mock('react-dom/client', () => ({
    createRoot: vi.fn(() => mockRoot),
}));

// Mock RoadStationMap component
vi.mock('./components/RoadStationMap', () => ({
    RoadStationMap: () => null,
}));

describe('app.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset modules to ensure clean state
        vi.resetModules();
        // Clear document body
        document.body.innerHTML = '';
    });

    it('should render RoadStationMap when container exists', async () => {
        // Set up DOM with container element
        document.body.innerHTML = '<div id="map-canvas"></div>';
        const container = document.getElementById('map-canvas');

        // Import and execute app.tsx
        await import('./app');

        // Verify createRoot was called with container
        expect(createRoot).toHaveBeenCalledWith(container);
        expect(mockRoot.render).toHaveBeenCalledTimes(1);
    });

    it('should not render when container does not exist', async () => {
        // Leave DOM empty (no map-canvas element)
        document.body.innerHTML = '';

        // Import and execute app.tsx
        await import('./app');

        // Verify createRoot was not called
        expect(createRoot).not.toHaveBeenCalled();
        expect(mockRoot.render).not.toHaveBeenCalled();
    });
});