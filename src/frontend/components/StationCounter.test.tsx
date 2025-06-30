/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StationCounter } from './StationCounter';
import { 
    createMockStations, 
    createMockStyleManager, 
    createMockMap, 
    setupGoogleMapsMock 
} from '../../test-utils/test-utils';

describe('StationCounter', () => {
    it('should render without errors when map is provided', () => {
        setupGoogleMapsMock();
        
        const mockStyleManager = createMockStyleManager({
            0: 96,
            1: 2,
            2: 1,
            3: 0,
            4: 1
        });

        const mockStations = createMockStations(100);
        const mockMap = createMockMap();

        const { container } = render(
            <StationCounter styleManager={mockStyleManager} stations={mockStations} styleVersion={0} map={mockMap} />
        );

        expect(container.firstChild).toBeNull(); // Component renders null
        expect(mockStyleManager.countByStyle).toHaveBeenCalledWith(100);
        expect(mockMap.controls[3].push).toHaveBeenCalledTimes(1);
    });

    it('should not render when map is null', () => {
        const mockStyleManager = createMockStyleManager({});
        const mockStations = createMockStations(100);

        const { container } = render(
            <StationCounter styleManager={mockStyleManager} stations={mockStations} styleVersion={0} map={null} />
        );

        expect(container.firstChild).toBeNull();
        expect(mockStyleManager.countByStyle).not.toHaveBeenCalled();
    });

    it('should return null when stations is null', () => {
        const mockStyleManager = createMockStyleManager({});

        const { container } = render(
            <StationCounter styleManager={mockStyleManager} stations={null} styleVersion={0} map={null} />
        );

        expect(container.firstChild).toBeNull();
        expect(mockStyleManager.countByStyle).not.toHaveBeenCalled();
    });

    it('should re-render when styleVersion changes', () => {
        setupGoogleMapsMock();
        
        const mockStyleManager = createMockStyleManager({ 0: 96, 1: 2, 2: 1, 3: 0, 4: 1 });
        const mockStations = createMockStations(100);
        const mockMap = createMockMap();

        const { rerender } = render(
            <StationCounter styleManager={mockStyleManager} stations={mockStations} styleVersion={0} map={mockMap} />
        );

        expect(mockStyleManager.countByStyle).toHaveBeenCalledTimes(1);

        // styleVersionを変更して再レンダリング
        rerender(
            <StationCounter styleManager={mockStyleManager} stations={mockStations} styleVersion={1} map={mockMap} />
        );

        expect(mockStyleManager.countByStyle).toHaveBeenCalledTimes(2);
    });
});