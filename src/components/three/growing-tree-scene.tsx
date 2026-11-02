"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, PerformanceMonitor, Sparkles } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { seeded } from "./hooks";
import { LEAF_GOLDS, LEAF_GREENS, barkTexture, leafCardGeometry, leafMaterial, petalGeometry, petalMaterial } from "./nature";

/*
 * The "three stages" scene, driven by scroll (progress 0..1):
 *   Creche     a hibiscus bud opens into a full bloom; the camera is close.
 *   Primary    the petals fall onto the grass, the flower bows back into the ground and a sapling rises from the same
 *              spot, branching out as the camera pulls back.
 *   Secondary  the crown fills in and the tree flowers: the same hibiscus, many times over.
 */

type Growth = { p: number };

/**
 * "hero": the first screen. Only the flower on its mound against deep green, from bud to full bloom, with pollen in
 * the air; the camera moves in as it opens and follows the mouse a little. `frame` moves the flower in the picture
 * (x: right of centre on desktop so the headline has room; y: higher on phones, where the text sits below).
 * "stages": the whole story, flower → falling petals → tree in flower, with the camera pulling back.
 */
export type SceneVariant = "hero" | "stages";
// yBloom: where the flower sits once it is fully open (on phones the headline has gone by then, so it moves to the
// middle); the frame eases from y to yBloom as it opens. Leave it out to keep y.
export type SceneFrame = { x: number; y: number; yBloom?: number };

type Segment = {
  start: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
  t0: number;
  t1: number;
};

// t1: when a first leaf on the young trunk falls away again (the crown has taken over by then).
type LeafSpot = { pos: THREE.Vector3; turn: THREE.Quaternion; t0: number; t1?: number; size: number; color: THREE.Color; phase: number };

type Blossom = { pos: THREE.Vector3; turn: THREE.Quaternion; t0: number; size: number; phase: number };

type Blade = { x: number; y: number; z: number; yaw: number; lean: number; height: number; phase: number };

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const GROUND_Y = -1.68;
const MOUND = { radius: 0.95, height: 0.16 };
const PETALS = 5;
const SPOKES = Array.from({ length: PETALS }, (_, k) => new THREE.Quaternion().setFromAxisAngle(UP, (k / PETALS) * Math.PI * 2));

// When each part happens on the 0..1 scroll timeline.
const BLOOM = [0.1, 0.3] as const; // bud opens
const PETAL_FALL = { start: 0.32, gap: 0.02, length: 0.1 }; // petals drop one after another
const WILT = [0.42, 0.56] as const; // the flower bows and goes back into the ground
const TREE = [0.42, 0.98] as const; // the tree's own 0..1 growth happens in this window
const CAMERA = [0.28, 0.78] as const; // close on the flower → whole tree

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

function moundY(x: number, z: number) {
  const r = Math.hypot(x, z);
  return GROUND_Y + MOUND.height * Math.sqrt(Math.max(0, 1 - (r / MOUND.radius) ** 2));
}

/** Points a leaf's stem→tip along `dir`, turned a random amount about it. */
function leafTurn(dir: THREE.Vector3, roll: number) {
  return new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
}

/** Sets a petal's rotation on a flower: around the centre (spoke), opened out by `tilt`, twisted while in bud. */
function petalQuat(out: THREE.Quaternion, base: THREE.Quaternion, spoke: THREE.Quaternion, tilt: number, twist: number, tmp: THREE.Quaternion) {
  out.copy(base).multiply(spoke);
  out.multiply(tmp.setFromAxisAngle(X_AXIS, tilt));
  out.multiply(tmp.setFromAxisAngle(UP, twist));
  return out;
}

/**
 * Builds a deterministic tree. Each segment and leaf gets a growth window (t0..t1) on the tree's own 0..1
 * timeline: the trunk sprouts first, branches spread, the crown and its blossoms fill in last.
 * `lite` (phones): one level of branching less, with fewer, larger leaves, so it looks as full for a third of the work.
 */
