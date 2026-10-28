import assert from "node:assert/strict";
import test from "node:test";
import { journeyPose, sampleTrack, scrollProgress, type Keyframe } from "../components/landing/cinematic/journey";

test("native scroll maps unequal chapter heights to the authored camera timeline", () => {
  const anchors = [0, 920, 1960, 3160, 4200];
  anchors.forEach((anchor, i) => assert.equal(scrollProgress(anchor, anchors), i / 4));
  assert.equal(scrollProgress(1440, anchors), 0.375);
  assert.equal(scrollProgress(-40, anchors), 0);
  assert.equal(scrollProgress(99999, anchors), 1);
  assert.equal(scrollProgress(0, []), 0);
});

test("the camera interpolator reaches each shot without a position or velocity jump", () => {
  const track: Keyframe[] = [
    { at: 0, value: [0, 1, 12] }, { at: 0.2, value: [-2, 3, 8] },
    { at: 0.65, value: [3, 0, -2] }, { at: 1, value: [0, 1, 12] },
  ];
  const step = 0.00001;
  for (const key of track.slice(1, -1)) {
    assert.deepEqual(sampleTrack(track, key.at), key.value);
    const left = sampleTrack(track, key.at - step), right = sampleTrack(track, key.at + step);
    for (let axis = 0; axis < 3; axis++) {
      const before = (key.value[axis] - left[axis]) / step;
      const after = (right[axis] - key.value[axis]) / step;
      assert.ok(Math.abs(before - after) < 0.02, `camera axis ${axis} jumps at ${key.at}`);
    }
  }
});

test("the entire desktop and mobile camera paths stay finite and continuous", () => {
  for (const mobile of [false, true]) {
    let previous = journeyPose(0, mobile);
    for (let i = 1; i <= 4000; i++) {
      const current = journeyPose(i / 4000, mobile);
      for (const property of ["camera", "target", "loom", "rotation"] as const) {
        assert.ok(current[property].every(Number.isFinite));
        const distance = Math.hypot(...current[property].map((value, axis) => value - previous[property][axis]));
        assert.ok(distance < 0.08, `${property} jumps at ${i / 4000}`);
      }
      assert.ok(current.scale > 0);
      previous = current;
    }
  }
});

test("the journey travels through the aperture and returns to readable evidence", () => {
  const entrance = journeyPose(0, false), passage = journeyPose(0.58, false), evidence = journeyPose(0.75, false);
  assert.ok(entrance.camera[2] > 10);
  assert.ok(passage.camera[2] < passage.loom[2]);
  assert.ok(passage.tunnel > 0.8);
  assert.equal(evidence.evidence, 1);
  assert.equal(evidence.sourceField, 0);
  assert.equal(evidence.tunnel, 0);
  assert.ok(evidence.camera[2] > 10);
});

test("mobile puts the sculpture below the copy and preserves the final shot", () => {
  for (const progress of [0, 0.25, 0.75]) {
    const desktop = journeyPose(progress, false), mobile = journeyPose(progress, true);
    assert.ok(mobile.loom[1] < desktop.loom[1]);
    assert.ok(mobile.scale < desktop.scale);
  }
  assert.deepEqual(journeyPose(1, true).loom, journeyPose(1, false).loom);
  assert.deepEqual(journeyPose(-1, false), journeyPose(0, false));
  assert.deepEqual(journeyPose(2, false), journeyPose(1, false));
});
