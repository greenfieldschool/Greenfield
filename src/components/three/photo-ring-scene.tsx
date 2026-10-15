"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Image as DreiImage } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type RingPhoto = { src: string; alt: string };

function Ring({
  photos,
  rotation,
  onFrontChange
}: {
  photos: RingPhoto[];
  rotation: { current: number; velocity: number; dragging: boolean };
  onFrontChange: (index: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const lastFront = useRef(-1);
  const { viewport } = useThree();
  const count = photos.length;
  const radius = Math.max(3.2, count * 0.62);
  const width = Math.min(2.6, viewport.width * 0.5);

  const placements = useMemo(
    () =>
      photos.map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return {
          position: new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius),
          rotationY: angle
        };
      }),
    [photos, count, radius]
  );

  useFrame((_, delta) => {
    const r = rotation;
    if (!r.dragging) {
      r.velocity = THREE.MathUtils.damp(r.velocity, 0.12, 1.5, delta);
      r.current += r.velocity * delta;
    }
    if (group.current) group.current.rotation.y = r.current;

    // Photo closest to the camera is the "front" one, for the caption.
    const step = (Math.PI * 2) / count;
    const front = ((Math.round(-r.current / step) % count) + count) % count;
    if (front !== lastFront.current) {
      lastFront.current = front;
      onFrontChange(front);
    }
  });

  return (
    <group ref={group} position={[0, 0, -radius]}>
      {photos.map((p, i) => (
        <DreiImage
          key={p.src}
          url={p.src}
          position={placements[i].position}
          rotation={[0, placements[i].rotationY, 0]}
          scale={[width, width * 0.72]}
          radius={0.08}
          transparent
          side={THREE.DoubleSide}
        />
      ))}
    </group>
  );
}

export default function PhotoRingScene({
  photos,
  active,
  onFrontChange
}: {
  photos: RingPhoto[];
  active: boolean;
  onFrontChange: (index: number) => void;
}) {
  const rotation = useRef({ current: 0, velocity: 0.12, dragging: false });
  const lastX = useRef(0);
  const host = useRef<HTMLDivElement | null>(null);

  // Drag (mouse or touch) to spin; momentum carries on after release.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      rotation.current.dragging = true;
      rotation.current.velocity = 0;
      lastX.current = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!rotation.current.dragging) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      rotation.current.current += dx * 0.006;
      rotation.current.velocity = dx * 0.35;
    };
    const up = () => {
      rotation.current.dragging = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div ref={host} className="h-full w-full cursor-grab touch-pan-y active:cursor-grabbing">
      <Canvas dpr={[1, 1.75]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0.4, 4.5], fov: 50 }}>
        <Suspense fallback={null}>
          <Ring photos={photos} rotation={rotation.current} onFrontChange={onFrontChange} />
        </Suspense>
      </Canvas>
    </div>
  );
}
