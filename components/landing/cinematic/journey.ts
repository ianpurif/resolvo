export type Vec3 = readonly [number, number, number];
export type Keyframe = { at: number; value: Vec3 };
export const CHAPTERS = [
  {
    id: "begin",
    name: "The atelier",
    label: "Prologue / The atelier",
    title: "Your knowledge.",
    emphasis: "Made whole.",
    text: "An idea. A single thread. A world of possibility.",
    height: 160,
  },
  {
    id: "product",
    name: "The idea",
    label: "01 / The idea",
    title: "Before the stitch,",
    emphasis: "a possibility.",
    text: "A kingfisher, imagined in lines. Every mark will find its place.",
    height: 155,
  },
  {
    id: "fabric",
    name: "The fabric",
    label: "02 / The foundation",
    title: "A quiet canvas.",
    emphasis: "Infinite potential.",
    text: "Linen, held in tension. The foundation of everything to come.",
    height: 160,
  },
  {
    id: "how-it-works",
    name: "The first stitch",
    label: "03 / The first stitch",
    title: "One small",
    emphasis: "beginning.",
    text: "The needle descends. An idea becomes something real.",
    height: 185,
  },
  {
    id: "outline",
    name: "The outline",
    label: "04 / Finding form",
    title: "A line becomes",
    emphasis: "a language.",
    text: "The thread follows the drawing. Separate marks begin to belong together.",
    height: 180,
  },
  {
    id: "color",
    name: "The color",
    label: "05 / A little life",
    title: "And then,",
    emphasis: "color.",
    text: "Deep indigo. Kingfisher teal. The warmth of copper.",
    height: 200,
  },
  {
    id: "details",
    name: "The details",
    label: "06 / The finishing touches",
    title: "Beauty lives",
    emphasis: "in the details.",
    text: "A feather. A vein. A glint of light. Nothing is incidental.",
    height: 190,
  },
  {
    id: "capabilities",
    name: "The reveal",
    label: "07 / The whole picture",
    title: "Many small acts.",
    emphasis: "One remarkable whole.",
    text: "The piece you watched becoming. Every thread still connected.",
    height: 180,
  },
  {
    id: "your-next-answer",
    name: "Made whole",
    label: "Epilogue / Carry it forward",
    title: "Make something",
    emphasis: "of what you know.",
    text: "Resolvo brings your team's knowledge into one connected understanding.",
    height: 140,
  },
] as const;

export const THREAD_PALETTES = [
  { name: "Kingfisher", colors: ["#297e86", "#17394d", "#bd744e"] },
  { name: "Forest", colors: ["#527966", "#283e38", "#c39958"] },
  { name: "Dusk", colors: ["#6c7f9b", "#283750", "#ba897a"] },
] as const;

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
export function smoothstep(from: number, to: number, value: number) {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}
export function scrollProgress(scroll: number, anchors: readonly number[]) {
  if (anchors.length < 2 || scroll <= anchors[0]) return 0;
  for (let i = 1; i < anchors.length; i++)
    if (scroll <= anchors[i])
      return (
        (i -
          1 +
          clamp(
            (scroll - anchors[i - 1]) /
              Math.max(1, anchors[i] - anchors[i - 1]),
          )) /
        (anchors.length - 1)
      );
  return 1;
}
export function sampleTrack(
  frames: readonly Keyframe[],
  progress: number,
): Vec3 {
  const p = clamp(progress);
  if (p <= frames[0].at) return frames[0].value;
  if (p >= frames[frames.length - 1].at) return frames[frames.length - 1].value;
  let i = 0;
  while (i < frames.length - 2 && p > frames[i + 1].at) i++;
  const a = frames[Math.max(0, i - 1)],
    b = frames[i],
    c = frames[i + 1],
    d = frames[Math.min(frames.length - 1, i + 2)];
  const t = (p - b.at) / (c.at - b.at),
    t2 = t * t,
    t3 = t2 * t;
  return [0, 1, 2].map((axis) => {
    const span = c.at - b.at,
      m0 =
        ((c.value[axis] - a.value[axis]) * span) / Math.max(0.001, c.at - a.at),
      m1 =
        ((d.value[axis] - b.value[axis]) * span) / Math.max(0.001, d.at - b.at);
    return (
      (2 * t3 - 3 * t2 + 1) * b.value[axis] +
      (t3 - 2 * t2 + t) * m0 +
      (-2 * t3 + 3 * t2) * c.value[axis] +
      (t3 - t2) * m1
    );
  }) as unknown as Vec3;
}

