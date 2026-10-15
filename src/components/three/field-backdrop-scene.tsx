"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  attribute float aSeed;
  varying float vHeight;
  varying float vFade;

  void main() {
    vec3 p = position;
    float wave = sin(p.x * 0.45 + uTime * 0.7) * 0.35
               + cos(p.z * 0.6 + uTime * 0.55) * 0.3
               + sin((p.x + p.z) * 0.25 + uTime * 0.4) * 0.25;
    // Soft swell that follows the pointer across the field.
    float d = distance(p.xz, uPointer * vec2(9.0, 6.0));
    wave += exp(-d * d * 0.08) * 0.8 * (0.6 + 0.4 * sin(uTime * 2.0 - d));
    p.y += wave;
    vHeight = wave;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = smoothstep(-26.0, -4.0, mv.z);
    gl_PointSize = (2.2 + aSeed * 2.4) * (12.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vHeight;
  varying float vFade;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, r);
    vec3 green = vec3(0.31, 0.64, 0.49);
    vec3 gold = vec3(0.93, 0.77, 0.30);
    vec3 col = mix(green, gold, smoothstep(0.35, 0.95, vHeight));
    gl_FragColor = vec4(col, glow * vFade * 0.9);
  }
`;

function Field({ active }: { active: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const pointer = useRef(new THREE.Vector2());

  const geometry = useMemo(() => {
    const cols = 110;
    const rows = 70;
    const positions = new Float32Array(cols * rows * 3);
    const seeds = new Float32Array(cols * rows);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        positions[i * 3] = (c / (cols - 1) - 0.5) * 34;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (r / (rows - 1) - 0.5) * 22;
        seeds[i] = ((c * 928371 + r * 123457) % 1000) / 1000;
        i++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return g;
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPointer: { value: new THREE.Vector2() } }), []);

  useFrame((state, delta) => {
    if (!material.current) return;
    if (active) material.current.uniforms.uTime.value += Math.min(delta, 0.05);
    pointer.current.lerp(state.pointer, 0.05);
    material.current.uniforms.uPointer.value.set(pointer.current.x, -pointer.current.y);
  });

  return (
    <points geometry={geometry} position={[0, -2.2, -6]}>
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function FieldBackdropScene({ active }: { active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 2.4, 8], fov: 55 }}
      onCreated={({ camera }) => camera.lookAt(0, -1.5, -6)}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      eventPrefix="client"
      style={{ pointerEvents: "none" }}
    >
      <Field active={active} />
    </Canvas>
  );
}
