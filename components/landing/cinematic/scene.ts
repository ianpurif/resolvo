import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  Resources,
  makeFabric,
  makeStitches,
  makeThread,
  studioEnvironment,
} from "./embroidery-materials";
import { createEmbroideryPattern, sewingState } from "./embroidery-pattern";
import {
  advanceProgress,
  clamp,
  journeyPose,
  renderPixelRatio,
  seededRandom,
  sewingProgress,
  smoothstep,
} from "./journey";

export type SceneInput = {
  progress: number;
  paused: boolean;
  palette: number;
  inspect: boolean;
};
export type SceneController = { dispose: () => void };
type Options = {
  canvas: HTMLCanvasElement;
  input: SceneInput;
  onReady: () => void;
  onFailure: () => void;
};

export function createScene({
  canvas,
  input,
  onReady,
  onFailure,
}: Options): SceneController {
  const resources = new Resources(),
    cleanup: (() => void)[] = [],
    abort = new AbortController();
  let renderer: THREE.WebGLRenderer | undefined,
    frame = 0,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    cancelAnimationFrame(frame);
    cleanup.forEach((fn) => fn());
    resources.dispose();
    renderer?.dispose();
    // React development refresh can reuse the same canvas immediately. Release
    // its context only after a real DOM removal, not underneath the next renderer.
    const released = renderer;
    queueMicrotask(() => {
      if (!canvas.isConnected) released?.forceContextLoss();
    });
  };
  const fail = () => {
    if (disposed) return;
    dispose();
    onFailure();
  };
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const gl = renderer;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.04;
    gl.setClearColor(0x101d23);
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = false;
    gl.debug.onShaderError = () => queueMicrotask(fail);
    const world = new THREE.Scene();
    world.fog = new THREE.Fog(0x101d23, 13, 32);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.035, 60);
    world.environment = studioEnvironment(resources, gl);
    world.environmentIntensity = 0.55;
    world.add(new THREE.HemisphereLight(0xc5d3de, 0x292b26, 0.55));
    const key = new THREE.DirectionalLight(0xffedce, 2.2);
    key.position.set(-3, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.00015;
    key.shadow.normalBias = 0.018;
    cleanup.push(() => key.shadow.dispose());
    world.add(key);
    const rim = new THREE.DirectionalLight(0x9ccad3, 1.8);
    rim.position.set(5, 4, -4);
    world.add(rim);
    const needleLight = new THREE.PointLight(0xffd9aa, 2.8, 4, 2);
    needleLight.position.set(0.1, 1.2, 0.55);
    world.add(needleLight);
    const floor = new THREE.Mesh(
      resources.keep(new THREE.PlaneGeometry(70, 70)),
      resources.keep(
        new THREE.MeshStandardMaterial({
          color: 0x26373d,
          roughness: 0.87,
          metalness: 0.08,
        }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.585;
    floor.receiveShadow = true;
    world.add(floor);

    const pattern = createEmbroideryPattern(),
      fabric = makeFabric(resources, pattern),
      embroidery = makeStitches(resources, pattern),
      thread = makeThread(resources);
    // Keep the entire embroidery field inside the machine's measured throat.
    const fabricScale = 0.55;
    fabric.group.scale.setScalar(fabricScale);
    fabric.group.add(embroidery.mesh);
    world.add(fabric.group, thread.mesh);
    const dustGeometry = resources.keep(new THREE.BufferGeometry()),
      dustPositions = new Float32Array(120 * 3),
      random = seededRandom(61);
    for (let i = 0; i < 120; i++)
      dustPositions.set(
        [(random() - 0.5) * 16, random() * 7, (random() - 0.5) * 12],
        i * 3,
      );
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(dustPositions, 3),
    );
    const dust = new THREE.Points(
      dustGeometry,
      resources.keep(
        new THREE.PointsMaterial({
          size: 0.012,
          color: 0xaebcad,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      ),
    );
    world.add(dust);

    let width = 1,
      height = 1,
      invalid = true,
      loaded = false;
    let budget = 2_000_000,
      pixelRatio = 1,
      lastDraw = 0;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      pixelRatio = renderPixelRatio(
        width,
        height,
        devicePixelRatio,
        width < 900 ? Math.min(budget, 1_150_000) : budget,
      );
      gl.setPixelRatio(pixelRatio);
      gl.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      invalid = true;
      canvas.dataset.renderPixels = String(canvas.width * canvas.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    cleanup.push(() => observer.disconnect());
    const pointer = new THREE.Vector2(),
      pointerTarget = new THREE.Vector2();
    let dragging = false,
      lastX = 0,
      lastY = 0,
      yaw = 0,
      pitch = 0;
    const pointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerTarget.set(
        ((event.clientX - rect.left) / width) * 2 - 1,
        (-(event.clientY - rect.top) / height) * 2 + 1,
      );
      if (dragging) {
        yaw = clamp(yaw + (event.clientX - lastX) * 0.002, -0.4, 0.4);
        pitch = clamp(pitch + (event.clientY - lastY) * 0.001, -0.15, 0.15);
        lastX = event.clientX;
        lastY = event.clientY;
        invalid = true;
      }
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.dataset.dragging = "true";
    };
    const up = (event: PointerEvent) => {
      dragging = false;
      canvas.dataset.dragging = "false";
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    };
    const leave = () => {
      if (!dragging) pointerTarget.set(0, 0);
    };
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    cleanup.push(() => {
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
    });
    const lost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    canvas.addEventListener("webglcontextlost", lost);
    cleanup.push(() => canvas.removeEventListener("webglcontextlost", lost));

    let machine: THREE.Group | undefined,
      needle: THREE.Object3D | undefined,
      wheel: THREE.Object3D | undefined,
      spool: THREE.MeshStandardMaterial | undefined;
    const color = new THREE.Color(),
      hsl = { h: 0, s: 0, l: 0 };
    const mapColor = (hex: number, palette: number) => {
      color.setHex(hex);
      color.getHSL(hsl);
      if (palette === 1) {
        if (hsl.h > 0.35 && hsl.h < 0.7)
          color.setHSL(hsl.h - 0.12, hsl.s * 0.72, hsl.l * 0.95);
        else if (hsl.h < 0.16) color.setHSL(hsl.h + 0.035, hsl.s * 0.85, hsl.l);
      }
      if (palette === 2) {
        if (hsl.h > 0.35 && hsl.h < 0.7)
          color.setHSL(0.61 + (hsl.h - 0.5) * 0.3, hsl.s * 0.46, hsl.l * 1.1);
        else if (hsl.h < 0.16)
          color.setHSL(hsl.h - 0.025, hsl.s * 0.62, hsl.l * 1.05);
      }
      return color;
    };
    const eye = new THREE.Vector3(),
      anchor = new THREE.Vector3(),
      guide = new THREE.Vector3(0.03, 1.35, 0.17);
    const threadPoints = Array.from({ length: 5 }, () => new THREE.Vector3()),
      cameraPoint = new THREE.Vector3(),
      cameraLook = new THREE.Vector3(),
      offset = new THREE.Vector3(),
      axis = new THREE.Vector3(0, 1, 0);
    const finalCloth = new THREE.Vector3(0.9, 1.0, 6.5),
      sewCloth = new THREE.Vector3(),
      first = pattern.timeline[0].a;
    let previous = 0,
      elapsed = 0,
      progress = input.progress,
      ready = false,
      lastPalette = -1,
      inspectAmount = 0,
      rendered = 0,
      lastMetrics = 0;
    let perfFrames = 0,
      perfTotal = 0;

    const tick = (now: number) => {
      if (disposed) return;
      const delta = previous ? Math.min(0.2, (now - previous) / 1000) : 1 / 60;
      previous = now;
      if (!input.paused) elapsed += delta;
      const next = advanceProgress(progress, input.progress, delta);
      const needsDraw =
        loaded &&
        (!input.paused ||
          invalid ||
          next !== progress ||
          pointer.distanceTo(pointerTarget) > 0.0002 ||
          lastPalette !== input.palette ||
          Math.abs(inspectAmount - Number(input.inspect)) > 0.0001);
      progress = next;
      pointer.lerp(pointerTarget, 1 - Math.exp(-delta * 18));
      inspectAmount +=
        (Number(input.inspect) - inspectAmount) * (1 - Math.exp(-delta * 12));
      if (needsDraw) {
        invalid = false;
        const started = performance.now(),
          pose = journeyPose(progress, width < 900);
        const sew = sewingProgress(
          progress,
          pattern.outlineDistance / pattern.totalDistance,
          pattern.fillDistance / pattern.totalDistance,
        );
        const state = sewingState(pattern, sew),
          loading = smoothstep(0.18, 0.302, progress);
        sewCloth.set(
          -state.point[0] * fabricScale,
          0,
          -state.point[1] * fabricScale,
        );
        if (progress < 0.305)
          sewCloth.set(
            -first[0] * loading * fabricScale,
            0,
            0.6 - loading * (0.6 + first[1] * fabricScale),
          );
        fabric.group.position.copy(sewCloth).lerp(finalCloth, pose.reveal);
        fabric.group.rotation.x = pose.reveal * 0.97;
        fabric.group.rotation.z = pose.reveal * -0.07;
        fabric.group.updateMatrixWorld(true);
        embroidery.mesh.count = state.count;
        fabric.guideMaterial.opacity = pose.sketch * 0.6;
        if (needle)
          needle.position.y =
            1.05 +
            state.needleOffset * (1 - pose.reveal) +
            (progress < 0.29 ? Math.sin(elapsed * 0.9) * 0.006 : 0);
        if (wheel)
          wheel.rotation.x =
            progress < 0.305
              ? Math.sin(elapsed * 0.75) * 0.04
              : -(state.stitch.before + (state.stitch.sewn ? state.phase : 0)) *
                Math.PI *
                2;
        eye.set(0, 0.32 + state.needleOffset * (1 - pose.reveal), 0);
        const point =
          state.phase >= 0.62 && state.stitch.sewn
            ? state.stitch.b
            : state.stitch.a;
        anchor.set(point[0], 0.035, point[1]);
        fabric.group.localToWorld(anchor);
        if (progress < 0.305) anchor.set(0, 0.08, 0);
        threadPoints[0].copy(guide);
        threadPoints[1]
          .copy(guide)
          .lerp(eye, 0.5)
          .add(new THREE.Vector3(0.018 * Math.sin(elapsed * 0.8), 0, 0.012));
        threadPoints[2].copy(eye);
        threadPoints[3].copy(eye).lerp(anchor, 0.55);
        threadPoints[3].y +=
          0.015 + (1 - state.feed) * 0.04 + pose.reveal * 0.35;
        threadPoints[4].copy(anchor);
        thread.update(threadPoints, pose.macro > 0.5 ? 0.005 : 0.008);
        const activeThread = progress > 0.305 ? state.color : 0x257d85;
        thread.material.color.copy(mapColor(activeThread, input.palette));
        spool?.color.copy(thread.material.color);
        if (lastPalette !== input.palette) {
          pattern.stitches.forEach((stitch, i) =>
            embroidery.mesh.setColorAt(
              i,
              mapColor(stitch.color, input.palette),
            ),
          );
          if (embroidery.mesh.instanceColor)
            embroidery.mesh.instanceColor.needsUpdate = true;
          lastPalette = input.palette;
        }
        cameraPoint.set(...pose.camera);
        cameraLook.set(...pose.target);
        const follow = pose.follow * (1 - pose.reveal);
        cameraPoint.x += sewCloth.x * follow;
        cameraPoint.z += sewCloth.z * follow;
        cameraLook.x += sewCloth.x * follow;
        cameraLook.z += sewCloth.z * follow;
        if (inspectAmount > 0 && progress > 0.84) {
          cameraPoint.lerp(
            width < 900
              ? new THREE.Vector3(1.0, 2.2, 13.3)
              : new THREE.Vector3(1.3, 2.1, 10.5),
            pose.reveal * inspectAmount,
          );
          cameraLook.lerp(
            width < 900
              ? new THREE.Vector3(0.9, 1.4, 6.5)
              : new THREE.Vector3(0.4, 1.0, 6.5),
            pose.reveal * inspectAmount,
          );
        }
        const free = (1 - pose.macro * 0.9) * (1 - pose.reveal * 0.25);
        offset
          .subVectors(cameraPoint, cameraLook)
          .applyAxisAngle(axis, yaw * free);
        cameraPoint.copy(cameraLook).add(offset);
        cameraPoint.y += pitch * free;
        cameraPoint.x +=
          pointer.x * 0.19 * free +
          Math.sin(elapsed * 0.19) * 0.12 * (1 - pose.macro);
        cameraPoint.y += pointer.y * 0.07 * free;
        camera.position.copy(cameraPoint);
        camera.lookAt(cameraLook);
        needleLight.intensity = 2.8 + Math.sin(elapsed * 0.55) * 0.3;
        dust.rotation.y = elapsed * 0.012;
        try {
          gl.render(world, camera);
        } catch {
          fail();
          return;
        }
        rendered++;
        lastDraw = performance.now() - started;
        if (!ready) {
          ready = true;
          onReady();
        }
        canvas.dataset.progress = progress.toFixed(5);
        canvas.dataset.targetProgress = input.progress.toFixed(5);
        canvas.dataset.stitches = String(state.count);
        canvas.dataset.needleOffset = state.needleOffset.toFixed(4);
        if (now - lastMetrics > 250) {
          canvas.dataset.totalStitches = String(pattern.stitches.length);
          canvas.dataset.drawCalls = String(gl.info.render.calls);
          canvas.dataset.frameMs = lastDraw.toFixed(2);
          canvas.dataset.frame = String(rendered);
          lastMetrics = now;
        }
        if (!input.paused && rendered > 45) {
          perfFrames++;
          perfTotal += delta;
          if (perfFrames >= 50) {
            if (perfTotal / perfFrames > 0.024 && budget > 950_000) {
              budget = Math.max(950_000, budget * 0.78);
              resize();
            }
            perfFrames = 0;
            perfTotal = 0;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (!document.hidden) {
        invalid = true;
        frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    cleanup.push(() =>
      document.removeEventListener("visibilitychange", visibility),
    );
    fetch("/models/embroidery-machine.glb", { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Machine asset unavailable");
        return response.arrayBuffer();
      })
      .then((buffer) => new GLTFLoader().parseAsync(buffer, ""))
      .then(async (asset) => {
        machine = asset.scene;
        machine.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          resources.keep(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            resources.keep(material);
            for (const value of Object.values(material))
              if (value instanceof THREE.Texture) resources.keep(value);
            if (material instanceof THREE.MeshStandardMaterial) {
              material.envMapIntensity = 0.8;
              if (material.name.includes("kingfisher")) spool = material;
            }
          }
          object.castShadow = true;
          object.receiveShadow = true;
        });
        if (disposed) {
          resources.dispose();
          return;
        }
        needle = machine.getObjectByName("NeedlePivot");
        wheel = machine.getObjectByName("HandwheelPivot");
        if (!needle) throw new Error("Needle rig missing");
        world.add(machine);
        camera.position.set(...journeyPose(input.progress, width < 900).camera);
        camera.lookAt(
          new THREE.Vector3(...journeyPose(input.progress, width < 900).target),
        );
        await gl.compileAsync(world, camera);
        if (disposed) return;
        gl.shadowMap.needsUpdate = true;
        loaded = true;
        invalid = true;
        canvas.dataset.model = "blender-atelier";
      })
      .catch((error) => {
        if (error?.name !== "AbortError") fail();
      });
    frame = requestAnimationFrame(tick);
    return { dispose };
  } catch {
    fail();
    return { dispose };
  }
}
