import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { seededRandom } from "./journey";
import type { EmbroideryPattern } from "./embroidery-pattern";

export class Resources {
  private items = new Set<{ dispose(): void }>();
  keep<T extends { dispose(): void }>(item: T): T {
    this.items.add(item);
    return item;
  }
  dispose() {
    for (const item of this.items) item.dispose();
    this.items.clear();
  }
}

function wovenMaps(resources: Resources) {
  const n = 256,
    heights = new Float32Array(n * n),
    color = new Uint8Array(n * n * 4),
    normal = new Uint8Array(n * n * 4),
    random = seededRandom(901);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const warp = Math.sin((x / 8) * Math.PI),
        weft = Math.sin((y / 8) * Math.PI),
        over = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      heights[y * n + x] =
        0.5 +
        0.24 * (over ? warp : weft) +
        0.08 * Math.sin((over ? y : x) * Math.PI) +
        random() * 0.08;
      const shade = 0.87 + heights[y * n + x] * 0.16 + (random() - 0.5) * 0.045,
        i = (y * n + x) * 4;
      color.set(
        [
          Math.min(255, 222 * shade),
          Math.min(255, 214 * shade),
          Math.min(255, 190 * shade),
          255,
        ],
        i,
      );
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx =
        (heights[y * n + ((x + 1) % n)] - heights[y * n + ((x + n - 1) % n)]) *
        1.6;
      const dy =
        (heights[((y + 1) % n) * n + x] - heights[((y + n - 1) % n) * n + x]) *
        1.6;
      const v = new THREE.Vector3(-dx, -dy, 1).normalize();
      normal.set(
        [
          (v.x * 0.5 + 0.5) * 255,
          (v.y * 0.5 + 0.5) * 255,
          (v.z * 0.5 + 0.5) * 255,
          255,
        ],
        (y * n + x) * 4,
      );
    }
  const make = (data: Uint8Array, srgb: boolean) => {
    const texture = resources.keep(new THREE.DataTexture(data, n, n));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 8);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  return { map: make(color, true), normalMap: make(normal, false) };
}

