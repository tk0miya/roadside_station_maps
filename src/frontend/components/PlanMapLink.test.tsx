/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { PlanMapLink } from './PlanMapLink';

describe('PlanMapLink', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders nothing visible', () => {
        const { container } = render(<PlanMapLink map={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('adds a link to the plan map control', () => {
        setupGoogleMapsMock();
        const mockMap = createMockMap();

        render(<PlanMapLink map={mockMap} />);

        expect(mockMap.controls[7].push).toHaveBeenCalledTimes(1);
        const [linkElement] = mockMap.controls[7].getArray() as HTMLAnchorElement[];
        expect(linkElement.className).toBe('plan-map-link');
        expect(linkElement.href).toContain('plan.html');
        expect(linkElement.innerText).toBe('計画マップ');
    });

    it('removes the control on unmount', () => {
        setupGoogleMapsMock();
        const mockMap = createMockMap();

        const { unmount } = render(<PlanMapLink map={mockMap} />);
        expect(mockMap.controls[7].getArray()).toHaveLength(1);

        unmount();

        expect(mockMap.controls[7].getArray()).toHaveLength(0);
    });
});