function buildTree(lite: boolean) {
  const MAX_DEPTH = lite ? 5 : 6;
  const leafScale = lite ? 1.3 : 1;
  const rand = seeded(2024);
  const segments: Segment[] = [];
  const leaves: LeafSpot[] = [];
  const blossoms: Blossom[] = [];
  const greens = LEAF_GREENS.map((c) => new THREE.Color(c));
  const golds = LEAF_GOLDS.map((c) => new THREE.Color(c));
  const tint = (pool: THREE.Color[]) =>
    pool[Math.floor(rand() * pool.length)].clone().offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.08);

  function addLeaf(at: THREE.Vector3, outward: THREE.Vector3, t0: number, size: number, gold: boolean, t1?: number) {
    // Leaves point outward and droop a little under their own weight.
    const dir = outward.clone().normalize().add(new THREE.Vector3(rand() - 0.5, rand() * 0.6 - 0.45, rand() - 0.5).multiplyScalar(0.9)).normalize();
    leaves.push({ pos: at, turn: leafTurn(dir, rand() * Math.PI * 2), t0, t1, size, color: tint(gold ? golds : greens), phase: rand() * Math.PI * 2 });
  }

  function grow(start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number, t0: number) {
    const span = depth === 0 ? 0.24 : 0.16 - depth * 0.012;
    const t1 = Math.min(t0 + span, 0.97);
    segments.push({ start: start.clone(), dir: dir.clone(), length, radius, t0, t1 });
    const end = start.clone().addScaledVector(dir, length);

    if (depth >= MAX_DEPTH) {
      // A spray of leaves at each twig tip.
      const count = lite ? 9 + Math.floor(rand() * 5) : 12 + Math.floor(rand() * 7);
      for (let i = 0; i < count; i++) {
        const offset = new THREE.Vector3(rand() - 0.5, rand() - 0.35, rand() - 0.5).multiplyScalar(0.7);
        const gold = rand() < 0.08;
        const at = end.clone().add(offset);
        const outward = at.clone().sub(new THREE.Vector3(0, 0.4, 0)).normalize().add(dir);
        addLeaf(at, outward, Math.min(t1 - 0.04 + rand() * 0.08 + (gold ? 0.08 : 0), 0.96), (gold ? 0.2 + rand() * 0.07 : 0.24 + rand() * 0.12) * leafScale, gold);
      }
      // Some twigs flower once the tree is grown.
      if (rand() < (lite ? 0.6 : 0.42)) {
        const at = end.clone().add(new THREE.Vector3(rand() - 0.5, rand() * 0.4, rand() - 0.5).multiplyScalar(0.5));
        const facing = at.clone().sub(new THREE.Vector3(0, 0.6, 0)).normalize().add(new THREE.Vector3(0, 0.5, 0)).normalize();
        blossoms.push({ pos: at, turn: leafTurn(facing, rand() * Math.PI * 2), t0: 0.84 + rand() * 0.1, size: 0.32 + rand() * 0.14, phase: rand() * Math.PI * 2 });
      }
      return;
    }

    const children = depth === 0 ? 3 : 2 + (rand() < 0.45 ? 1 : 0);
    for (let i = 0; i < children; i++) {
      const angle = (i / children) * Math.PI * 2 + rand() * 0.9;
      const tilt = 0.45 + rand() * 0.35 + depth * 0.04;
      const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const childDir = dir.clone().applyAxisAngle(axis, tilt).normalize();
      childDir.y = Math.max(childDir.y, 0.15);
      childDir.normalize();
      grow(end, childDir, length * (0.68 + rand() * 0.12), radius * 0.66, depth + 1, t1 - 0.02);
    }

    // First leaves on the sapling, so it looks young rather than bare. They drop as the crown fills in.
    if (depth <= 1) {
      const first = depth === 0 ? 7 : 5;
      for (let i = 0; i < first; i++) {
        const at = start.clone().addScaledVector(dir, length * (0.7 + rand() * 0.3));
        const side = new THREE.Vector3(Math.cos(i * 2.4), 0.6, Math.sin(i * 2.4));
        addLeaf(at, side, t0 + span * (0.4 + rand() * 0.4), 0.32 + rand() * 0.1, false, 0.55 + rand() * 0.15);
      }
    }

    // A few leaves along the way so the young tree already looks alive.
    if (depth >= 2) {
      for (let i = 0; i < 3; i++) {
        const at = start.clone().addScaledVector(dir, length * (0.5 + rand() * 0.5));
        const side = new THREE.Vector3(rand() - 0.5, 0.2, rand() - 0.5);
        addLeaf(at, side, t1 - 0.02 + rand() * 0.04, 0.2 + rand() * 0.08, false);
      }
    }
  }

  grow(new THREE.Vector3(0, -1.6, 0), UP.clone(), 1.25, 0.16, 0, 0.02);
  return { segments, leaves, blossoms };
}