const camera: readonly Keyframe[] = [
  { at: 0, value: [8.2, 4.5, 12.3] },
  { at: 0.125, value: [-1.3, 3.8, 5.4] },
  { at: 0.25, value: [-0.8, 0.6, 1.6] },
  { at: 0.375, value: [-0.85, 0.75, 1.45] },
  { at: 0.5, value: [0.8, 2.7, 3.9] },
  { at: 0.625, value: [-0.5, 2.7, 3.8] },
  { at: 0.75, value: [0.45, 0.65, 1.15] },
  { at: 0.875, value: [3.7, 3.4, 13] },
  { at: 1, value: [2.7, 2.7, 13] },
];
const target: readonly Keyframe[] = [
  { at: 0, value: [-0.9, 1.65, 0.3] },
  { at: 0.125, value: [0.8, 0, 0.15] },
  { at: 0.25, value: [-0.22, 0.03, 0.1] },
  { at: 0.375, value: [-0.02, 0.32, 0] },
  { at: 0.5, value: [-0.8, 0.02, 0.1] },
  { at: 0.625, value: [0.8, 0.04, 0.1] },
  { at: 0.75, value: [0.0, 0.1, 0.05] },
  { at: 0.875, value: [-0.5, 1.2, 5.2] },
  { at: 1, value: [-0.5, 1.2, 5.2] },
];
// Portrait is composed shot by shot, with its own continuous camera track.
const portraitCamera: readonly Keyframe[] = [
  { at: 0, value: [6.3, 5.8, 22] },
  { at: 0.125, value: [-0.715, 3.8, 9.4] },
  { at: 0.25, value: [-0.44, 0.6, 1.6] },
  { at: 0.375, value: [-0.4675, 0.75, 1.45] },
  { at: 0.5, value: [0.44, 2.7, 7.9] },
  { at: 0.625, value: [-0.275, 2.7, 7.8] },
  { at: 0.75, value: [0.2475, 0.65, 1.15] },
  { at: 0.875, value: [2.2, 3.9, 18.8] },
  { at: 1, value: [2.2, 3.9, 18.8] },
];
const portraitTarget: readonly Keyframe[] = [
  { at: 0, value: [1.7, 3.4, 0.3] },
  { at: 0.125, value: [0, 0.8, 0.15] },
  { at: 0.25, value: [0, 0.03, 0.1] },
  { at: 0.375, value: [0, 0.32, 0] },
  { at: 0.5, value: [0, 0.82, 0.1] },
  { at: 0.625, value: [0, 0.84, 0.1] },
  { at: 0.75, value: [0, 0.1, 0.05] },
  { at: 0.875, value: [0.9, 2.6, 6] },
  { at: 1, value: [0.9, 2.6, 6] },
];

/** Only one 32 ms filter is applied; camera, needle and stitch visibility share it. */
export function advanceProgress(
  current: number,
  target: number,
  seconds: number,
) {
  const next =
    current +
    (clamp(target) - current) *
      (1 - Math.exp(-Math.min(0.1, Math.max(0, seconds)) / 0.032));
  const bounded = clamp(
    next,
    Math.max(0, target - 0.004),
    Math.min(1, target + 0.004),
  );
  return Math.abs(bounded - target) < 0.000002 ? clamp(target) : bounded;
}
export function renderPixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
  budget = 2_000_000,
) {
  return Math.min(
    deviceRatio || 1,
    1.5,
    Math.sqrt(budget / Math.max(1, width * height)),
  );
}
export function sewingProgress(p: number, outline = 0.19, fill = 0.98) {
  const track = [
    [0.305, 0],
    [0.38, outline * 0.07],
    [0.515, outline],
    [0.645, outline + (fill - outline) * 0.65],
    [0.735, fill],
    [0.81, 1],
  ];
  if (p <= track[0][0]) return 0;
  for (let i = 1; i < track.length; i++)
    if (p < track[i][0]) {
      const t = (p - track[i - 1][0]) / (track[i][0] - track[i - 1][0]);
      return track[i - 1][1] + (track[i][1] - track[i - 1][1]) * t;
    }
  return 1;
}
export function journeyPose(progress: number, mobile: boolean) {
  const p = clamp(progress),
    cam = sampleTrack(mobile ? portraitCamera : camera, p),
    look = sampleTrack(mobile ? portraitTarget : target, p);
  const reveal = smoothstep(0.81, 0.87, p);
  const macro =
    smoothstep(0.17, 0.25, p) * (1 - smoothstep(0.4, 0.49, p)) +
    smoothstep(0.67, 0.74, p) * (1 - smoothstep(0.79, 0.85, p));
  return {
    camera: cam,
    target: look,
    sew: sewingProgress(p),
    reveal,
    macro,
    sketch: smoothstep(0.065, 0.12, p) * (1 - smoothstep(0.23, 0.31, p)),
    fabricLoad: smoothstep(0.02, 0.15, p),
    follow: smoothstep(0.39, 0.49, p) * (1 - smoothstep(0.66, 0.74, p)),
    chapter: Math.min(
      CHAPTERS.length - 1,
      Math.round(p * (CHAPTERS.length - 1)),
    ),
  };
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
