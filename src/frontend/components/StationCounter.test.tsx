/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StationCounter } from './StationCounter';
import { MemoryStorage } from '../storage';
import {
    createMockStations,
    createMockMap,
    setupGoogleMapsMock,
} from '../../test-utils/test-utils';

const getCounts = (element: HTMLElement): number[] =>
    Array.from(element.querySelectorAll('.station-counter-style span')).map((span) =>
        Number(span.textContent ?? '0')
    );

describe('StationCounter', () => {
    it('renders style counts into the map controls', async () => {
        setupGoogleMapsMock();

        const storage = new MemoryStorage([
            ['001', '1'],
            ['002', '1'],
            ['003', '2'],
            ['004', '4'],
        ]);
        const mockStations = createMockStations(100);
        const mockMap = createMockMap();

        render(
            <StationCounter storage={storage} stations={mockStations} styleVersion={0} map={mockMap} />
        );

        expect(mockMap.controls[7].push).toHaveBeenCalledTimes(1);
        const [counterElement] = mockMap.controls[7].getArray() as HTMLElement[];
        expect(counterElement.className).toBe('station-counter');

        // 100 stations - 4 assigned -> 96 unassigned (style 0); style 1 has 2; style 2 has 1; style 4 has 1
        await waitFor(() => {
            expect(getCounts(counterElement)).toEqual([96, 2, 1, 0, 1]);
        });
    });

    it('does not register a control when map is null', () => {
        const storage = new MemoryStorage();
        const mockStations = createMockStations(100);

        const { container } = render(
            <StationCounter storage={storage} stations={mockStations} styleVersion={0} map={null} />
        );

        expect(container.firstChild).toBeNull();
    });

    it('registers the control but renders no counts when stations is null', () => {
        setupGoogleMapsMock();
        const storage = new MemoryStorage();
        const mockMap = createMockMap();

        render(
            <StationCounter storage={storage} stations={null} styleVersion={0} map={mockMap} />
        );

        const [counterElement] = mockMap.controls[7].getArray() as HTMLElement[];
        expect(counterElement.className).toBe('station-counter');
        expect(counterElement.querySelectorAll('.station-counter-style')).toHaveLength(0);
    });

    it('updates rendered counts when styleVersion changes', async () => {
        setupGoogleMapsMock();

        const storage = new MemoryStorage([['001', '1']]);
        const mockStations = createMockStations(100);
        const mockMap = createMockMap();

        const { rerender } = render(
            <StationCounter storage={storage} stations={mockStations} styleVersion={0} map={mockMap} />
        );

        const [counterElement] = mockMap.controls[7].getArray() as HTMLElement[];
        await waitFor(() => {
            expect(getCounts(counterElement)).toEqual([99, 1, 0, 0, 0]);
        });

        // Mutate storage and bump styleVersion; counts should reflect the new entry.
        storage.setItem('002', '2');
        rerender(
            <StationCounter storage={storage} stations={mockStations} styleVersion={1} map={mockMap} />
        );

        await waitFor(() => {
            expect(getCounts(counterElement)).toEqual([98, 1, 1, 0, 0]);
        });
    });
});
