"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { seeded } from "./hooks";

type Segment = {
  start: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
  t0: number;
  t1: number;
};

type LeafSpot = { pos: THREE.Vector3; t0: number; size: number; color: THREE.Color; spin: number };

const UP = new THREE.Vector3(0, 1, 0);
const MAX_DEPTH = 6;

/**
 * Builds a deterministic tree. Each segment and leaf gets a growth window (t0..t1) on a 0..1
 * timeline: the trunk sprouts first (creche), branches spread (primary), crown and gold blossoms
 * fill in last (secondary).
 */
function buildTree() {
  const rand = seeded(2024);
  const segments: Segment[] = [];
  const leaves: LeafSpot[] = [];
  const greens = ["#2F8560", "#4FA37C", "#7FC2A0", "#1F6B4C"].map((c) => new THREE.Color(c));
  const golds = ["#D4A017", "#EDC54C"].map((c) => new THREE.Color(c));

  function grow(start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number, t0: number) {
    const span = depth === 0 ? 0.24 : 0.16 - depth * 0.012;
    const t1 = Math.min(t0 + span, 0.97);
    segments.push({ start: start.clone(), dir: dir.clone(), length, radius, t0, t1 });
    const end = start.clone().addScaledVector(dir, length);

    if (depth >= MAX_DEPTH) {
      const clusters = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < clusters; i++) {
        const offset = new THREE.Vector3(rand() - 0.5, rand() - 0.3, rand() - 0.5).multiplyScalar(0.55);
        const late = rand() < 0.16;
        leaves.push({
          pos: end.clone().add(offset),
          t0: Math.min(t1 - 0.04 + rand() * 0.08 + (late ? 0.08 : 0), 0.96),
          size: late ? 0.09 + rand() * 0.05 : 0.16 + rand() * 0.12,
          color: late ? golds[Math.floor(rand() * golds.length)] : greens[Math.floor(rand() * greens.length)],
          spin: rand() * Math.PI * 2
        });
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

    // A few leaves along the way so the young tree already looks alive.
    if (depth >= 2) {
      leaves.push({
        pos: end.clone().add(new THREE.Vector3(rand() - 0.5, rand() * 0.2, rand() - 0.5).multiplyScalar(0.4)),
        t0: t1,
        size: 0.12 + rand() * 0.08,
        color: greens[Math.floor(rand() * greens.length)],
        spin: rand() * Math.PI * 2
      });
    }
  }

  grow(new THREE.Vector3(0, -1.6, 0), UP.clone(), 1.25, 0.16, 0, 0.02);
  return { segments, leaves };
}

function Tree({ progress }: { progress: { current: number } }) {
  const { segments, leaves } = useMemo(buildTree, []);
  const branchMesh = useRef<THREE.InstancedMesh>(null);
  const leafMesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const smoothed = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  const branchGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.62, 1, 1, 7, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const leafGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const leafColors = useMemo(() => {
    const arr = new Float32Array(leaves.length * 3);
    leaves.forEach((l, i) => l.color.toArray(arr, i * 3));
    return arr;
  }, [leaves]);

  useFrame(({ clock }, delta) => {
    smoothed.current = THREE.MathUtils.damp(smoothed.current, progress.current, 3.5, delta);
    const p = smoothed.current;
    const t = clock.getElapsedTime();
    if (group.current) group.current.rotation.y = t * 0.12;

    if (branchMesh.current) {
      segments.forEach((s, i) => {
        const g = THREE.MathUtils.clamp((p - s.t0) / (s.t1 - s.t0), 0, 1);
        const eased = 1 - Math.pow(1 - g, 3);
        quat.setFromUnitVectors(UP, s.dir);
        dummy.position.copy(s.start);
        dummy.quaternion.copy(quat);
        const r = s.radius * (0.35 + 0.65 * eased);
        dummy.scale.set(g > 0 ? r : 0.0001, Math.max(s.length * eased, 0.0001), g > 0 ? r : 0.0001);
        dummy.updateMatrix();
        branchMesh.current!.setMatrixAt(i, dummy.matrix);
      });
      branchMesh.current.instanceMatrix.needsUpdate = true;
    }

    if (leafMesh.current) {
      leaves.forEach((l, i) => {
        const g = THREE.MathUtils.clamp((p - l.t0) / 0.07, 0, 1);
        const pop = g === 0 ? 0.0001 : l.size * (1 + 0.25 * Math.sin(g * Math.PI)) * g;
        dummy.position.copy(l.pos);
        dummy.position.y += Math.sin(t * 1.2 + l.spin) * 0.015;
        dummy.rotation.set(l.spin, l.spin * 0.5 + t * 0.2, 0);
        dummy.scale.set(pop, pop * 0.8, pop);
        dummy.updateMatrix();
        leafMesh.current!.setMatrixAt(i, dummy.matrix);
      });
      leafMesh.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      <instancedMesh ref={branchMesh} args={[branchGeo, undefined, segments.length]} frustumCulled={false} castShadow>
        <meshStandardMaterial color="#5B3E2A" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={leafMesh} args={[leafGeo, undefined, leaves.length]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[leafColors, 3]} />
        <meshStandardMaterial roughness={0.5} flatShading />
      </instancedMesh>
      {/* Soil mound */}
      <mesh position={[0, -1.68, 0]} scale={[1, 0.22, 1]}>
        <sphereGeometry args={[0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3D2B1F" roughness={1} />
      </mesh>
    </group>
  );
}

export default function GrowingTreeScene({ progress, active }: { progress: { current: number }; active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0.6, 7.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <ambientLight intensity={0.65} />
      <hemisphereLight args={["#FFF4D6", "#2F8560", 0.6]} />
      <directionalLight position={[4, 6, 5]} intensity={1.8} color="#FFF4D6" />
      <Tree progress={progress} />
      <ContactShadows position={[0, -1.7, 0]} opacity={0.35} scale={6} blur={2.5} far={2} color="#0B3D2E" />
    </Canvas>
  );
}