/** Grass blades on the mound around the trunk. */
function buildGrass(count: number) {
  const rand = seeded(97);
  const blades: Blade[] = [];
  for (let i = 0; i < count; i++) {
    const r = MOUND.radius * Math.sqrt(0.04 + rand() * 0.9);
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    blades.push({ x, y: moundY(x, z) - 0.01, z, yaw: rand() * Math.PI * 2, lean: (rand() - 0.5) * 0.5, height: 0.6 + rand() * 0.7, phase: rand() * Math.PI * 2 });
  }
  return blades;
}

function bladeGeometry() {
  const g = new THREE.PlaneGeometry(0.022, 0.2, 1, 4);
  g.translate(0, 0.1, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 0.2; // 0 at the root, 1 at the tip
    pos.setX(i, pos.getX(i) * (1 - y * 0.9)); // narrows to a point
    pos.setZ(i, 0.05 * y * y); // bends over
  }
  g.computeVertexNormals();
  return g;
}

/** Eases the scroll position so every part of the scene moves smoothly together. */
function Smooth({ progress, growth }: { progress: { current: number }; growth: Growth }) {
  useFrame((_, delta) => {
    growth.p = THREE.MathUtils.damp(growth.p, progress.current, 3.5, delta);
  });
  return null;
}

/** Stages: starts close on the flower and pulls back to the whole tree. Hero: moves in as the bud opens. */
function CameraRig({ growth, variant, frame }: { growth: Growth; variant: SceneVariant; frame: SceneFrame }) {
  const look = useMemo(() => new THREE.Vector3(), []);
  const lean = useMemo(() => new THREE.Vector2(), []);
  // Only a mouse moves the camera: on a touch screen the "pointer" is wherever the finger scrolls, which would drag
  // the flower off centre.
  const mouse = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches, []);
  useFrame(({ camera, pointer, size }) => {
    if (variant === "hero") {
      const t = smooth(BLOOM[0] - 0.04, BLOOM[1], growth.p);
      // A slow drift towards the mouse.
      if (mouse) lean.lerp(pointer, 0.04);
      const frameY = THREE.MathUtils.lerp(frame.y, frame.yBloom ?? frame.y, t);
      // Tall, narrow screens (phones) see less from side to side, so the camera stands further back.
      const fit = Math.pow(Math.max(1, 0.9 / (size.width / size.height)), 0.6);
      const z = THREE.MathUtils.lerp(3.5, 2.35, t) * fit;
      camera.position.set(frame.x + lean.x * 0.3, THREE.MathUtils.lerp(-0.25, -0.45, t) + lean.y * 0.12, z);
      look.set(frame.x, THREE.MathUtils.lerp(-0.95, -0.9, t) + frameY, 0);
    } else {
      const c = smooth(CAMERA[0], CAMERA[1], growth.p);
      // The crown is wider than it is tall: on narrow pictures (phone stories) step back so it fits side to side.
      const fit = Math.pow(Math.max(1, 1 / (size.width / size.height)), 0.85);
      camera.position.set(0, THREE.MathUtils.lerp(-0.15, 0.9, c), THREE.MathUtils.lerp(3.3, 8 * fit, c));
      look.set(0, THREE.MathUtils.lerp(-0.85, 0.9, c), 0);
    }
    camera.lookAt(look);
  });
  return null;
}

