// @types/google.maps declares an ambient global namespace, not an ES module,
// so `google.maps.X` can't be `import type`-ed directly. These aliases give
// call sites a normal importable name instead of the absolute reference.
export type GoogleMap = google.maps.Map;
export type GoogleInfoWindow = google.maps.InfoWindow;
export type Marker = google.maps.Marker;
export type LatLng = google.maps.LatLng;
export type MapMouseEvent = google.maps.MapMouseEvent;
export type Icon = google.maps.Icon;
export type Feature = google.maps.Data.Feature;
export type FeatureOptions = google.maps.Data.FeatureOptions;
export type DataMouseEvent = google.maps.Data.MouseEvent;
export type DataPoint = google.maps.Data.Point;
export type StyleOptions = google.maps.Data.StyleOptions;
