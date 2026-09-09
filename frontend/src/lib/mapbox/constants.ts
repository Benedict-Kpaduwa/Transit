export const MAP_CONSTANTS = {
  // One camera easing profile for every programmatic move, so the same
  // gesture always feels the same (§ familiarity). `speed: 4` read as a
  // hard snap; 1.2 / curve 1.42 matches Mapbox's own comfortable default.
  CAMERA: {
    SPEED: 1.2,
    CURVE: 1.42,
  },
  FLY_TO: {
    ZOOM: 14,
    SPEED: 1.2,
    CURVE: 1.42,
    DURATION: 1600,
  },
  SEARCH: {
    DEBOUNCE_MS: 400,
    DEFAULT_LIMIT: 5,
    DEFAULT_COUNTRY: "CA",
    DEFAULT_PROXIMITY: [-114.0708, 51.0447] as [number, number], // Calgary, AB
  },
  // Calgary downtown center
  CENTER: [-114.0708, 51.0447] as [number, number],
  DEFAULT_ZOOM: 11,
  DEFAULT_PITCH: 52,
} as const;
