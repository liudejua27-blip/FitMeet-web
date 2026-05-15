import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const radius = 2.08;

const arcPairs = [
  [-28, -122, 32, -18, 0.62],
  [12, -72, -24, 98, 0.78],
  [42, 24, -36, 152, 0.5],
  [-12, 12, 48, 118, 0.68],
  [58, -44, 4, 162, 0.56],
  [-46, -18, 22, 72, 0.72],
  [8, 128, 54, -82, 0.42],
  [-38, 146, 18, -35, 0.64],
] as const;

function toVector(lat: number, lon: number, offset = 0) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const r = radius + offset;

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

type ArcRecord = {
  curve: THREE.CatmullRomCurve3;
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
};

export function ArcConnections({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);

  const arcs = useMemo<ArcRecord[]>(
    () =>
      arcPairs.map(([latA, lonA, latB, lonB, lift], index) => {
        const start = toVector(latA, lonA, 0.06);
        const end = toVector(latB, lonB, 0.06);
        const middle = start
          .clone()
          .add(end)
          .normalize()
          .multiplyScalar(radius + lift);
        const curve = new THREE.CatmullRomCurve3([start, middle, end]);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(96));
        const material = new THREE.LineBasicMaterial({
          color: index % 3 === 0 ? '#f4efe6' : index % 3 === 1 ? '#b8b5ac' : '#8c8a6e',
          transparent: true,
          opacity: 0.24 + (index % 3) * 0.055,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });

        return { curve, line: new THREE.Line(geometry, material), material };
      }),
    [],
  );

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.rotation.y = reducedMotion ? 0.08 : time * 0.012;
      groupRef.current.rotation.z = reducedMotion ? -0.08 : Math.sin(time * 0.08) * 0.045 - 0.05;
    }

    arcs.forEach((arc, index) => {
      arc.material.opacity = reducedMotion
        ? 0.24
        : 0.18 + Math.sin(time * 0.36 + index * 0.8) * 0.055 + (index % 2) * 0.06;

      const particle = particleRefs.current[index];
      if (!particle) return;

      const progress = reducedMotion ? (index % 8) / 8 : (time * (0.045 + index * 0.004) + index * 0.13) % 1;
      particle.position.copy(arc.curve.getPointAt(progress));
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 1.2 + index) * 0.18;
      particle.scale.setScalar(pulse);
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
            <sphereGeometry args={[0.024, 16, 16]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? '#f4efe6' : '#9daa83'}
              transparent
              opacity={0.74}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
