/** Original kingfisher study. The same paths supply the drawing, stitches and needle. */
export type Point2 = readonly [number, number];
export type Stitch = {
  a: Point2;
  b: Point2;
  color: number;
  width: number;
  height: number;
  sewn: boolean;
  before: number;
  distance: number;
};
type Shape = {
  points: Point2[];
  color: number;
  angle: number;
  spacing?: number;
  layer?: number;
};

const ink = 0x18394d,
  teal = 0x257d85,
  sea = 0x61a9a5,
  copper = 0xbc704b;
const gold = 0xd2a46b,
  ivory = 0xeee0bd,
  leaf = 0x5b786c;
const world = ([x, y]: Point2): Point2 => [(x - 445) / 155, (y - 310) / 155];
const distance = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Closed, gently rounded contours, authored as silhouettes rather than a stock icon. */
function contour(points: Point2[], samples = 8): Point2[] {
  const result: Point2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[(i + points.length - 1) % points.length],
      b = points[i];
    const c = points[(i + 1) % points.length],
      d = points[(i + 2) % points.length];
    for (let j = 0; j < samples; j++) {
      const t = j / samples,
        t2 = t * t,
        t3 = t2 * t;
      result.push(
        [0, 1].map(
          (axis) =>
            0.5 *
            (2 * b[axis] +
              (-a[axis] + c[axis]) * t +
              (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 +
              (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3),
        ) as unknown as Point2,
      );
    }
  }
  return result.map(world);
}

function bezier(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
  samples = 48,
): Point2[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples,
      u = 1 - t;
    return world([
      u * u * u * a[0] +
        3 * u * u * t * b[0] +
        3 * u * t * t * c[0] +
        t * t * t * d[0],
      u * u * u * a[1] +
        3 * u * u * t * b[1] +
        3 * u * t * t * c[1] +
        t * t * t * d[1],
    ]);
  });
}

function makeShapes(): Shape[] {
  const shapes: Shape[] = [];
  const add = (
    points: Point2[],
    color: number,
    angle: number,
    layer = 0,
    spacing = 0.023,
  ) => shapes.push({ points: contour(points), color, angle, layer, spacing });
  // Three distinct tail feathers, then body, breast, head and cheek.
  add(
    [
      [468, 340],
      [450, 381],
      [304, 470],
      [322, 435],
      [405, 359],
    ],
    ink,
    -0.6,
  );
  add(
    [
      [475, 347],
      [470, 385],
      [340, 484],
      [356, 447],
      [430, 371],
    ],
    teal,
    -0.5,
    0.003,
  );
  add(
    [
      [486, 354],
      [487, 387],
      [381, 471],
      [391, 436],
      [447, 365],
    ],
    sea,
    -0.5,
    0.006,
  );
  add(
    [
      [513, 224],
      [555, 230],
      [588, 284],
      [572, 346],
      [525, 387],
      [465, 379],
      [445, 330],
      [470, 264],
    ],
    teal,
    -0.5,
  );
  add(
    [
      [550, 241],
      [580, 269],
      [587, 310],
      [560, 357],
      [521, 381],
      [486, 371],
      [512, 323],
      [526, 277],
    ],
    copper,
    0.7,
    0.004,
  );
  add(
    [
      [514, 237],
      [510, 198],
      [531, 166],
      [575, 152],
      [610, 171],
      [625, 202],
      [594, 222],
      [556, 232],
    ],
    ink,
    -0.25,
    0.005,
  );
  add(
    [
      [530, 180],
      [564, 160],
      [597, 171],
      [614, 189],
      [581, 186],
      [551, 197],
    ],
    teal,
    -0.35,
    0.01,
  );
  add(
    [
      [575, 205],
      [611, 200],
      [612, 216],
      [590, 228],
      [564, 234],
      [548, 224],
    ],
    ivory,
    0.1,
    0.015,
  );
  // The long, unambiguous kingfisher beak is a pair of tapered satin fields.
  add(
    [
      [610, 187],
      [744, 202],
      [651, 213],
      [608, 211],
    ],
    ink,
    0,
    0.012,
    0.018,
  );
  add(
    [
      [616, 205],
      [738, 202],
      [646, 219],
      [609, 216],
    ],
    gold,
    0.07,
    0.018,
    0.018,
  );
  // Overlapping wing coverts create a layered fan, each with its own stitch direction.
  add(
    [
      [516, 239],
      [467, 229],
      [422, 249],
      [391, 295],
      [389, 346],
      [414, 365],
      [461, 341],
      [493, 300],
    ],
    ink,
    -0.9,
    0.012,
  );
  for (let i = 0; i < 8; i++) {
    const x = 425 + i * 10.1,
      y = 257 - i * 2.1;
    add(
      [
        [x + 15, y - 8],
        [x + 29, y + 1],
        [x + 15, y + 53 - i * 2],
        [x - 22, y + 95 - i * 5],
        [x - 17, y + 52],
      ],
      [teal, sea, teal, 0x408d97, sea, 0x3c6f80, teal, 0x78b4ad][i],
      -0.95 + i * 0.045,
      0.02 + i * 0.002,
      0.019,
    );
  }
  // Botanical stems are drawn separately; these leaves attach to those exact stems.
  const leaves: [Point2, Point2, number][] = [
    [[239, 417], [180, 335], leaf],
    [[277, 410], [245, 321], teal],
    [[314, 407], [354, 329], sea],
    [[363, 405], [338, 481], leaf],
    [[610, 373], [673, 280], teal],
    [[644, 356], [724, 349], leaf],
    [[194, 431], [135, 393], sea],
    [[693, 332], [750, 268], sea],
  ];
  leaves.forEach(([base, tip, color], i) => {
    const dx = tip[0] - base[0],
      dy = tip[1] - base[1],
      len = Math.hypot(dx, dy),
      nx = -dy / len,
      ny = dx / len;
    add(
      [
        base,
        [base[0] + dx * 0.46 + nx * 16, base[1] + dy * 0.46 + ny * 16],
        tip,
        [base[0] + dx * 0.5 - nx * 12, base[1] + dy * 0.5 - ny * 12],
      ],
      color,
      Math.atan2(dy, dx) + Math.PI / 2,
      0.006 + i * 0.0004,
      0.022,
    );
  });
  // A small asymmetric blossom, not a repeating decorative wreath.
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - 0.4,
      cx = 251,
      cy = 292,
      dx = Math.cos(a),
      dy = Math.sin(a);
    add(
      [
        [cx, cy],
        [cx + dx * 15 - dy * 10, cy + dy * 15 + dx * 10],
        [cx + dx * 33, cy + dy * 33],
        [cx + dx * 15 + dy * 10, cy + dy * 15 - dx * 10],
      ],
      i % 2 ? 0xcc9271 : gold,
      a,
      0.02,
      0.018,
    );
  }
  return shapes;
}

