import * as THREE from "three";
import { seededRandom, type SourceKind } from "./journey";

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

const TAU = Math.PI * 2;
const palette = [0x9cc6d3, 0x28788b, 0x244e69, 0xd5dfd9, 0x5b939d, 0xbbae8f];

function textileMap(resources: Resources) {
  const size = 256, data = new Uint8Array(size * size * 4), random = seededRandom(83);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const over = (Math.floor(x / 16) + Math.floor(y / 16)) % 2;
      const warp = Math.sin(x / 16 * TAU), weft = Math.sin(y / 16 * TAU);
      const thread = Math.sin((over ? y : x) * Math.PI * 0.5);
      const height = 127 + (over ? warp : weft) * 46 + thread * 17 + (random() - 0.5) * 30;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = height;
      data[i + 3] = 255;
    }
  }
  const texture = resources.keep(new THREE.DataTexture(data, size, size));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(48, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** A six-ply braid, with an elliptical ribbon cross-section and separate fine fibers. */
export function makeWeave(resources: Resources, detailed: boolean) {
  const group = new THREE.Group();
  const segments = detailed ? 360 : 220, sides = 12;
  const bump = textileMap(resources);
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const center = new THREE.Vector3(), tangent = new THREE.Vector3();
  const normal = new THREE.Vector3(), binormal = new THREE.Vector3();
  const point = new THREE.Vector3(), ahead = new THREE.Vector3();

  function curve(t: number, phase: number, out: THREE.Vector3) {
    const angle = t * TAU, braid = angle * 3 + phase;
    const radius = 2.12 + 0.44 * Math.cos(braid);
    return out.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.44 * Math.sin(braid));
  }
  function frame(t: number, phase: number) {
    curve(t, phase, center);
    curve(t + 0.0001, phase, ahead);
    tangent.subVectors(ahead, center).normalize();
    normal.set(Math.cos(t * TAU), Math.sin(t * TAU), 0);
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    binormal.crossVectors(tangent, normal).normalize();
  }
  function surface(t: number, phase: number, cross: number, thickness = 1) {
    frame(t, phase);
    const twist = t * TAU * 3 + phase + 0.35 * Math.sin(t * TAU * 2);
    const w = Math.cos(cross) * 0.185 * thickness;
    const h = Math.sin(cross) * 0.068 * thickness;
    const x = w * Math.cos(twist) - h * Math.sin(twist);
    const y = w * Math.sin(twist) + h * Math.cos(twist);
    return point.copy(center).addScaledVector(normal, x).addScaledVector(binormal, y);
  }

  for (let band = 0; band < 6; band++) {
    const phase = band / 6 * TAU;
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= sides; j++) {
        const p = surface(i / segments, phase, j / sides * TAU);
        vertices.push(p.x, p.y, p.z);
        uvs.push(i / segments, j / sides);
        if (i < segments && j < sides) {
          const a = i * (sides + 1) + j, b = a + sides + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = resources.keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = resources.keep(new THREE.MeshPhysicalMaterial({
      color: palette[band], metalness: 0.28, roughness: 0.46,
      sheen: 0.8, sheenRoughness: 0.45, sheenColor: 0xcce8ea,
      clearcoat: 0.15, clearcoatRoughness: 0.4, anisotropy: 0.75,
      bumpMap: bump, bumpScale: 0.055, envMapIntensity: 0.65,
    }));
    materials.push(material);
    group.add(new THREE.Mesh(geometry, material));

    const fibers: number[] = [];
    const strands = detailed ? 18 : 10;
    for (let strand = 0; strand < strands; strand++) {
      const cross = strand / strands * TAU;
      for (let i = 0; i < segments; i++) {
        const a = surface(i / segments, phase, cross, 1.025);
        fibers.push(a.x, a.y, a.z);
        const b = surface((i + 1) / segments, phase, cross, 1.025);
        fibers.push(b.x, b.y, b.z);
      }
    }
    const fiberGeometry = resources.keep(new THREE.BufferGeometry());
    fiberGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fibers, 3));
    const fiberMaterial = resources.keep(new THREE.LineBasicMaterial({
      color: band === 5 ? 0xe6d6b6 : 0xd1ebec,
      transparent: true, opacity: band === 2 ? 0.18 : 0.24,
      depthWrite: false,
    }));
    group.add(new THREE.LineSegments(fiberGeometry, fiberMaterial));
  }
  return { group, materials };
}