export function makeFabric(resources: Resources, pattern: EmbroideryPattern) {
  const group = new THREE.Group();
  const maps = wovenMaps(resources);
  const geometry = resources.keep(new THREE.PlaneGeometry(5.5, 3.65, 70, 48));
  geometry.rotateX(-Math.PI / 2);
  const attr = geometry.getAttribute("position");
  for (let i = 0; i < attr.count; i++) {
    const x = attr.getX(i),
      z = attr.getZ(i),
      edge = Math.pow(Math.max(Math.abs(x) / 2.75, Math.abs(z) / 1.825), 12);
    attr.setY(
      i,
      0.008 +
        edge * (Math.sin(x * 15 + z * 5) * 0.006 + Math.cos(z * 13) * 0.004),
    );
  }
  geometry.computeVertexNormals();
  const material = resources.keep(
    new THREE.MeshPhysicalMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.56, 0.56),
      roughness: 0.91,
      metalness: 0,
      sheen: 0.55,
      sheenColor: new THREE.Color(0xe9dec4),
      sheenRoughness: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  const cloth = new THREE.Mesh(geometry, material);
  cloth.receiveShadow = true;
  group.add(cloth);
  const frameMaterial = resources.keep(
    new THREE.MeshStandardMaterial({
      color: 0x5b5141,
      roughness: 0.5,
      metalness: 0.22,
    }),
  );
  const bars = [
    [-2.79, 0, 0, 0.1, 0.12, 3.86],
    [2.79, 0, 0, 0.1, 0.12, 3.86],
    [0, 0, -1.89, 5.67, 0.12, 0.1],
    [0, 0, 1.89, 5.67, 0.12, 0.1],
  ];
  for (const [x, y, z, w, h, d] of bars) {
    const mesh = new THREE.Mesh(
      resources.keep(new RoundedBoxGeometry(w, h, d, 2, 0.035)),
      frameMaterial,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  }
  const screws = new THREE.InstancedMesh(
    resources.keep(new THREE.CylinderGeometry(0.042, 0.042, 0.025, 12)),
    resources.keep(
      new THREE.MeshStandardMaterial({
        color: 0xb58d59,
        metalness: 0.8,
        roughness: 0.3,
      }),
    ),
    8,
  );
  resources.keep(screws);
  const temp = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    temp.position.set(
      (i % 2 ? 1 : -1) * (i < 4 ? 2.79 : 2.62),
      0.076,
      (i < 4
        ? Math.floor(i / 2) % 2
          ? 1
          : -1
        : Math.floor((i - 4) / 2) % 2
          ? 1
          : -1) * 1.88,
    );
    temp.updateMatrix();
    screws.setMatrixAt(i, temp.matrix);
  }
  screws.instanceMatrix.needsUpdate = true;
  group.add(screws);
  // The draft uses the very same contours that the needle will follow later.
  const guidePoints: number[] = [];
  pattern.guides.forEach((points) => {
    for (let i = 1; i < points.length; i++)
      guidePoints.push(
        points[i - 1][0],
        0.02,
        points[i - 1][1],
        points[i][0],
        0.02,
        points[i][1],
      );
  });
  const guideGeometry = resources.keep(new THREE.BufferGeometry());
  guideGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(guidePoints, 3),
  );
  const guideMaterial = resources.keep(
    new THREE.LineBasicMaterial({
      color: 0x496d6a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const guides = new THREE.LineSegments(guideGeometry, guideMaterial);
  group.add(guides);
  // Sparse loose fibers at the selvedge, never thousands of independent draw calls.
  const fibers: number[] = [],
    random = seededRandom(82);
  for (let i = 0; i < 260; i++) {
    const x = (random() - 0.5) * 5.45,
      z = (i % 2 ? 1 : -1) * 1.82;
    fibers.push(
      x,
      0.01,
      z,
      x + (random() - 0.5) * 0.025,
      0.012,
      z + (z > 0 ? 1 : -1) * (0.025 + random() * 0.06),
    );
  }
  const fiberGeometry = resources.keep(new THREE.BufferGeometry());
  fiberGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(fibers, 3),
  );
  group.add(
    new THREE.LineSegments(
      fiberGeometry,
      resources.keep(
        new THREE.LineBasicMaterial({
          color: 0xd3c9af,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    ),
  );
  return { group, cloth, guides, guideMaterial };
}

/** One curved thread unit. All finished stitches share it in a single instanced draw. */
function stitchGeometry(resources: Resources) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [],
    steps = 8,
    sides = 6;
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= sides; j++) {
      const t = i / steps,
        a = (j / sides) * Math.PI * 2;
      positions.push(
        t - 0.5,
        Math.sin(t * Math.PI) * 0.25 + Math.cos(a) * 0.5,
        Math.sin(a) * 0.5,
      );
      uvs.push(t, j / sides);
      if (i < steps && j < sides) {
        const q = i * (sides + 1) + j,
          r = q + sides + 1;
        indices.push(q, q + 1, r, r, q + 1, r + 1);
      }
    }
  const geometry = resources.keep(new THREE.BufferGeometry());
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeStitches(resources: Resources, pattern: EmbroideryPattern) {
  const geometry = stitchGeometry(resources),
    pixels = new Uint8Array(128 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const v =
        145 +
        Math.sin(((x / 128) * 12 + (y / 64) * 3) * Math.PI * 2) * 45 +
        Math.sin(y * 2.1) * 12;
      pixels.set([v, v, v, 255], (y * 128 + x) * 4);
    }
  const map = resources.keep(new THREE.DataTexture(pixels, 128, 64));
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  const material = resources.keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.76,
      metalness: 0,
      sheen: 0.3,
      sheenColor: new THREE.Color(0x8a9c8e),
      sheenRoughness: 0.7,
      bumpMap: map,
      bumpScale: 0.004,
    }),
  );
  const mesh = resources.keep(
    new THREE.InstancedMesh(geometry, material, pattern.stitches.length),
  );
  const temp = new THREE.Object3D(),
    color = new THREE.Color();
  pattern.stitches.forEach((stitch, i) => {
    const dx = stitch.b[0] - stitch.a[0],
      dz = stitch.b[1] - stitch.a[1],
      length = Math.hypot(dx, dz);
    temp.position.set(
      (stitch.a[0] + stitch.b[0]) * 0.5,
      0.008 + stitch.width * 0.35 + Math.max(0, stitch.height - 0.018) * 2.5,
      (stitch.a[1] + stitch.b[1]) * 0.5,
    );
    temp.rotation.set(0, -Math.atan2(dz, dx), 0);
    // Thread flattens under tension; each fill layer clears the one beneath it.
    temp.scale.set(length, stitch.width * 0.8, stitch.width * 2);
    temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
    mesh.setColorAt(i, color.setHex(stitch.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, material };
}

export function studioEnvironment(
  resources: Resources,
  renderer: THREE.WebGLRenderer,
) {
  const environment = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const target = resources.keep(generator.fromScene(environment, 0.04));
  environment.dispose();
  generator.dispose();
  return target.texture;
}

export function makeThread(resources: Resources) {
  const segments = 40,
    sides = 5,
    positions = new Float32Array((segments + 1) * (sides + 1) * 3),
    normals = new Float32Array(positions.length),
    indices: number[] = [];
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geometry = resources.keep(new THREE.BufferGeometry());
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setIndex(indices);
  const material = resources.keep(
    new THREE.MeshStandardMaterial({
      color: 0x4e9f9e,
      roughness: 0.45,
      metalness: 0.18,
    }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 5 }, () => new THREE.Vector3()),
  );
  const position = new THREE.Vector3(),
    tangent = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    binormal = new THREE.Vector3(),
    up = new THREE.Vector3(0, 0, 1);
  function update(points: THREE.Vector3[], radius = 0.008) {
    points.forEach((p, i) => curve.points[i].copy(p));
    for (let i = 0; i <= segments; i++) {
      curve.getPoint(i / segments, position);
      curve.getTangent(i / segments, tangent);
      normal.crossVectors(tangent, up).normalize();
      if (normal.lengthSq() < 0.1) normal.set(1, 0, 0);
      binormal.crossVectors(tangent, normal).normalize();
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2,
          nx = normal.x * Math.cos(a) + binormal.x * Math.sin(a),
          ny = normal.y * Math.cos(a) + binormal.y * Math.sin(a),
          nz = normal.z * Math.cos(a) + binormal.z * Math.sin(a),
          k = (i * (sides + 1) + j) * 3;
        positions[k] = position.x + nx * radius;
        positions[k + 1] = position.y + ny * radius;
        positions[k + 2] = position.z + nz * radius;
        normals[k] = nx;
        normals[k + 1] = ny;
        normals[k + 2] = nz;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
  }
  return { mesh, material, update };
}
