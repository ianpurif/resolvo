import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAPTERS,
  advanceProgress,
  journeyPose,
  renderPixelRatio,
  sampleTrack,
  scrollProgress,
  sewingProgress,
  type Keyframe,
} from "../components/landing/cinematic/journey";
import {
  createEmbroideryPattern,
  sewingState,
} from "../components/landing/cinematic/embroidery-pattern";

test("native scroll maps the nine unequal chapters and leaves a complete finale", () => {
  let height = 0;
  const anchors = CHAPTERS.map((chapter) => {
    const anchor = height;
    height += chapter.height;
    return anchor;
  });
  anchors.forEach((anchor, i) =>
    assert.equal(scrollProgress(anchor, anchors), i / 8),
  );
  assert.equal(scrollProgress((anchors[3] + anchors[4]) / 2, anchors), 3.5 / 8);
  assert.equal(scrollProgress(-40, anchors), 0);
  assert.equal(scrollProgress(height, anchors), 1);
  assert.equal(scrollProgress(0, []), 0);
  assert.ok(height > 1400, "the piece needs time to develop");
  assert.ok(
    CHAPTERS[7].height + CHAPTERS[8].height >= 300,
    "hold the finished piece for the payoff",
  );
  assert.equal(sewingProgress(0.87), 1);
});

test("authored camera cuts are position and velocity continuous in both directions", () => {
  const track: Keyframe[] = [
    { at: 0, value: [0, 1, 12] },
    { at: 0.2, value: [-2, 3, 8] },
    { at: 0.65, value: [3, 0, -2] },
    { at: 1, value: [0, 1, 12] },
  ];
  const step = 0.00001;
  for (const key of track.slice(1, -1)) {
    assert.deepEqual(sampleTrack(track, key.at), key.value);
    const left = sampleTrack(track, key.at - step),
      right = sampleTrack(track, key.at + step);
    for (let axis = 0; axis < 3; axis++) {
      const before = (key.value[axis] - left[axis]) / step,
        after = (right[axis] - key.value[axis]) / step;
      assert.ok(
        Math.abs(before - after) < 0.02,
        `camera axis ${axis} jumps at ${key.at}`,
      );
    }
  }
  for (const mobile of [false, true]) {
    let previous = journeyPose(0, mobile);
    for (let i = 1; i <= 4000; i++) {
      const current = journeyPose(i / 4000, mobile);
      for (const property of ["camera", "target"] as const) {
        assert.ok(current[property].every(Number.isFinite));
        assert.ok(
          Math.hypot(
            ...current[property].map(
              (value, axis) => value - previous[property][axis],
            ),
          ) < 0.08,
        );
      }
      previous = current;
    }
  }
});

test("large monitors and high density phones never exceed the pixel budget", () => {
  for (const [w, h, device] of [
    [3840, 2160, 2],
    [5120, 1440, 2],
    [2560, 1440, 1],
    [390, 844, 3],
    [1440, 900, 1],
  ]) {
    const ratio = renderPixelRatio(w, h, device);
    assert.ok(Math.floor(w * ratio) * Math.floor(h * ratio) <= 2_000_000);
    assert.ok(ratio > 0 && ratio <= device);
  }
  assert.equal(renderPixelRatio(1440, 900, 1), 1);
});

test("scroll response is bounded and settles promptly after direction changes", () => {
  let current = 0;
  for (const target of [0.25, 0.65, 0.82, 0.33, 0, 1]) {
    current = advanceProgress(current, target, 1 / 60);
    assert.ok(Math.abs(target - current) <= 0.004001);
    for (let i = 0; i < 6; i++)
      current = advanceProgress(current, target, 1 / 60);
    assert.ok(
      Math.abs(target - current) < 0.0002,
      "a 100ms stop should settle without floating",
    );
  }
});

test("the exact same stitched piece is built and unbuilt as scroll reverses", () => {
  const pattern = createEmbroideryPattern();
  assert.ok(pattern.stitches.length > 2500);
  assert.equal(sewingState(pattern, 0).count, 0);
  assert.equal(sewingState(pattern, 1).count, pattern.stitches.length);
  let previous = 0;
  const forward = [];
  for (let i = 0; i <= 4000; i++) {
    const state = sewingState(pattern, i / 4000);
    assert.ok(state.count >= previous);
    assert.ok(state.count <= pattern.stitches.length);
    forward.push(state);
    previous = state.count;
  }
  for (let i = 4000; i >= 0; i--)
    assert.deepEqual(sewingState(pattern, i / 4000), forward[i]);
  assert.ok(
    pattern.outlineDistance < pattern.fillDistance &&
      pattern.fillDistance < pattern.totalDistance,
  );
});

test("fabric feeds with the needle raised and locks before a stitch is deposited", () => {
  const pattern = createEmbroideryPattern();
  for (let i = 0; i < pattern.timeline.length; i += 13) {
    const segment = pattern.timeline[i],
      start = i ? pattern.timeline[i - 1].distance : 0,
      span = segment.distance - start;
    const at = (phase: number) =>
      sewingState(pattern, (start + span * phase) / pattern.totalDistance);
    const feeding = at(0.25);
    assert.ok(Math.abs(feeding.needleOffset) < 1e-12);
    if (segment.sewn) {
      const down = at(0.7);
      assert.deepEqual(down.point, segment.b);
      assert.ok(down.needleOffset < -0.2);
      assert.ok(
        0.32 + down.needleOffset < 0,
        "the needle eye must pass below the fabric to lock the thread",
      );
      assert.equal(down.count, segment.before + 1);
      assert.equal(at(0.5).count, segment.before);
    } else assert.ok(Math.abs(at(0.7).needleOffset) < 1e-12);
  }
});
