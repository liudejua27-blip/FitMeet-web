'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GlobeShimmer } from './GlobeShimmer';

export const GLOBE_RADIUS = 2.0;

export function DigitalGlobe() {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const innerAtmoRef = useRef<THREE.Mesh>(null);
  const outerAtmoRef = useRef<THREE.Mesh>(null);

  // ── Lat/lon precision grid (procedurally generated) ──────────────
  const gridObjects = useMemo(() => {
    const R = GLOBE_RADIUS;
    const lines: THREE.Line[] = [];

    // Latitude parallels (–75° → +75°, every 15°)
    for (let lat = -75; lat <= 75; lat += 15) {
      const phi = THREE.MathUtils.degToRad(lat);
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 128; j++) {
        const theta = (j / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(cosPhi * Math.cos(theta) * R, sinPhi * R, cosPhi * Math.sin(theta) * R));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: lat === 0 ? '#8C8A6E' : '#6B7A5A',
        transparent: true,
        opacity: lat === 0 ? 0.32 : 0.16,
        depthWrite: false,
      });
      lines.push(new THREE.Line(geo, mat));
    }

    // Longitude meridians (0° → 160°, every 20°) – half great-circles
    for (let lon = 0; lon < 180; lon += 20) {
      const theta = THREE.MathUtils.degToRad(lon);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 80; j++) {
        const phi = -Math.PI / 2 + (j / 80) * Math.PI;
        pts.push(new THREE.Vector3(
          Math.cos(phi) * Math.cos(theta) * R,
          Math.sin(phi) * R,
          Math.cos(phi) * Math.sin(theta) * R,
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: '#56604A', transparent: true, opacity: 0.14, depthWrite: false });
      lines.push(new THREE.Line(geo, mat));
    }

    return lines;
  }, []);

  // ── Surface particles – Fibonacci sphere for uniform distribution ─
  const surfacePos = useMemo(() => {
    const count = 2400;
    const R = GLOBE_RADIUS;
    const pos = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5)); // golden angle
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const r = R + 0.003 + Math.random() * 0.038;
      pos[i * 3]     = radius * Math.cos(theta) * r;
      pos[i * 3 + 1] = y * r;
      pos[i * 3 + 2] = radius * Math.sin(theta) * r;
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) groupRef.current.rotation.y = t * 0.022;
    if (coreRef.current) coreRef.current.scale.setScalar(1 + Math.sin(t * 0.38) * 0.004);
    if (innerAtmoRef.current)
      (innerAtmoRef.current.material as THREE.MeshBasicMaterial).opacity = 0.042 + Math.sin(t * 0.52) * 0.01;
    if (outerAtmoRef.current)
      (outerAtmoRef.current.material as THREE.MeshBasicMaterial).opacity = 0.018 + Math.sin(t * 0.35 + 1.1) * 0.006;
  });

  return (
    <group ref={groupRef}>
      {/* Deep inner core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[GLOBE_RADIUS - 0.06, 64, 64]} />
        <meshBasicMaterial color="#07080A" transparent opacity={0.98} depthWrite={false} />
      </mesh>

      {/* Subtle shader-based surface shimmer (Fresnel + fBm noise) */}
      <GlobeShimmer />

      {/* Procedural lat/lon grid */}
      {gridObjects.map((obj, i) => <primitive key={i} object={obj} />)}

      {/* Fibonacci surface particles */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={surfacePos.length / 3} array={surfacePos} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#F4EFE6" size={0.0065} sizeAttenuation transparent opacity={0.5} depthWrite={false} />
      </points>

      {/* Inner atmospheric glow */}
      <mesh ref={innerAtmoRef}>
        <sphereGeometry args={[GLOBE_RADIUS + 0.28, 48, 48]} />
        <meshBasicMaterial color="#6B7A5A" transparent opacity={0.042} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Outer diffuse atmosphere */}
      <mesh ref={outerAtmoRef}>
        <sphereGeometry args={[GLOBE_RADIUS + 0.72, 48, 48]} />
        <meshBasicMaterial color="#3C4A30" transparent opacity={0.018} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
