import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const globeRadius = 2.08;

const ASIA_NODES = [
  { name: 'Beijing', lat: 39.9042, lng: 116.4074 },
  { name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
  { name: 'Shenzhen', lat: 22.5431, lng: 114.0579 },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Seoul', lat: 37.5665, lng: 126.978 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456 },
  { name: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
  { name: 'Manila', lat: 14.5995, lng: 120.9842 },
  { name: 'Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Taipei', lat: 25.033, lng: 121.5654 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
] as const;

const GLOBAL_TARGETS = [
  { name: 'London', lat: 51.5072, lng: -0.1276 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
] as const;

const ASIA_ROUTES = [
  ['Beijing', 'Shanghai', 0.2],
  ['Shanghai', 'Tokyo', 0.28],
  ['Shanghai', 'Seoul', 0.24],
  ['Shenzhen', 'Singapore', 0.32],
  ['Hong Kong', 'Bangkok', 0.25],
  ['Singapore', 'Jakarta', 0.22],
  ['Singapore', 'Manila', 0.26],
  ['Delhi', 'Dubai', 0.34],
  ['Mumbai', 'Singapore', 0.34],
  ['Taipei', 'Tokyo', 0.2],
] as const;

const GLOBAL_ROUTES = [
  ['Shanghai', 'London', 0.78],
  ['Tokyo', 'San Francisco', 0.86],
  ['Singapore', 'Sydney', 0.62],
  ['Delhi', 'Paris', 0.72],
  ['Beijing', 'New York', 0.88],
] as const;

type RouteNode = {
  name: string;
  lat: number;
  lng: number;
};

type ArcRecord = {
  curve: THREE.CatmullRomCurve3;
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
};

function latLonToVector(lat: number, lon: number, offset = 0) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const radius = globeRadius + offset;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

const nodesByName = new Map<string, RouteNode>([
  ...ASIA_NODES.map((node) => [node.name, node] as const),
  ...GLOBAL_TARGETS.map((node) => [node.name, node] as const),
]);

function buildCurve(from: RouteNode, to: RouteNode, lift: number) {
  const start = latLonToVector(from.lat, from.lng, 0.09);
  const end = latLonToVector(to.lat, to.lng, 0.09);
  const middle = start
    .clone()
    .add(end)
    .normalize()
    .multiplyScalar(globeRadius + lift);

  return new THREE.CatmullRomCurve3([start, middle, end]);
}

function buildArc(fromName: string, toName: string, lift: number, index: number, global: boolean): ArcRecord {
  const from = nodesByName.get(fromName);
  const to = nodesByName.get(toName);
  if (!from || !to) throw new Error(`Missing arc node: ${fromName} -> ${toName}`);

  const curve = buildCurve(from, to, lift);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(global ? 120 : 72));
  const material = new THREE.LineBasicMaterial({
    color: global ? (index % 2 === 0 ? '#8c8a6e' : '#6b7a5a') : index % 2 === 0 ? '#f4efe6' : '#c9c5bb',
    transparent: true,
    opacity: global ? 0.12 : 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { curve, line: new THREE.Line(geometry, material), material };
}

export function ArcConnections({
  reducedMotion,
  intensity = 1,
}: {
  reducedMotion: boolean;
  intensity?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);

  const arcs = useMemo<ArcRecord[]>(
    () => [
      ...ASIA_ROUTES.map(([from, to, lift], index) => buildArc(from, to, lift, index, false)),
      ...GLOBAL_ROUTES.map(([from, to, lift], index) => buildArc(from, to, lift, index, true)),
    ],
    [],
  );

  useFrame(({ clock }) => {
    if (document.hidden) return;
    const time = clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.rotation.y = reducedMotion ? 0 : Math.sin(time * 0.08) * 0.01;
      groupRef.current.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.06) * 0.018;
    }

    arcs.forEach((arc, index) => {
      const isGlobal = index >= ASIA_ROUTES.length;
      arc.material.opacity = reducedMotion
        ? (isGlobal ? 0.12 : 0.19) * intensity
        : ((isGlobal ? 0.1 : 0.17) + Math.sin(time * 0.32 + index * 0.8) * 0.025) * intensity;

      const particle = particleRefs.current[index];
      if (!particle) return;

      const progress = reducedMotion
        ? (index % arcs.length) / arcs.length
        : (time * (0.035 + index * 0.002) + index * 0.11) % 1;
      particle.position.copy(arc.curve.getPointAt(progress));
      particle.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 1.1 + index) * 0.16);
    });
  });

  return (
    <group ref={groupRef}>
      {arcs.map((arc, index) => (
        <group key={index}>
          <primitive object={arc.line} />
          <mesh
            ref={(element) => {
              particleRefs.current[index] = element;
            }}
          >
            <sphereGeometry args={[index >= ASIA_ROUTES.length ? 0.012 : 0.015, 16, 16]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? '#f4efe6' : '#b8b5ac'}
              transparent
              opacity={0.42 * intensity}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