export function createEmbroideryPattern() {
  const shapes = makeShapes();
  const timeline: Stitch[] = [],
    stitches: Stitch[] = [];
  const guides: Point2[][] = shapes.map((shape) => [
    ...shape.points,
    shape.points[0],
  ]);
  let previous: Point2 | null = null,
    length = 0;
  function segment(
    a: Point2,
    b: Point2,
    color: number,
    width = 0.008,
    height = 0.018,
    sewn = true,
  ) {
    if (distance(a, b) < 0.00001) return;
    length += Math.max(0.035, distance(a, b)) * (sewn ? 1 : 0.6);
    const item = {
      a,
      b,
      color,
      width,
      height,
      sewn,
      before: stitches.length,
      distance: length,
    };
    timeline.push(item);
    if (sewn) stitches.push(item);
    previous = b;
  }
  function travel(to: Point2) {
    if (previous && distance(previous, to) > 0.005)
      segment(previous, to, teal, 0.006, 0.018, false);
    previous = to;
  }
  function run(
    points: Point2[],
    color: number,
    width = 0.008,
    height = 0.018,
    spacing = 0.055,
  ) {
    travel(points[0]);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        steps = Math.max(1, Math.ceil(distance(a, b) / spacing));
      for (let s = 0; s < steps; s++)
        segment(
          [
            a[0] + ((b[0] - a[0]) * s) / steps,
            a[1] + ((b[1] - a[1]) * s) / steps,
          ],
          [
            a[0] + ((b[0] - a[0]) * (s + 1)) / steps,
            a[1] + ((b[1] - a[1]) * (s + 1)) / steps,
          ],
          color,
          width,
          height,
        );
    }
  }
  const branch = bezier([126, 443], [295, 399], [494, 445], [720, 318], 80);
  guides.unshift(branch);
  run(branch, gold, 0.012, 0.025);
  run(
    bezier([278, 415], [287, 365], [272, 323], [251, 292]),
    gold,
    0.009,
    0.02,
  );
  run(
    bezier([504, 366], [512, 401], [518, 414], [551, 410]),
    copper,
    0.012,
    0.02,
  );
  run(
    bezier([530, 369], [541, 403], [545, 408], [577, 400]),
    copper,
    0.011,
    0.02,
  );
  // Draw the complete contours before filling. This is the same drawing seen in chapter two.
  shapes
    .slice(0, 12)
    .forEach((shape) =>
      run([...shape.points, shape.points[0]], shape.color, 0.008, 0.016, 0.065),
    );
  const outlineEnd = stitches.length;
  const outlineDistance = length;

  shapes.forEach((shape) => {
    const cos = Math.cos(shape.angle),
      sin = Math.sin(shape.angle);
    const rotated = shape.points.map(
      ([x, z]) => [x * cos + z * sin, -x * sin + z * cos] as Point2,
    );
    const min = Math.min(...rotated.map((p) => p[1])),
      max = Math.max(...rotated.map((p) => p[1]));
    let row = 0;
    for (let v = min + 0.008; v < max; v += shape.spacing ?? 0.023, row++) {
      const hits: number[] = [];
      for (let i = 0; i < rotated.length; i++) {
        const a = rotated[i],
          b = rotated[(i + 1) % rotated.length];
        if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v))
          hits.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      hits.sort((a, b) => a - b);
      for (let h = 0; h + 1 < hits.length; h += 2) {
        let a = hits[h],
          b = hits[h + 1];
        if (row % 2) [a, b] = [b, a];
        const start: Point2 = [a * cos - v * sin, a * sin + v * cos];
        const end: Point2 = [b * cos - v * sin, b * sin + v * cos];
        if (distance(start, end) < 0.012) continue;
        // Long-and-short stitches keep the field tactile and prevent oversized ribbons.
        run(
          [start, end],
          shape.color,
          0.0095,
          0.018 + (shape.layer ?? 0),
          0.15,
        );
      }
    }
  });
  const fillEnd = stitches.length;
  const fillDistance = length;
  // Fine feather shafts, leaf veins, the eye, and tiny seed stitches finish the piece.
  for (let i = 0; i < 8; i++)
    run(
      bezier(
        [444 + i * 10, 251 - i * 2],
        [434 + i * 11, 271],
        [426 + i * 10, 305 - i * 3],
        [404 + i * 13, 341 - i * 5],
        24,
      ),
      i % 2 ? ivory : sea,
      0.0037,
      0.045,
      0.046,
    );
  for (let i = 0; i < 13; i++) {
    const a = i * 0.52,
      x = 546 + Math.cos(a) * 20,
      y = 178 + Math.sin(a) * 10;
    run([world([x, y]), world([x + 5, y - 1])], sea, 0.004, 0.04);
  }
  run(
    contour([
      [590, 190],
      [597, 187],
      [603, 191],
      [600, 198],
      [593, 199],
    ]),
    ink,
    0.014,
    0.046,
    0.025,
  );
  run([world([598, 189]), world([599, 191])], ivory, 0.012, 0.058);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    run(
      [
        world([251 + Math.cos(angle) * 3, 292 + Math.sin(angle) * 3]),
        world([251 + Math.cos(angle) * 8, 292 + Math.sin(angle) * 8]),
      ],
      ink,
      0.008,
      0.045,
    );
  }
  // A quiet stitched signature beneath the study: two intertwined, non-circular strokes.
  run(
    bezier([616, 477], [637, 450], [621, 507], [649, 474]),
    gold,
    0.006,
    0.024,
  );
  run(
    bezier([632, 488], [647, 475], [660, 480], [674, 479]),
    gold,
    0.006,
    0.024,
  );
  return {
    timeline,
    stitches,
    guides,
    totalDistance: length,
    outlineEnd,
    fillEnd,
    outlineDistance,
    fillDistance,
  };
}