/** The soil mound and its grass, swaying in the breeze. */
function Ground({ lite }: { lite: boolean }) {
  const blades = useMemo(() => buildGrass(lite ? 200 : 420), [lite]);
  const grassMesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const grassGeo = useMemo(bladeGeometry, []);
  const grassColors = useMemo(() => {
    const rand = seeded(5);
    const arr = new Float32Array(blades.length * 3);
    const c = new THREE.Color();
    blades.forEach((_, i) => {
      c.set(LEAF_GREENS[Math.floor(rand() * LEAF_GREENS.length)]).offsetHSL(0, 0, (rand() - 0.5) * 0.1);
      c.toArray(arr, i * 3);
    });
    return arr;
  }, [blades]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const wind = 0.6 + 0.4 * Math.sin(t * 0.5) * Math.sin(t * 0.17 + 1);
    if (group.current) group.current.rotation.y = t * 0.12;
    if (!grassMesh.current) return;
    blades.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.lean + wind * 0.12 * Math.sin(t * 1.7 + b.phase + b.x * 2), b.yaw, 0);
      dummy.scale.set(1, b.height, 1);
      dummy.updateMatrix();
      grassMesh.current!.setMatrixAt(i, dummy.matrix);
    });
    grassMesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh position={[0, GROUND_Y, 0]} scale={[1, MOUND.height / MOUND.radius, 1]}>
        <sphereGeometry args={[MOUND.radius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3D2B1F" roughness={1} />
      </mesh>
      <instancedMesh ref={grassMesh} args={[grassGeo, undefined, blades.length]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[grassColors, 3]} />
        <meshStandardMaterial side={THREE.DoubleSide} roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

// The flower: a stem from the top of the mound, the head tilted towards the viewer.
const STEM_ROOT = new THREE.Vector3(0, GROUND_Y + MOUND.height - 0.02, 0);
const STEM_CURVE = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0.03, 0.24, 0.01),
  new THREE.Vector3(-0.02, 0.49, 0.03),
  new THREE.Vector3(0.01, 0.72, 0.06)
];
const HEAD_AT = STEM_CURVE[STEM_CURVE.length - 1];
const HEAD_TURN = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0, 0.05));

