export const MAP_CONSTANTS = {
  FLY_TO: {
    ZOOM: 14,
    SPEED: 4,
    DURATION: 1000,
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