export type EmbroideryPattern = ReturnType<typeof createEmbroideryPattern>;

/** A reversible mechanical cycle: feed while raised, then penetrate, lock and withdraw. */
export function sewingState(pattern: EmbroideryPattern, progress: number) {
  const value = Math.min(1, Math.max(0, progress));
  const target = value * pattern.totalDistance;
  let lo = 0,
    hi = pattern.timeline.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pattern.timeline[mid].distance < target) lo = mid + 1;
    else hi = mid;
  }
  const stitch = pattern.timeline[lo],
    before = lo ? pattern.timeline[lo - 1].distance : 0;
  const phase = Math.min(
    1,
    Math.max(0, (target - before) / (stitch.distance - before)),
  );
  const ease = (t: number) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  const feed = stitch.sewn ? ease(phase / 0.42) : ease(phase);
  const penetration = stitch.sewn
    ? ease((phase - 0.42) / 0.19) * (1 - ease((phase - 0.76) / 0.24))
    : 0;
  return {
    point: [
      stitch.a[0] + (stitch.b[0] - stitch.a[0]) * feed,
      stitch.a[1] + (stitch.b[1] - stitch.a[1]) * feed,
    ] as Point2,
    count:
      value === 1
        ? pattern.stitches.length
        : stitch.before + (stitch.sewn && phase >= 0.62 ? 1 : 0),
    needleOffset: -0.33 * penetration,
    phase,
    color: stitch.color,
    stitch,
    feed,
  };
}