function Flower({ growth, petalGeo, petalMat }: { growth: Growth; petalGeo: THREE.BufferGeometry; petalMat: THREE.Material }) {
  const root = useRef<THREE.Group>(null);
  const column = useRef<THREE.Group>(null);
  const petals = useRef<THREE.InstancedMesh>(null);
  const sepals = useRef<THREE.InstancedMesh>(null);
  const stemLeaves = useRef<THREE.InstancedMesh>(null);

  const stemGeo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(STEM_CURVE), 24, 0.022, 8, false), []);
  const leafGeo = useMemo(() => leafCardGeometry({ segments: 4 }), []);
  const leafMat = useMemo(leafMaterial, []);
  const greenColors = useMemo(() => {
    const arr = new Float32Array(7 * 3);
    const c = new THREE.Color();
    for (let i = 0; i < 7; i++) c.set(i < 5 ? "#3F7A35" : "#4E8F3A").toArray(arr, i * 3);
    return arr;
  }, []);

  // Where each petal comes to rest on the mound when it falls.
  const landing = useMemo(() => {
    const rand = seeded(41);
    return Array.from({ length: PETALS }, (_, k) => {
      const a = (k / PETALS) * Math.PI * 2 + rand() * 0.8;
      const r = 0.22 + rand() * 0.35;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r + 0.15;
      return {
        pos: new THREE.Vector3(x, moundY(x, z) + 0.012, z),
        turn: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (rand() - 0.5) * 0.3, rand() * Math.PI * 2, 0, "YXZ")),
        side: rand() < 0.5 ? -1 : 1
      };
    });
  }, []);

  // Scratch objects for the per-frame maths (nothing is created while animating).
  const tmp = useMemo(
    () => ({
      rootQ: new THREE.Quaternion(),
      headQ: new THREE.Quaternion(),
      headPos: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      pos: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      euler: new THREE.Euler()
    }),
    []
  );

  // Sepals cup the bloom; two leaves on the stem. They don't move relative to their parent.
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    for (let k = 0; k < 5; k++) {
      // Between the petals and tilted further back than them, so they sit behind the bloom.
      d.position.set(0, -0.03, 0);
      d.quaternion.setFromAxisAngle(UP, ((k + 0.5) / PETALS) * Math.PI * 2).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, 1.6));
      d.scale.setScalar(0.15);
      d.updateMatrix();
      sepals.current?.setMatrixAt(k, d.matrix);
    }
    if (sepals.current) sepals.current.instanceMatrix.needsUpdate = true;
    const stemLeafSpots: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(0.025, 0.22, 0.01), new THREE.Vector3(1, 0.7, 0.2)],
      [new THREE.Vector3(-0.01, 0.42, 0.025), new THREE.Vector3(-1, 0.8, -0.1)]
    ];
    stemLeafSpots.forEach(([at, dir], i) => {
      d.position.copy(at);
      d.quaternion.copy(leafTurn(dir, i * 1.3));
      d.scale.setScalar(0.34);
      d.updateMatrix();
      stemLeaves.current?.setMatrixAt(i, d.matrix);
    });
    if (stemLeaves.current) stemLeaves.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    const p = growth.p;
    const t = clock.getElapsedTime();
    const bloom = smooth(BLOOM[0], BLOOM[1], p);
    const wilt = smooth(WILT[0], WILT[1], p);

    // Stem and head: sway in the breeze, then bow and sink back into the ground.
    const sway = 0.03 * Math.sin(t * 0.9) + 0.015 * Math.sin(t * 2.1);
    tmp.euler.set(wilt * 0.35, 0, sway + wilt * 0.9);
    tmp.rootQ.setFromEuler(tmp.euler);
    const shrink = Math.max(1 - wilt, 0.0001);
    if (root.current) {
      root.current.visible = wilt < 1;
      root.current.quaternion.copy(tmp.rootQ);
      root.current.scale.setScalar(shrink);
    }
    if (column.current) column.current.scale.set(1, 0.3 + 0.7 * bloom, 1);

    // The head's place in the world, for the petals (which are drawn in world space so they can fall).
    tmp.headPos.copy(HEAD_AT).multiplyScalar(shrink).applyQuaternion(tmp.rootQ).add(STEM_ROOT);
    tmp.headQ.copy(tmp.rootQ).multiply(HEAD_TURN);

    if (petals.current) {
      for (let k = 0; k < PETALS; k++) {
        const open = 0.12 + (1.12 + 0.06 * Math.sin(k * 1.7)) * bloom + 0.03 * bloom * Math.sin(t * 1.2 + k);
        const twist = (1 - bloom) * 0.7;
        const size = (0.55 + 0.45 * bloom) * shrink;
        petalQuat(tmp.q, tmp.headQ, SPOKES[k], open, twist, tmp.q2);
        const fall = THREE.MathUtils.clamp((p - (PETAL_FALL.start + k * PETAL_FALL.gap)) / PETAL_FALL.length, 0, 1);
        if (fall > 0) {
          const land = landing[k];
          const e = fall * fall * (3 - 2 * fall);
          tmp.pos.lerpVectors(tmp.headPos, land.pos, e);
          // Drifts from side to side on the way down, then settles flat.
          tmp.pos.x += land.side * Math.sin(fall * Math.PI * 2.5) * 0.18 * (1 - fall);
          tmp.pos.y += Math.sin(fall * Math.PI) * 0.06;
          tmp.q.slerp(land.turn, e);
          tmp.q.multiply(tmp.q2.setFromAxisAngle(X_AXIS, Math.sin(fall * Math.PI * 4) * 0.5 * (1 - fall)));
          tmp.scale.setScalar(0.55 + 0.45 * bloom);
        } else {
          tmp.pos.copy(tmp.headPos);
          tmp.scale.setScalar(size);
        }
        tmp.m.compose(tmp.pos, tmp.q, tmp.scale);
        petals.current.setMatrixAt(k, tmp.m);
      }
      petals.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <group ref={root} position={STEM_ROOT}>
        <mesh geometry={stemGeo}>
          <meshStandardMaterial color="#4E7F35" roughness={0.6} />
        </mesh>
        <instancedMesh ref={stemLeaves} args={[leafGeo, leafMat, 2]}>
          <instancedBufferAttribute attach="instanceColor" args={[greenColors.slice(15), 3]} />
        </instancedMesh>
        <group position={HEAD_AT} quaternion={HEAD_TURN}>
          {/* Receptacle and sepals */}
          <mesh scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.045, 16, 12]} />
            <meshStandardMaterial color="#3F7A35" roughness={0.6} />
          </mesh>
          <instancedMesh ref={sepals} args={[leafGeo, leafMat, 5]}>
            <instancedBufferAttribute attach="instanceColor" args={[greenColors.slice(0, 15), 3]} />
          </instancedMesh>
          {/* The hibiscus's long central column: pollen along the top, five red stigma pads at the tip. */}
          <group ref={column}>
            <mesh position={[0, 0.2, 0]}>
              <cylinderGeometry args={[0.008, 0.014, 0.4, 8]} />
              <meshStandardMaterial color="#F3C9B5" roughness={0.5} />
            </mesh>
            {Array.from({ length: 14 }, (_, i) => {
              const a = i * 2.4;
              const y = 0.26 + (i / 14) * 0.12;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.022, y, Math.sin(a) * 0.022]}>
                  <sphereGeometry args={[0.011, 8, 6]} />
                  <meshStandardMaterial color="#F2B61F" roughness={0.7} />
                </mesh>
              );
            })}
            {Array.from({ length: 5 }, (_, i) => {
              const a = (i / 5) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.018, 0.415, Math.sin(a) * 0.018]}>
                  <sphereGeometry args={[0.013, 8, 6]} />
                  <meshStandardMaterial color="#B3132B" roughness={0.5} />
                </mesh>
              );
            })}
          </group>
        </group>
      </group>
      <instancedMesh ref={petals} args={[petalGeo, petalMat, PETALS]} frustumCulled={false} />
    </>
  );
}

