/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ClipboardButton } from './ClipboardButton';
import { createMockMap } from '../../test-utils/test-utils';
import { StyleManager } from '../style-manager';
import { QueryStorage } from '../storage/query-storage';

// Mock modules
vi.mock('clipboard', () => ({
    default: vi.fn(function () {
        return {
            on: vi.fn(),
            destroy: vi.fn(),
        };
    }),
}));


// Mock global objects
Object.defineProperty(global, 'google', {
    value: {
        maps: {
            ControlPosition: {
                TOP_LEFT: 1,
                TOP_CENTER: 2,
            },
        },
    },
    writable: true,
});

describe('ClipboardButton', () => {
    let originalLocation: Location;

    beforeEach(() => {
        vi.clearAllMocks();
        originalLocation = window.location;

        // Mock location
        Object.defineProperty(window, 'location', {
            value: {
                ...originalLocation,
                href: 'https://example.com/test',
                search: '',
            },
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
        });
    });

    it('should return null (no visual rendering)', () => {
        const storage = new QueryStorage();
        const styleManager = new StyleManager(storage);
        const { container } = render(<ClipboardButton map={null} styleManager={styleManager} />);
        expect(container.firstChild).toBeNull();
    });

    it('should add clipboard button to map controls when map and styleManager are provided', () => {
        const mockMap = createMockMap();
        const storage = new QueryStorage();
        const styleManager = new StyleManager(storage);
        
        render(<ClipboardButton map={mockMap} styleManager={styleManager} />);

        // Should add button to TOP_LEFT controls
        expect(mockMap.controls[1].push).toHaveBeenCalledTimes(1);
        
        // Check the element that was pushed
        const pushCall = (mockMap.controls[1].push as any).mock.calls[0];
        const buttonElement = pushCall[0] as HTMLElement;
        expect(buttonElement.className).toBe('clipboard');
        expect(buttonElement.innerText).toBe('シェア');
    });
});
