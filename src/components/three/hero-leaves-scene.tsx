"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { seeded } from "./hooks";

const PALETTE = ["#D4A017", "#EDC54C", "#F4DA85", "#7FC2A0", "#4FA37C", "#AEDAC2"];

function leafGeometry() {
  // A simple pointed leaf with a slight bend, built from two bezier curves.
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.32, -0.25, 0.32, 0.25, 0, 0.5);
  s.bezierCurveTo(-0.32, 0.25, -0.32, -0.25, 0, -0.5);
  const geo = new THREE.ShapeGeometry(s, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, -0.18 * x * x * 4 + 0.05 * y);
  }
  geo.computeVertexNormals();
  return geo;
}

type Leaf = {
  x: number;
  y: number;
  z: number;
  speed: number;
  sway: number;
  phase: number;
  spin: THREE.Vector3;
  scale: number;
};

function Leaves({ count, paused }: { count: number; paused: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(leafGeometry, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { viewport } = useThree();

  const leaves = useMemo<Leaf[]>(() => {
    const rand = seeded(7);
    return Array.from({ length: count }, () => ({
      x: (rand() - 0.2) * 16,
      y: (rand() - 0.5) * 12,
      z: -rand() * 9 + 1.5,
      speed: 0.12 + rand() * 0.28,
      sway: 0.3 + rand() * 0.7,
      phase: rand() * Math.PI * 2,
      spin: new THREE.Vector3(rand() * 0.6, rand() * 0.8, rand() * 0.5),
      scale: 0.18 + rand() * 0.32
    }));
  }, [count]);

  const colors = useMemo(() => {
    const rand = seeded(11);
    const arr = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(PALETTE[Math.floor(rand() * PALETTE.length)]);
      c.toArray(arr, i * 3);
    }
    return arr;
  }, [count]);

  useFrame(({ clock }, delta) => {
    if (!mesh.current) return;
    const t = clock.getElapsedTime();
    const top = viewport.height / 2 + 2;
    const dt = paused ? 0 : Math.min(delta, 0.05);
    leaves.forEach((leaf, i) => {
      leaf.y += leaf.speed * dt;
      if (leaf.y > top) leaf.y = -top;
      const sway = Math.sin(t * 0.6 + leaf.phase) * leaf.sway;
      dummy.position.set(leaf.x + sway, leaf.y, leaf.z);
      dummy.rotation.set(
        t * leaf.spin.x + leaf.phase,
        t * leaf.spin.y + leaf.phase * 0.5,
        Math.sin(t * 0.8 + leaf.phase) * 0.6 + leaf.spin.z
      );
      dummy.scale.setScalar(leaf.scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.55} metalness={0.15} transparent opacity={0.9} />
    </instancedMesh>
  );
}

/** Camera eases toward the pointer for a gentle parallax. */
function Parallax() {
  const target = useRef(new THREE.Vector3());
  useFrame(({ camera, pointer }) => {
    target.current.set(pointer.x * 0.8, pointer.y * 0.5, camera.position.z);
    camera.position.lerp(target.current, 0.035);
    camera.lookAt(0, 0, -2);
  });
  return null;
}

export default function HeroLeavesScene({ active }: { active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      eventPrefix="client"
    >
      <fog attach="fog" args={["#062519", 4, 14]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} color="#FFF4D6" />
      <directionalLight position={[-4, -2, 2]} intensity={0.5} color="#7FC2A0" />
      <Leaves count={70} paused={!active} />
      <Parallax />
    </Canvas>
  );
}