function Tree({ growth, petalGeo, petalMat, lite }: { growth: Growth; petalGeo: THREE.BufferGeometry; petalMat: THREE.Material; lite: boolean }) {
  const { segments, leaves, blossoms } = useMemo(() => buildTree(lite), [lite]);
  const branchMesh = useRef<THREE.InstancedMesh>(null);
  const leafMesh = useRef<THREE.InstancedMesh>(null);
  const blossomMesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const crown = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const flutter = useMemo(() => new THREE.Quaternion(), []);
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), s: new THREE.Vector3(), m: new THREE.Matrix4() }), []);

  const branchGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.62, 1, 1, 10, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const barkMat = useMemo(() => {
    const map = barkTexture();
    return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 3, roughness: 0.95 });
  }, []);
  const leafGeo = useMemo(() => leafCardGeometry({ segments: 3 }), []);
  const leafMat = useMemo(leafMaterial, []);
  const leafColors = useMemo(() => {
    const arr = new Float32Array(leaves.length * 3);
    leaves.forEach((l, i) => l.color.toArray(arr, i * 3));
    return arr;
  }, [leaves]);
  // Blossoms start hidden (an instance is drawn full size at the centre until it is placed).
  useLayoutEffect(() => {
    const mesh = blossomMesh.current;
    if (!mesh) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const settled = useRef(false);

  useFrame(({ clock }) => {
    const p = THREE.MathUtils.clamp((growth.p - TREE[0]) / (TREE[1] - TREE[0]), 0, 1);
    // Before the sapling appears nothing in the tree changes: draw it (all hidden) once, then skip the work.
    if (p === 0 && settled.current) return;
    settled.current = p === 0;
    const t = clock.getElapsedTime();
    // A breeze that comes and goes.
    const wind = 0.6 + 0.4 * Math.sin(t * 0.5) * Math.sin(t * 0.17 + 1);
    if (group.current) group.current.rotation.y = t * 0.12;
    if (crown.current) {
      crown.current.rotation.z = 0.012 * wind * Math.sin(t * 0.9);
      crown.current.rotation.x = 0.008 * wind * Math.sin(t * 0.7 + 1);
    }

    if (branchMesh.current) {
      // Wood thickens as the tree ages, so the sapling starts slender.
      const girth = 0.3 + 0.7 * smooth(0, 0.9, p);
      segments.forEach((s, i) => {
        const g = THREE.MathUtils.clamp((p - s.t0) / (s.t1 - s.t0), 0, 1);
        const eased = 1 - Math.pow(1 - g, 3);
        quat.setFromUnitVectors(UP, s.dir);
        dummy.position.copy(s.start);
        dummy.quaternion.copy(quat);
        const r = s.radius * (0.35 + 0.65 * eased) * girth;
        dummy.scale.set(g > 0 ? r : 0.0001, Math.max(s.length * eased, 0.0001), g > 0 ? r : 0.0001);
        dummy.updateMatrix();
        branchMesh.current!.setMatrixAt(i, dummy.matrix);
      });
      branchMesh.current.instanceMatrix.needsUpdate = true;
    }

    if (leafMesh.current) {
      leaves.forEach((l, i) => {
        const grown = THREE.MathUtils.clamp((p - l.t0) / 0.07, 0, 1);
        const g = l.t1 === undefined ? grown : grown * (1 - THREE.MathUtils.clamp((p - l.t1) / 0.08, 0, 1));
        const unfurl = g === 0 ? 0.0001 : l.size * (1 - Math.pow(1 - g, 3));
        // Each leaf flutters on its stem.
        flutter.setFromAxisAngle(X_AXIS, wind * 0.25 * Math.sin(t * 3.1 + l.phase) + 0.1 * Math.sin(t * 7.3 + l.phase * 2));
        dummy.position.copy(l.pos);
        dummy.quaternion.copy(l.turn).multiply(flutter);
        dummy.scale.set(unfurl, unfurl, unfurl);
        dummy.updateMatrix();
        leafMesh.current!.setMatrixAt(i, dummy.matrix);
      });
      leafMesh.current.instanceMatrix.needsUpdate = true;
    }

    // Blossoms only open once the crown is in (and stay hidden until then).
    if (blossomMesh.current && (p >= 0.84 || blossomMesh.current.userData.shown)) {
      blossomMesh.current.userData.shown = p >= 0.84;
      blossoms.forEach((b, i) => {
        const g = THREE.MathUtils.clamp((p - b.t0) / 0.06, 0, 1);
        const open = 0.15 + 1.0 * g + 0.04 * Math.sin(t * 1.3 + b.phase);
        const size = g === 0 ? 0.0001 : b.size * (0.4 + 0.6 * g);
        tmp.s.setScalar(size);
        for (let k = 0; k < PETALS; k++) {
          petalQuat(tmp.q, b.turn, SPOKES[k], open, (1 - g) * 0.7, quat);
          tmp.m.compose(b.pos, tmp.q, tmp.s);
          blossomMesh.current!.setMatrixAt(i * PETALS + k, tmp.m);
        }
      });
      blossomMesh.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      <group ref={crown} position={[0, -1.6, 0]}>
        {/* The crown sways from the base of the trunk. */}
        <group position={[0, 1.6, 0]}>
          <instancedMesh ref={branchMesh} args={[branchGeo, barkMat, segments.length]} frustumCulled={false} castShadow />
          <instancedMesh ref={leafMesh} args={[leafGeo, leafMat, leaves.length]} frustumCulled={false}>
            <instancedBufferAttribute attach="instanceColor" args={[leafColors, 3]} />
          </instancedMesh>
          <instancedMesh ref={blossomMesh} args={[petalGeo, petalMat, blossoms.length * PETALS]} frustumCulled={false} />
        </group>
      </group>
    </group>
  );
}

function Garden({ progress, lite, variant, frame }: { progress: { current: number }; lite: boolean; variant: SceneVariant; frame: SceneFrame }) {
  const growth = useMemo<Growth>(() => ({ p: progress.current }), [progress]);
  const petalGeo = useMemo(petalGeometry, []);
  const petalMat = useMemo(petalMaterial, []);
  return (
    <>
      <Smooth progress={progress} growth={growth} />
      <CameraRig growth={growth} variant={variant} frame={frame} />
      <Ground lite={lite} />
      <Flower growth={growth} petalGeo={petalGeo} petalMat={petalMat} />
      {variant === "stages" ? <Tree growth={growth} petalGeo={petalGeo} petalMat={petalMat} lite={lite} /> : null}
    </>
  );
}

const CENTRE: SceneFrame = { x: 0, y: 0 };

/** `lite` = phones and tablets: a lighter tree, less grass, lower resolution and no antialiasing. */
export default function GrowingTreeScene({
  progress,
  active,
  lite = false,
  variant = "stages",
  frame = CENTRE
}: {
  progress: { current: number };
  active: boolean;
  lite?: boolean;
  variant?: SceneVariant;
  frame?: SceneFrame;
}) {
  // Lower the resolution if the device can't keep up.
  const [dpr, setDpr] = useState(lite ? 1.25 : 1.75);
  const hero = variant === "hero";
  return (
    <Canvas
      dpr={[1, dpr]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, -0.15, 3.3], fov: 42 }}
      gl={{ antialias: !lite, alpha: true, powerPreference: "low-power" }}
    >
      {/* Morning light: warm sun high on one side, soft sky fill, green bounce from the grass. */}
      <hemisphereLight args={["#FFF4D6", "#4F7A3A", 0.8]} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} color="#FFF0CC" />
      {/* Low warm light behind: petals and leaves glow through. Stronger in the hero, against the dark. */}
      <directionalLight position={[-3, 2, -5]} intensity={hero ? 2.6 : 1.2} color="#FFD98A" />
      {hero ? <pointLight position={[1.2, -0.2, 1.6]} intensity={4} distance={5} color="#FFE2A8" /> : null}
      <Environment frames={1} resolution={lite ? 32 : 64}>
        <Lightformer form="rect" intensity={1.5} color="#FFFFFF" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1} color="#FFE7B0" position={[5, 2, 4]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#9FD3A8" position={[-5, -1, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
      </Environment>
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Garden progress={progress} lite={lite} variant={variant} frame={frame} />
      {hero ? (
        // Pollen and dust in the light.
        <Sparkles count={lite ? 36 : 80} scale={[4.5, 2.6, 3]} position={[frame.x, -0.6, 0]} size={lite ? 2.5 : 3} speed={0.25} opacity={0.7} color="#F4DA85" />
      ) : null}
      <ContactShadows position={[0, GROUND_Y - 0.02, 0]} opacity={0.4} scale={6} blur={2.5} far={2.5} resolution={lite ? 256 : 512} color="#0B3D2E" />
    </Canvas>
  );
}
