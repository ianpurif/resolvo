import * as THREE from "three";
import { makeAnswer, makeEnvironment, makeSources, makeWeave, Resources } from "./geometry";
import { clamp, journeyPose, seededRandom, type SourceKind } from "./journey";
import * as shaders from "./shaders";

export type SceneInput = { progress: number; paused: boolean; selected: SourceKind };
export type SceneController = { dispose: () => void };
type Options = {
  canvas: HTMLCanvasElement;
  input: SceneInput;
  onReady: () => void;
  onFailure: () => void;
  onSelect: (kind: SourceKind) => void;
};

/** One renderer owns the whole journey. Scroll moves the world; time gives it life. */
export function createScene({ canvas, input, onReady, onFailure, onSelect }: Options): SceneController {
  const resources = new Resources();
  let renderer: THREE.WebGLRenderer | undefined;
  let frame = 0, disposed = false;
  const cleanups: (() => void)[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    cleanups.forEach((cleanup) => cleanup());
    resources.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  };

  try {
    const mobile = matchMedia("(max-width: 900px)").matches;
    const detailed = !mobile;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    const gl = renderer;
    gl.debug.onShaderError = () => queueMicrotask(() => { dispose(); onFailure(); });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.12;
    let pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.6);
    gl.setPixelRatio(pixelRatio);
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
    world.environment = makeEnvironment(resources, gl);
    world.add(new THREE.HemisphereLight(0xd4f1ef, 0x142d43, 2.2));
    const key = new THREE.DirectionalLight(0xe5f5e8, 2.6);
    key.position.set(-3, 6, 6);
    world.add(key);
    const rim = new THREE.PointLight(0x80c8de, 44, 24, 2);
    rim.position.set(5, 2, 0);
    world.add(rim);
    const warm = new THREE.PointLight(0xe6ba7d, 25, 18, 2);
    warm.position.set(-4, -1, 3);
    world.add(warm);

    const backgroundUniforms = { uTime: { value: 0 }, uProgress: { value: 0 }, uPointer: { value: new THREE.Vector2() } };
    const background = new THREE.Mesh(resources.keep(new THREE.PlaneGeometry(2, 2)), resources.keep(new THREE.ShaderMaterial({
      vertexShader: shaders.backgroundVertex, fragmentShader: shaders.backgroundFragment,
      uniforms: backgroundUniforms, depthTest: false, depthWrite: false,
    })));
    background.frustumCulled = false;
    background.renderOrder = -100;
    world.add(background);

    const weave = makeWeave(resources, detailed);
    world.add(weave.group);
    const sources = makeSources(resources, detailed);
    world.add(sources.group);
    const answer = makeAnswer(resources);
    world.add(answer.group);

    const random = seededRandom(4217);
    const count = detailed ? 1500 : 650;
    const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
    const kinds = new Float32Array(count), sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions.set([(random() - 0.5) * 26, (random() - 0.5) * 16, -random() * 17], i * 3);
      seeds[i] = random(); kinds[i] = i % 3; sizes[i] = random();
    }
    const dustGeometry = resources.keep(new THREE.BufferGeometry());
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    dustGeometry.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));
    dustGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const dustUniforms = {
      uTime: { value: 0 }, uProgress: { value: 0 }, uTunnel: { value: 0 }, uEvidence: { value: 0 },
      uSelected: { value: 0 }, uPixelRatio: { value: pixelRatio }, uPulse: { value: 0 }, uCore: { value: new THREE.Vector3() },
    };
    const dust = new THREE.Points(dustGeometry, resources.keep(new THREE.ShaderMaterial({
      vertexShader: shaders.particleVertex, fragmentShader: shaders.particleFragment, uniforms: dustUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    dust.frustumCulled = false;
    world.add(dust);

    const floor = new THREE.Mesh(resources.keep(new THREE.PlaneGeometry(40, 40)), resources.keep(new THREE.ShaderMaterial({
      vertexShader: shaders.floorVertex, fragmentShader: shaders.floorFragment,
      uniforms: { uTime: { value: 0 }, uProgress: { value: 0 } }, transparent: true, depthWrite: false,
    })));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -3.7;
    world.add(floor);

    // Threads extend through the aperture, so the camera actually travels inside a volume.
    const tunnel = new THREE.Group();
    const tunnelMaterials: THREE.ShaderMaterial[] = [];
    for (let strand = 0; strand < 32; strand++) {
      const points: THREE.Vector3[] = [];
      const distances = new Float32Array(181);
      for (let i = 0; i <= 180; i++) {
        const t = i / 180;
        const angle = strand / 32 * Math.PI * 2 + t * 2.6;
        const radius = 2 + Math.sin(t * Math.PI) * 1.6 + (strand % 4) * 0.08;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 7 - t * 30));
        distances[i] = t;
      }
      const geometry = resources.keep(new THREE.BufferGeometry().setFromPoints(points));
      geometry.setAttribute("aDistance", new THREE.BufferAttribute(distances, 1));
      const material = resources.keep(new THREE.ShaderMaterial({
        vertexShader: shaders.linkVertex, fragmentShader: shaders.linkFragment, transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(strand % 4 ? 0x7fc7cc : 0xdcc496) } },
      }));
      tunnelMaterials.push(material);
      tunnel.add(new THREE.Line(geometry, material));
    }
    world.add(tunnel);

    // A second physical layer gives the hero a sense of scale and a horizon.
    const orbitGroup = new THREE.Group();
    const orbitMaterial = resources.keep(new THREE.LineBasicMaterial({ color: 0x87bac3, transparent: true, opacity: 0.21, depthWrite: false }));
    for (let ring = 0; ring < 3; ring++) {
      const points = Array.from({ length: 181 }, (_, i) => {
        const a = i / 180 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * (3.25 + ring * 0.15), Math.sin(a) * (3.25 + ring * 0.15), 0);
      });
      const line = new THREE.Line(resources.keep(new THREE.BufferGeometry().setFromPoints(points)), orbitMaterial);
      line.rotation.set(0.9 + ring * 0.24, ring * 0.6, ring * 0.25);
      orbitGroup.add(line);
    }
    world.add(orbitGroup);

    const evidenceLinks = [0, 1, 2].map((kind) => {
      const geometry = resources.keep(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(49 * 3), 3));
      geometry.setAttribute("aDistance", new THREE.BufferAttribute(Float32Array.from({ length: 49 }, (_, i) => i / 48), 1));
      const material = resources.keep(new THREE.ShaderMaterial({
        vertexShader: shaders.linkVertex, fragmentShader: shaders.linkFragment, transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(kind === 2 ? 0xb68447 : 0x258b98) } },
      }));
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      // The vertices are in world space; draw after the transparent answer surface.
      line.renderOrder = 2;
      world.add(line);
      return { geometry, material, line };
    });

    let width = 1, height = 1, invalidated = true;
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight;
      const ceiling = width < 900 ? 1.25 : 1.6;
      if (pixelRatio > ceiling) { pixelRatio = ceiling; gl.setPixelRatio(pixelRatio); dustUniforms.uPixelRatio.value = pixelRatio; }
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      gl.setSize(width, height, false);
      invalidated = true;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    cleanups.push(() => observer.disconnect());

    const pointer = new THREE.Vector2(), pointerTarget = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    let drag = false, moved = false, downX = 0, downY = 0, dragRotation = 0, lastX = 0, pulse = 0;
    const setPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerTarget.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1);
      if (drag) {
        moved ||= Math.hypot(event.clientX - downX, event.clientY - downY) > 6;
        dragRotation += (event.clientX - lastX) * 0.006;
        lastX = event.clientX;
      }
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return; // Native touch scrolling stays entirely with the browser.
      drag = true; moved = false; downX = lastX = event.clientX; downY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.dataset.dragging = "true";
    };
    const onUp = (event: PointerEvent) => {
      if (!drag) return;
      drag = false; canvas.dataset.dragging = "false";
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (moved) return;
      setPointer(event);
      raycaster.setFromCamera(pointerTarget, camera);
      const hit = raycaster.intersectObjects(sources.cards.filter((card) => card.group.visible).map((card) => card.face), false)[0];
      if (hit) onSelect(hit.object.userData.sourceKind as SourceKind);
      pulse = 1;
    };
    const onLeave = () => { if (!drag) pointerTarget.set(0, 0); };
    const onCancel = () => { drag = false; canvas.dataset.dragging = "false"; };
    canvas.addEventListener("pointermove", setPointer);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);
    cleanups.push(() => {
      canvas.removeEventListener("pointermove", setPointer); canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onCancel); canvas.removeEventListener("pointerleave", onLeave);
    });
    const contextLost = (event: Event) => { event.preventDefault(); dispose(); onFailure(); };
    canvas.addEventListener("webglcontextlost", contextLost);
    cleanups.push(() => canvas.removeEventListener("webglcontextlost", contextLost));

    const position = new THREE.Vector3(), target = new THREE.Vector3();
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
    let previous = 0, elapsed = 0, progress = clamp(input.progress), ready = false;
    let perfFrames = 0, perfTime = 0, settledFrames = 0, lastSelected = input.selected, renderedFrames = 0;
    const tick = (now: number) => {
      if (disposed) return;
      const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 1 / 60;
      previous = now;
      if (!input.paused) elapsed += delta;
      const needsUpdate = !input.paused || Math.abs(progress - input.progress) > 0.0001 || pointer.distanceTo(pointerTarget) > 0.001 || drag || lastSelected !== input.selected || !ready || invalidated;
      invalidated = false;
      lastSelected = input.selected;
      progress += (clamp(input.progress) - progress) * (1 - Math.exp(-delta * 10));
      pointer.lerp(pointerTarget, 1 - Math.exp(-delta * 3));
      pulse *= Math.exp(-delta * 2);
      const compact = width < 900;
      const pose = journeyPose(progress, compact);
      if (needsUpdate || settledFrames++ < 3) {
        if (needsUpdate) settledFrames = 0;
        position.set(...pose.camera);
        position.x += pointer.x * 0.3 * (1 - pose.tunnel);
        position.y += pointer.y * 0.18;
        camera.position.copy(position);
        target.set(...pose.target); camera.lookAt(target);
        camera.rotation.z += Math.sin(progress * Math.PI * 2) * pose.tunnel * 0.1;

        weave.group.position.set(...pose.loom);
        weave.group.position.y += Math.sin(elapsed * 0.38) * 0.1;
        const freeRotation = 1 - pose.tunnel;
        weave.group.rotation.set(pose.rotation[0] + (Math.sin(elapsed * 0.27) * 0.09 + pointer.y * 0.06) * freeRotation, pose.rotation[1] + (Math.sin(elapsed * 0.23) * 0.26 + dragRotation) * freeRotation, pose.rotation[2] + elapsed * 0.065);
        weave.group.scale.setScalar(pose.scale * (1 + Math.sin(elapsed * 0.7) * 0.012));
        weave.group.children.forEach((strand, index) => {
          const band = Math.floor(index / 2);
          strand.position.z = (band - 2.5) * pose.sourceField * 0.16;
          strand.rotation.x = (band - 2.5) * pose.sourceField * 0.035;
        });
        orbitGroup.position.copy(weave.group.position);
        orbitGroup.rotation.set(elapsed * 0.025, -elapsed * 0.035 + dragRotation * 0.4 * freeRotation, 0.2);
        orbitGroup.scale.setScalar(pose.scale);
        orbitMaterial.opacity = (1 - pose.tunnel) * (1 - pose.evidence) * 0.18;

        const evidenceX = compact ? 0 : 2.7;
        const evidenceY = compact ? -1.95 : 0;
        answer.group.position.set(evidenceX, evidenceY, 2.0);
        answer.group.rotation.set(-0.04 + Math.sin(elapsed * 0.3) * 0.015, -0.16 + pointer.x * 0.04, -0.02);
        answer.group.scale.setScalar(compact ? 0.64 : 1);
        answer.material.opacity = pose.evidence;
        answer.edgeMaterial.opacity = pose.evidence * 0.55;
        answer.group.visible = pose.evidence > 0.001;
        sources.cards.forEach((card, i) => {
          const angle = card.seed * Math.PI * 2 + elapsed * (0.025 + (i % 3) * 0.009);
          const fieldX = (compact ? 0 : -3.8) + card.orbit.x * (compact ? 0.45 : 0.7);
          const fieldY = (compact ? -2.15 : 0.15) + card.orbit.y * (compact ? 0.48 : 0.85);
          const visibility = pose.sourceField + (i < 3 ? pose.evidence : 0);
          const selected = card.kind === input.selected;
          card.material.opacity = clamp(visibility) * (selected ? 0.95 : 0.4);
          card.material.emissive.set(selected ? 0x6eacb9 : 0x000000);
          card.material.emissiveIntensity = selected ? 0.12 : 0;
          card.group.visible = visibility > 0.005;
          card.group.position.set(fieldX + Math.sin(angle) * 0.2, fieldY + Math.cos(angle) * 0.15, card.orbit.z);
          card.group.rotation.set(Math.sin(angle) * 0.14, Math.sin(angle * 0.7) * 0.4, Math.sin(angle * 0.5) * 0.14);
          card.group.scale.setScalar(selected ? 1.12 : 0.9);
          if (i < 3 && pose.evidence > 0) {
            const evidencePosition = new THREE.Vector3(evidenceX + [-2.1, 2.45, 0.65][i] * (compact ? 0.65 : 1), evidenceY + [1.6, 0.45, -2.05][i] * (compact ? 0.7 : 1), 1.3);
            card.group.position.lerp(evidencePosition, pose.evidence);
            card.group.rotation.y *= 1 - pose.evidence;
            card.material.opacity = Math.max(card.material.opacity, pose.evidence * (selected ? 1 : 0.48));
          }
        });
        answer.group.updateMatrixWorld(true);
        evidenceLinks.forEach((link, i) => {
          curve.v0.copy(sources.cards[i].group.position);
          // Match the center of each citation chip on the curved 768 × 480 texture.
          const citationX = ((111 + i * 145) / 768 - 0.5) * 3.7;
          const citationY = (0.5 - 377 / 480) * 2.3;
          const citationZ = Math.sin(citationX / 3.7 * Math.PI) * 0.11 + Math.cos(citationY / 2.3 * Math.PI) * 0.045;
          curve.v3.set(citationX, citationY, citationZ + 0.035);
          answer.group.localToWorld(curve.v3);
          curve.v1.copy(curve.v0).add(new THREE.Vector3(0, 0.6, 1.8));
          curve.v2.copy(curve.v3).add(new THREE.Vector3(0.2, -0.5, 0.6));
          const attribute = link.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let j = 0; j <= 48; j++) { curve.getPoint(j / 48, position); attribute.setXYZ(j, position.x, position.y, position.z); }
          attribute.needsUpdate = true;
          link.material.uniforms.uTime.value = elapsed;
          link.material.uniforms.uOpacity.value = pose.evidence * (input.selected === i ? 1 : 0.25);
          link.line.visible = pose.evidence > 0.001;
        });
        tunnel.visible = pose.tunnel > 0.001;
        tunnel.rotation.z = elapsed * 0.02;
        tunnelMaterials.forEach((material) => { material.uniforms.uTime.value = elapsed; material.uniforms.uOpacity.value = pose.tunnel; });
        backgroundUniforms.uTime.value = elapsed; backgroundUniforms.uProgress.value = progress; backgroundUniforms.uPointer.value.copy(pointer);
        dustUniforms.uTime.value = elapsed; dustUniforms.uProgress.value = progress; dustUniforms.uTunnel.value = pose.tunnel;
        dustUniforms.uEvidence.value = pose.evidence; dustUniforms.uSelected.value = input.selected;
        dustUniforms.uPulse.value = pulse; dustUniforms.uCore.value.copy(weave.group.position);
        try { gl.render(world, camera); } catch { dispose(); onFailure(); return; }
        renderedFrames++;
        if (!ready) { ready = true; onReady(); }
      }
      // Resolve sustainably on modest GPUs instead of maintaining an expensive fixed DPR.
      if (ready && !input.paused) {
        perfFrames++; perfTime += delta;
        if (perfFrames >= 90) {
          if (perfTime / perfFrames > 0.028 && pixelRatio > 0.85) {
            pixelRatio = Math.max(0.85, pixelRatio - 0.2); gl.setPixelRatio(pixelRatio); resize();
            dustUniforms.uPixelRatio.value = pixelRatio;
          }
          canvas.dataset.frame = String(renderedFrames);
          canvas.dataset.progress = progress.toFixed(3);
          canvas.dataset.pixelRatio = pixelRatio.toFixed(2);
          perfFrames = 0; perfTime = 0;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (!document.hidden) { settledFrames = 0; frame = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", visibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", visibility));
    frame = requestAnimationFrame(tick);
    return { dispose };
  } catch {
    dispose();
    onFailure();
    return { dispose };
  }
}
