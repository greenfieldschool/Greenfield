import * as THREE from "three";
import { seeded } from "./hooks";

// Textures and shapes for the leaf and tree scenes. Everything is drawn in the browser on a canvas, so there is nothing
// extra to download. Each texture is made once per page and shared by every scene.

let leafMap: THREE.CanvasTexture | null = null;
let barkMap: THREE.CanvasTexture | null = null;

function canvasTexture(canvas: HTMLCanvasElement, srgb: boolean) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A single leaf, pointing up, on a see-through background: blade, stem, midrib and side veins, darker edges and a
 * few blotches. It is drawn in pale greys (veins lightest) so each leaf can be tinted its own green or gold (instance colour).
 * Use it as both `map` and `bumpMap`, so the veins stand out under the light.
 */
export function leafTexture() {
  if (leafMap) return leafMap;
  const w = 256;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(31);
  const base = h * 0.86;
  const tip = h * 0.03;

  const blade = new Path2D();
  blade.moveTo(w / 2, base);
  blade.bezierCurveTo(w * 1.02, h * 0.7, w * 0.9, h * 0.22, w / 2, tip);
  blade.bezierCurveTo(w * 0.1, h * 0.22, w * -0.02, h * 0.7, w / 2, base);

  // Stem
  ctx.strokeStyle = "#d8ceb2";
  ctx.lineCap = "round";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.985);
  ctx.quadraticCurveTo(w * 0.52, h * 0.92, w / 2, base - 4);
  ctx.stroke();

  ctx.save();
  ctx.clip(blade);
  // Lighter along the middle, slightly warm and darker towards the edges.
  const fill = ctx.createLinearGradient(0, 0, w, 0);
  fill.addColorStop(0, "#b3aa8a");
  fill.addColorStop(0.3, "#d9d5c3");
  fill.addColorStop(0.5, "#e6e3d4");
  fill.addColorStop(0.7, "#d9d5c3");
  fill.addColorStop(1, "#b3aa8a");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  const lengthwise = ctx.createLinearGradient(0, tip, 0, base);
  lengthwise.addColorStop(0, "rgba(120,110,70,0.18)");
  lengthwise.addColorStop(0.35, "rgba(255,255,255,0)");
  lengthwise.addColorStop(1, "rgba(60,60,30,0.12)");
  ctx.fillStyle = lengthwise;
  ctx.fillRect(0, 0, w, h);

  // Blotches: real leaves are never one flat colour.
  for (let i = 0; i < 70; i++) {
    const x = rand() * w;
    const y = tip + rand() * (base - tip);
    const r = 4 + rand() * 18;
    ctx.fillStyle = rand() < 0.5 ? `rgba(70,60,30,${0.03 + rand() * 0.05})` : `rgba(255,255,240,${0.04 + rand() * 0.06})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Side veins, curving out and up from the midrib.
  ctx.strokeStyle = "rgba(255,255,240,0.8)";
  for (let k = 0; k < 9; k++) {
    const y0 = base - 30 - k * ((base - tip - 70) / 9);
    const reach = Math.sin(((y0 - tip) / (base - tip)) * Math.PI) * w * 0.42;
    for (const side of [-1, 1]) {
      ctx.lineWidth = 2.6 - k * 0.14;
      ctx.beginPath();
      ctx.moveTo(w / 2, y0);
      ctx.quadraticCurveTo(w / 2 + side * reach * 0.5, y0 - 12, w / 2 + side * reach, y0 - 44 - rand() * 10);
      ctx.stroke();
    }
  }
  // Midrib, thick at the stem and thin at the tip.
  ctx.strokeStyle = "rgba(255,255,240,0.95)";
  for (let s = 0; s < 12; s++) {
    const a = s / 12;
    const b = (s + 1) / 12;
    ctx.lineWidth = 6 * (1 - a) + 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, base - a * (base - tip));
    ctx.lineTo(w / 2, base - b * (base - tip));
    ctx.stroke();
  }
  // Darker rim.
  ctx.strokeStyle = "rgba(60,50,20,0.25)";
  ctx.lineWidth = 7;
  ctx.stroke(blade);
  ctx.restore();

  leafMap = canvasTexture(canvas, true);
  return leafMap;
}

/** Bark: brown with long vertical cracks and streaks. Repeats around and along a branch. */
export function barkTexture() {
  if (barkMap) return barkMap;
  const w = 128;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(53);
  ctx.fillStyle = "#6b4a33";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 30 + rand() * 140;
    const light = rand() < 0.45;
    ctx.strokeStyle = light ? `rgba(160,125,95,${0.15 + rand() * 0.25})` : `rgba(30,18,10,${0.25 + rand() * 0.35})`;
    ctx.lineWidth = light ? 1 + rand() * 3 : 1 + rand() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 10, y + len * 0.33, x + (rand() - 0.5) * 10, y + len * 0.66, x + (rand() - 0.5) * 8, y + len);
    ctx.stroke();
  }
  // Soft moss-green patches.
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(90,110,50,${0.06 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 6 + rand() * 14, 14 + rand() * 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  barkMap = canvasTexture(canvas, true);
  barkMap.wrapS = THREE.RepeatWrapping;
  barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.repeat.set(2, 1);
  return barkMap;
}

/**
 * A leaf-shaped card (1 tall × 0.5 wide, stem at the bottom) folded along the midrib and curled along its length, so
 * it catches the light like a real leaf instead of a flat cut-out. The outline comes from the texture's transparency.
 */
export function leafCardGeometry({ segments = 6, pivot = "stem" }: { segments?: number; pivot?: "stem" | "centre" } = {}) {
  const g = new THREE.PlaneGeometry(0.5, 1, 4, segments);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i) + 0.5; // 0 at the stem, 1 at the tip
    const fold = Math.abs(x) * 0.25; // sides lift a little either side of the midrib
    const curl = 0.16 * y * y; // tip curls back
    pos.setZ(i, fold - curl);
  }
  // "stem": the stem at the origin, so a leaf on a branch hangs from where it grows. "centre": spins about its middle.
  if (pivot === "stem") g.translate(0, 0.5, 0);
  g.computeVertexNormals();
  return g;
}

/** Leaf material: textured, veins raised, outline cut from the texture, lit on both sides. */
export function leafMaterial() {
  const map = leafTexture();
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: map,
    bumpScale: 2,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0
  });
}

/** Natural leaf colours: fresh and deep greens with some yellow-green, gold and a few autumn ones. */
export const LEAF_GREENS = ["#4E8F3A", "#3F7A35", "#6FA544", "#2F6B3A", "#5C9A4A", "#88B04B"];
export const LEAF_GOLDS = ["#D9A72B", "#E5BE47", "#C98A2A", "#B8742A"];

let petalMap: THREE.CanvasTexture | null = null;

/**
 * A hibiscus petal (base at the bottom centre): a deep crimson eye at the base, warming through orange to gold, with
 * a ruffled rim and fine veins fanning out. Five of them make a flower.
 */
export function petalTexture() {
  if (petalMap) return petalMap;
  const w = 256;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(71);
  const bx = w / 2;
  const by = h * 0.98;

  const shape = new Path2D();
  shape.moveTo(bx, by);
  shape.bezierCurveTo(w * 0.18, h * 0.8, w * -0.02, h * 0.4, w * 0.1, h * 0.16);
  // Ruffled outer rim, left to right.
  let px = w * 0.1;
  let py = h * 0.16;
  const bumps = 7;
  for (let i = 1; i <= bumps; i++) {
    const u = i / bumps;
    const x = w * (0.1 + 0.8 * u);
    const y = h * (0.16 - 0.13 * Math.sin(Math.PI * u));
    shape.quadraticCurveTo((px + x) / 2, (py + y) / 2 - h * (0.03 + rand() * 0.02), x, y);
    px = x;
    py = y;
  }
  shape.bezierCurveTo(w * 1.02, h * 0.4, w * 0.82, h * 0.8, bx, by);

  ctx.save();
  ctx.clip(shape);
  const fill = ctx.createRadialGradient(bx, by, 0, bx, by, h * 0.95);
  fill.addColorStop(0, "#4a0613");
  fill.addColorStop(0.2, "#8e1024");
  fill.addColorStop(0.32, "#c8461c");
  fill.addColorStop(0.46, "#e99a1f");
  fill.addColorStop(0.8, "#f5c43c");
  fill.addColorStop(1, "#f9da74");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  // Veins fanning out from the base.
  for (let i = 0; i < 36; i++) {
    const a = -Math.PI / 2 + (i / 35 - 0.5) * 2.1;
    const len = h * (0.7 + rand() * 0.25);
    ctx.strokeStyle = i % 2 ? "rgba(255,245,210,0.22)" : "rgba(140,50,10,0.14)";
    ctx.lineWidth = 1 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 10, by + Math.sin(a) * len * 0.5, bx + Math.cos(a) * len, by + Math.sin(a) * len);
    ctx.stroke();
  }
  // A paler, thinner rim where light passes through.
  ctx.strokeStyle = "rgba(255,250,225,0.35)";
  ctx.lineWidth = 6;
  ctx.stroke(shape);
  ctx.restore();

  petalMap = canvasTexture(canvas, true);
  return petalMap;
}

/** A petal card (0.5 × 0.5, base at the origin): cupped at the base, the tip curling back, the rim gently waved. */
export function petalGeometry() {
  const g = new THREE.PlaneGeometry(0.5, 0.5, 8, 8);
  g.translate(0, 0.25, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 0.25; // -1..1 across
    const v = pos.getY(i) / 0.5; // 0 at the base, 1 at the rim
    const cup = 0.08 * x * x * (1 - v * 0.6);
    const curl = -0.12 * v * v * v;
    const ruffle = 0.015 * Math.sin(x * Math.PI * 3.5) * v ** 4;
    pos.setZ(i, cup + curl + ruffle);
  }
  g.computeVertexNormals();
  return g;
}

/** Petal material: soft velvet sheen, outline cut from the texture, lit on both sides. */
export function petalMaterial() {
  return new THREE.MeshPhysicalMaterial({
    map: petalTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.5,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#ffd27a")
  });
}
