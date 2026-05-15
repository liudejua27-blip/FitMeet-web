'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLOBE_RADIUS } from './DigitalGlobe';

/**
 * Subtle procedural noise shimmer just beneath the lat/lon grid.
 * Fresnel-weighted fBm gives the line-art globe a quiet "living surface"
 * without breaking the editorial / line-art mood.
 */
const vertexShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  varying vec3  vPos;
  varying vec3  vNormal;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPos);
    float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.4);

    float n = fbm(vPos * 1.7 + vec3(uTime * 0.03, uTime * 0.018, uTime * 0.022));
    float band = smoothstep(0.35, 0.85, n);

    vec3  color = mix(uColorA, uColorB, band);
    float alpha = rim * (0.18 + n * 0.32);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function GlobeShimmer() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime:   { value: 0 },
      uColorA: { value: new THREE.Color('#6B7A5A') }, // moss
      uColorB: { value: new THREE.Color('#F4EFE6') }, // ivory
    }),
    [],
  );

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS - 0.015, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
