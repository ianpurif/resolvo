/** The scene's coordinates are authored in world units; the DOM supplies scroll anchors. */
export type Vec3 = readonly [number, number, number];
export type Keyframe = { at: number; value: Vec3 };
export type SourceKind = 0 | 1 | 2;

export const CHAPTERS = [
  { id: "begin", name: "A living thread" },
  { id: "product", name: "Your sources" },
  { id: "how-it-works", name: "The connection" },
  { id: "capabilities", name: "The evidence" },
  { id: "your-next-answer", name: "Your next answer" },
] as const;

export const SOURCES = [
  { name: "Documents", detail: "PDF, Word, text & structured files.", label: "DOCUMENT" },
  { name: "Web pages", detail: "Bring a public page into context.", label: "WEB PAGE" },
  { name: "Written notes", detail: "Write it once. Keep it connected.", label: "NOTE" },
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
  for (let i = 1; i < anchors.length; i++) {
    if (scroll <= anchors[i]) {
      const span = anchors[i] - anchors[i - 1];
      return (i - 1 + (span > 0 ? clamp((scroll - anchors[i - 1]) / span) : 1)) / (anchors.length - 1);
    }
  }
  return 1;
}

/** Cubic interpolation keeps the camera moving continuously between authored shots. */
export function sampleTrack(frames: readonly Keyframe[], progress: number): Vec3 {
  const p = clamp(progress);
  if (p <= frames[0].at) return [...frames[0].value];
  if (p >= frames[frames.length - 1].at) return [...frames[frames.length - 1].value];
  let i = 0;
  while (i < frames.length - 2 && p > frames[i + 1].at) i++;
  const a = frames[Math.max(0, i - 1)], b = frames[i];
  const c = frames[i + 1], d = frames[Math.min(frames.length - 1, i + 2)];
  const t = (p - b.at) / (c.at - b.at), t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((axis) => {
    const span = c.at - b.at;
    const m0 = (c.value[axis] - a.value[axis]) * span / Math.max(0.001, c.at - a.at);
    const m1 = (d.value[axis] - b.value[axis]) * span / Math.max(0.001, d.at - b.at);
    return (2 * t3 - 3 * t2 + 1) * b.value[axis] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * c.value[axis] + (t3 - t2) * m1;
  }) as unknown as Vec3;
}

const camera: readonly Keyframe[] = [
  { at: 0, value: [0, 0.7, 11.8] },
  { at: 0.25, value: [-1.5, 1.4, 12.5] },
  { at: 0.40, value: [0.7, 0.6, 6.0] },
  { at: 0.50, value: [0.1, 0.15, 1.5] },
  { at: 0.58, value: [2.5, 0.8, -2.5] },
  { at: 0.66, value: [6.5, 2.5, 5.5] },
  { at: 0.75, value: [0, 0.8, 11.8] },
  { at: 1, value: [0, 0.4, 12.8] },
];
const target: readonly Keyframe[] = [
  { at: 0, value: [0, 0, 0] },
  { at: 0.25, value: [-0.8, 0, -0.5] },
  { at: 0.50, value: [0, 0, -4] },
  { at: 0.58, value: [0, 0, -4] },
  { at: 0.75, value: [0, 0, 0] },
  { at: 1, value: [0, 0.2, 0] },
];
const loom: readonly Keyframe[] = [
  { at: 0, value: [2.8, 0.1, 0] },
  { at: 0.25, value: [-2.4, 0.1, -2.2] },
  { at: 0.50, value: [0, 0, -2.0] },
  { at: 0.75, value: [2.8, 0.2, -1.7] },
  { at: 1, value: [0, 2.5, -1.4] },
];
const rotation: readonly Keyframe[] = [
  { at: 0, value: [0.28, -0.35, -0.28] },
  { at: 0.25, value: [0.6, 0.65, -0.1] },
  { at: 0.50, value: [0, 0, 0.55] },
  { at: 0.75, value: [0.4, -0.4, 1.2] },
  { at: 1, value: [0.2, 0.15, 1.7] },
];

export function journeyPose(progress: number, mobile: boolean) {
  const p = clamp(progress);
  const cameraPosition = [...sampleTrack(camera, p)] as [number, number, number];
  const cameraTarget = [...sampleTrack(target, p)] as [number, number, number];
  const loomPosition = [...sampleTrack(loom, p)] as [number, number, number];
  if (mobile) {
    cameraPosition[0] *= 0.38;
    cameraPosition[2] += 1.5 * (1 - smoothstep(0.3, 0.46, p));
    cameraTarget[0] *= 0.38;
    loomPosition[0] *= 0.05;
    loomPosition[1] -= 1.8 * (1 - smoothstep(0.32, 0.48, p)) + 2.1 * smoothstep(0.65, 0.75, p) * (1 - smoothstep(0.85, 1, p));
  }
  const tunnel = smoothstep(0.3, 0.47, p) * (1 - smoothstep(0.55, 0.68, p));
  const evidence = smoothstep(0.63, 0.75, p) * (1 - smoothstep(0.86, 0.97, p));
  const sourceField = smoothstep(0.07, 0.23, p) * (1 - smoothstep(0.32, 0.48, p));
  const ending = smoothstep(0.85, 1, p);
  return {
    camera: cameraPosition, target: cameraTarget, loom: loomPosition,
    rotation: sampleTrack(rotation, p), tunnel, evidence, sourceField, ending,
    scale: (1 - 0.42 * sourceField + 0.35 * tunnel - 0.2 * evidence - 0.34 * ending) * (mobile ? 0.72 : 1),
    chapter: Math.min(4, Math.round(p * 4)),
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
