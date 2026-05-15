'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function ParticleField({ count = 900 }: { count?: number }) {
  const outerRef  = useRef<THREE.Points>(null);
  const innerRef  = useRef<THREE.Points>(null);
  const streamRef = useRef<THREE.Points>(null);

  // ── Outer nebula (spherical shell, wide) ─────────────────────────
  const outerPos = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r     = 8 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [count]);

  // ── Inner cloud (denser near ecliptic plane, mid-range) ──────────
  const innerPos = useMemo(() => {
    const n = Math.floor(count * 0.45);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r     = 4.8 + Math.random() * 2.8;
      const theta = Math.random() * Math.PI * 2;
      // sin²-weighted phi → concentrates near equator
      const raw = (Math.random() - 0.5) * Math.PI;
      const phi = raw * Math.abs(raw) / (Math.PI * 0.5);
      pos[i * 3]     = r * Math.cos(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(phi) * Math.sin(theta);
    }
    return pos;
  }, [count]);

  // ── Data-stream arc particles (circular arcs between orbit bands) ─
  const streamPos = useMemo(() => {
    const n = Math.floor(count * 0.25);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Random arc between radius 2.8 and 4.4
      const r     = 2.8 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi   = (Math.random() - 0.5) * Math.PI * 0.6;
      pos[i * 3]     = r * Math.cos(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(phi) * Math.sin(theta);
    }
    return pos;
  }, [count]);

  useFrame((_, delta) => {
    if (outerRef.current)  outerRef.current.rotation.y  +=  delta * 0.007;
    if (innerRef.current) {
      innerRef.current.rotation.y  -= delta * 0.011;
      innerRef.current.rotation.x  += delta * 0.003;
    }
    if (streamRef.current) streamRef.current.rotation.z += delta * 0.008;
  });

  return (
    <>
      {/* Outer nebula */}
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={outerPos.length / 3} array={outerPos} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#F4EFE6" size={0.014} transparent opacity={0.30} sizeAttenuation depthWrite={false} />
      </points>

      {/* Mid inner cloud */}
      <points ref={innerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={innerPos.length / 3} array={innerPos} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#8C8A6E" size={0.009} transparent opacity={0.22} sizeAttenuation depthWrite={false} />
      </points>

      {/* Data-stream belt */}
      <points ref={streamRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={streamPos.length / 3} array={streamPos} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#6B7A5A" size={0.011} transparent opacity={0.18} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}
