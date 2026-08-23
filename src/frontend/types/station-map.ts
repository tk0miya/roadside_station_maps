// Domain types for the roadside-station map. The modes themselves are in
// `docs/station-map.md`.

// The mode reads one list of picks either way: at most one station in normal
// mode, the route's stops in route mode.
export type MapMode = 'normal' | 'route';