function sourceTexture(resources: Resources, kind: SourceKind, answer = false) {
  const canvas = document.createElement("canvas");
  canvas.width = answer ? 768 : 384;
  canvas.height = answer ? 480 : 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures unavailable");
  const w = canvas.width, h = canvas.height, random = seededRandom(48 + kind);
  context.fillStyle = answer ? "#eaf3ed" : ["#dbe9e9", "#abcbd0", "#254f61"][kind];
  context.fillRect(0, 0, w, h);
  for (let i = 0; i < 13000; i++) {
    context.fillStyle = random() > 0.5 ? "#071e2c10" : "#ffffff1a";
    context.fillRect(random() * w, random() * h, 1, 1);
  }
  const ink = kind === 2 && !answer ? "#d5e9e6" : "#244d5c";
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = 2;
  context.strokeRect(24, 24, w - 48, h - 48);
  context.font = "500 15px Arial";
  context.fillText(answer ? "RESOLVO / AN ANSWER" : ["01 / DOCUMENT", "02 / WEB PAGE", "03 / NOTE"][kind], 48, 65);
  context.globalAlpha = 0.45;
  context.fillRect(48, 88, w - 96, 1);
  context.globalAlpha = 1;
  if (answer) {
    context.font = "36px Georgia";
    context.fillText("Clarity, with context.", 48, 156);
    for (let i = 0; i < 4; i++) {
      context.globalAlpha = 0.3 + i * 0.045;
      context.fillRect(48, 205 + i * 28, w - 116 - (i === 3 ? 230 : i * 25), 7);
    }
    context.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      context.fillStyle = "#3b8590";
      context.beginPath(); context.roundRect(48 + i * 145, 355, 126, 44, 8); context.fill();
      context.fillStyle = "#eff9f3";
      context.font = "14px Arial"; context.fillText(`SOURCE 0${i + 1}`, 66 + i * 145, 382);
    }
  } else if (kind === 1) {
    context.globalAlpha = 0.55;
    context.fillRect(48, 118, w - 96, 140);
    context.globalAlpha = 0.18;
    context.fillStyle = "#f1f7f3";
    context.beginPath(); context.arc(245, 170, 90, 0, TAU); context.fill();
    context.fillStyle = ink;
    context.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) context.fillRect(48, 295 + i * 25, w - 96 - (i % 2) * 60, 6);
  } else if (kind === 2) {
    context.globalAlpha = 0.65;
    for (let i = 0; i < 8; i++) {
      context.beginPath();
      context.moveTo(48, 135 + i * 34);
      context.bezierCurveTo(100, 110 + i * 34, 220, 155 + i * 34, 320 - (i % 3) * 32, 125 + i * 34);
      context.stroke();
    }
  } else {
    context.fillRect(48, 125, 200, 12);
    context.globalAlpha = 0.4;
    for (let i = 0; i < 10; i++) context.fillRect(48, 180 + i * 24, w - 96 - (i % 4) * 30, 5);
  }
  const texture = resources.keep(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function paperGeometry(resources: Resources, width: number, height: number) {
  const geometry = resources.keep(new THREE.PlaneGeometry(width, height, 14, 18));
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i);
    positions.setZ(i, Math.sin(x / width * Math.PI) * 0.11 + Math.cos(y / height * Math.PI) * 0.045);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export type SourceObject = {
  group: THREE.Group;
  face: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  kind: SourceKind;
  seed: number;
  orbit: THREE.Vector3;
};

export function makeSources(resources: Resources, detailed: boolean) {
  const group = new THREE.Group(), cards: SourceObject[] = [];
  const textures = [0, 1, 2].map((kind) => sourceTexture(resources, kind as SourceKind));
  const geometry = paperGeometry(resources, 0.85, 1.15);
  const random = seededRandom(204);
  const count = detailed ? 21 : 12;
  for (let i = 0; i < count; i++) {
    const kind = (i % 3) as SourceKind;
    const material = resources.keep(new THREE.MeshPhysicalMaterial({
      map: textures[kind], roughness: 0.55, metalness: 0.13,
      side: THREE.DoubleSide, clearcoat: 0.18, envMapIntensity: 0.6,
      transparent: true, depthWrite: false,
    }));
    const card = new THREE.Group();
    const face = new THREE.Mesh(geometry, material);
    face.userData.sourceKind = kind;
    card.add(face);
    const angle = i / count * TAU;
    const orbit = new THREE.Vector3(
      Math.cos(angle) * (3.6 + random() * 2),
      Math.sin(angle) * (2 + random() * 1.1),
      -0.5 - random() * 5,
    );
    card.position.copy(orbit);
    group.add(card);
    cards.push({ group: card, face, material, kind, seed: random() * TAU, orbit });
  }
  return { group, cards };
}

export function makeAnswer(resources: Resources) {
  const group = new THREE.Group();
  const geometry = paperGeometry(resources, 3.7, 2.3);
  const material = resources.keep(new THREE.MeshBasicMaterial({
    map: sourceTexture(resources, 0, true), side: THREE.DoubleSide,
    transparent: true, opacity: 0, toneMapped: false,
  }));
  group.add(new THREE.Mesh(geometry, material));
  const edgeGeometry = resources.keep(new THREE.EdgesGeometry(geometry, 12));
  const edgeMaterial = resources.keep(new THREE.LineBasicMaterial({ color: 0xa4dbd8, transparent: true, opacity: 0 }));
  group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
  return { group, material, edgeMaterial };
}

export function makeEnvironment(resources: Resources, renderer: THREE.WebGLRenderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x354b58);
  const shape = resources.keep(new THREE.PlaneGeometry(1, 1));
  const emitters = [
    { position: [0, 5, 0], scale: [10, 7], color: 0xe4f2e6, intensity: 5 },
    { position: [-5, 1, 2], scale: [4, 8], color: 0x8bc9e2, intensity: 4 },
    { position: [4, 1, -3], scale: [3, 9], color: 0x5ebdb5, intensity: 3 },
    { position: [1, -3, 4], scale: [3, 5], color: 0xd8bb8a, intensity: 1.2 },
  ];
  for (const emitter of emitters) {
    const material = resources.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(emitter.color).multiplyScalar(emitter.intensity), side: THREE.DoubleSide }));
    const panel = new THREE.Mesh(shape, material);
    panel.position.set(...emitter.position as [number, number, number]);
    panel.scale.set(emitter.scale[0], emitter.scale[1], 1);
    panel.lookAt(0, 0, 0);
    room.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const map = resources.keep(generator.fromScene(room, 0.04, 0.1, 30));
  generator.dispose();
  return map.texture;
}
