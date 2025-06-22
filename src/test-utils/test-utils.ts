// Create mock Google Maps instance with controls
export const createMockMap = () => {
    const topLeftControls: HTMLElement[] = [];
    const topCenterControls: HTMLElement[] = [];

    const controls = {
        [1]: topLeftControls,  // TOP_LEFT
        [2]: topCenterControls, // TOP_CENTER
    };

    return {
        controls,
    } as unknown as google.maps.Map;
};
