/**
 * Polyline geometry for drawing trip legs on the map.
 *
 * The trip planner gives us a boarding stop and an alighting stop plus a
 * *candidate* shape for the leg — a Google polyline, a full GTFS route shape,
 * or one of the CTrain track polylines. Those candidates routinely contain the
 * whole line, both travel directions, or a loop, so naively slicing "between
 * the two nearest vertices" produces the giant zig-zag detours you'd see
 * otherwise.
 *
 * The functions here fix that by:
 *  - measuring distance in metres (longitude scaled by cos(latitude)), not raw
 *    degrees, so "nearest" is actually nearest;
 *  - snapping a stop to the nearest point *on a segment*, not the nearest
 *    vertex;
 *  - returning enough info (how far each stop was from the shape, the sliced
 *    length) for the caller to reject a candidate that clearly isn't the right
 *    piece of geometry and fall back to a clean straight line.
 */

export type LngLat = [number, number];

const EARTH_R = 6_371_000;
const DEG = Math.PI / 180;

/** Great-circle distance in metres between two [lng, lat] points. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const lat1 = a[1] * DEG;
  const lat2 = b[1] * DEG;
  const dLat = lat2 - lat1;
  const dLng = (b[0] - a[0]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total length of a polyline in metres. */
export function polylineLengthMeters(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += distanceMeters(coords[i - 1], coords[i]);
  }
  return total;
}

export interface Projection {
  /** Nearest point on the polyline to the query point. */
  point: LngLat;
  /** Index of the vertex that starts the segment the projection landed on. */
  segIndex: number;
  /** Position along that segment, 0..1. */
  t: number;
  /** Distance from the query point to `point`, in metres. */
  distanceMeters: number;
  /** Arc length from the polyline start to `point`, in metres. */
  arcMeters: number;
}

/**
 * Project `p` onto `line`, returning the nearest point that actually lies on
 * the polyline (interpolated within a segment, not snapped to a vertex).
 */
export function projectToPolyline(line: LngLat[], p: LngLat): Projection {
  // Work in a local metric plane centred on the query point so segment maths
  // is plain Euclidean and distances come out in metres.
  const lat0 = p[1] * DEG;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(lat0);
  const X = (c: LngLat): [number, number] => [
    (c[0] - p[0]) * mPerDegLng,
    (c[1] - p[1]) * mPerDegLat,
  ];
  const unX = (x: number, y: number): LngLat => [
    p[0] + x / mPerDegLng,
    p[1] + y / mPerDegLat,
  ];

  let best: Projection = {
    point: line[0],
    segIndex: 0,
    t: 0,
    distanceMeters: Infinity,
    arcMeters: 0,
  };

  let arc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = X(line[i]);
    const b = X(line[i + 1]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const segLen = Math.hypot(abx, aby);
    let t = 0;
    if (segLen > 1e-9) {
      t = (-a[0] * abx - a[1] * aby) / (segLen * segLen);
      t = Math.max(0, Math.min(1, t));
    }
    const px = a[0] + t * abx;
    const py = a[1] + t * aby;
    const d = Math.hypot(px, py); // query point is the origin
    if (d < best.distanceMeters) {
      best = {
        point: unX(px, py),
        segIndex: i,
        t,
        distanceMeters: d,
        arcMeters: arc + t * segLen,
      };
    }
    arc += segLen;
  }
  return best;
}

export interface SlicedLeg {
  /** Sub-polyline from the `from` stop to the `to` stop, endpoints included. */
  coords: LngLat[];
  /** Length of `coords` in metres. */
  lengthMeters: number;
  /** How far the `from` stop was from the candidate shape, in metres. */
  fromOffsetMeters: number;
  /** How far the `to` stop was from the candidate shape, in metres. */
  toOffsetMeters: number;
}

/**
 * Slice `line` to the span between `from` and `to`, oriented from → to.
 *
 * Both stops are projected onto the line; the vertices strictly between the two
 * projections are kept, with the projected points pinned on as the new ends. If
 * `from` projects later along the line than `to`, the result is reversed so it
 * still runs from → to.
 */
export function slicePolylineBetween(
  line: LngLat[],
  from: LngLat,
  to: LngLat
): SlicedLeg {
  if (line.length < 2) {
    return {
      coords: [from, to],
      lengthMeters: distanceMeters(from, to),
      fromOffsetMeters: Infinity,
      toOffsetMeters: Infinity,
    };
  }

  const pf = projectToPolyline(line, from);
  const pt = projectToPolyline(line, to);

  let lo = pf;
  let hi = pt;
  let reversed = false;
  if (
    pf.segIndex > pt.segIndex ||
    (pf.segIndex === pt.segIndex && pf.t > pt.t)
  ) {
    lo = pt;
    hi = pf;
    reversed = true;
  }

  // Vertices strictly inside (lo, hi].
  const middle: LngLat[] = [];
  for (let i = lo.segIndex + 1; i <= hi.segIndex; i++) {
    middle.push(line[i]);
  }

  let coords: LngLat[] = [lo.point, ...middle, hi.point];
  if (reversed) coords.reverse();

  // De-dupe near-identical consecutive points the pinning can introduce.
  coords = coords.filter(
    (c, i) => i === 0 || distanceMeters(c, coords[i - 1]) > 0.5
  );
  if (coords.length < 2) coords = [from, to];

  return {
    coords,
    lengthMeters: polylineLengthMeters(coords),
    fromOffsetMeters: pf.distanceMeters,
    toOffsetMeters: pt.distanceMeters,
  };
}

export interface ResolveOptions {
  /** Max distance a stop may sit from the shape for it to count (metres). */
  maxOffsetMeters?: number;
  /** Sliced length may not exceed max(straight×factor, straight+slackMeters). */
  detourFactor?: number;
  slackMeters?: number;
}

/**
 * Turn a candidate shape into a drawable leg between two stops, or fall back to
 * a straight line when the candidate clearly isn't the right geometry.
 *
 * A clean straight segment reads far better on the map than a shape that loops
 * out to the end of the line and back.
 */
export function resolveLegGeometry(
  candidate: LngLat[] | null | undefined,
  from: LngLat,
  to: LngLat,
  opts: ResolveOptions = {}
): { coords: LngLat[]; usedCandidate: boolean } {
  const maxOffset = opts.maxOffsetMeters ?? 350;
  const detourFactor = opts.detourFactor ?? 2.8;
  const slack = opts.slackMeters ?? 1200;
  const straight = distanceMeters(from, to);

  if (candidate && candidate.length >= 2) {
    const sliced = slicePolylineBetween(candidate, from, to);
    const endpointsOnShape =
      sliced.fromOffsetMeters <= maxOffset && sliced.toOffsetMeters <= maxOffset;
    const lengthSane =
      sliced.lengthMeters <= Math.max(straight * detourFactor, straight + slack);

    if (endpointsOnShape && lengthSane && sliced.coords.length >= 2) {
      // Pin the exact stop coordinates so legs join seamlessly.
      return {
        coords: [from, ...sliced.coords.slice(1, -1), to],
        usedCandidate: true,
      };
    }
  }

  return { coords: [from, to], usedCandidate: false };
}
