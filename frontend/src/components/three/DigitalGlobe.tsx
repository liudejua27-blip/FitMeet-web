import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ArcConnections } from './ArcConnections';

export const globeRadius = 2.08;

function buildLatitudeLine(lat: number) {
  const phi = THREE.MathUtils.degToRad(lat);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= 192; index += 1) {
    const theta = (index / 192) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        cosPhi * Math.cos(theta) * globeRadius,
        sinPhi * globeRadius,
        cosPhi * Math.sin(theta) * globeRadius,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: lat === 0 ? '#f4efe6' : '#a6aa94',
    transparent: true,
    opacity: lat === 0 ? 0.46 : 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Line(geometry, material);
}

function buildLongitudeLine(lon: number) {
  const theta = THREE.MathUtils.degToRad(lon);
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= 144; index += 1) {
    const phi = -Math.PI / 2 + (index / 144) * Math.PI;
    points.push(
      new THREE.Vector3(
        Math.cos(phi) * Math.cos(theta) * globeRadius,
        Math.sin(phi) * globeRadius,
        Math.cos(phi) * Math.sin(theta) * globeRadius,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: '#8c8a6e',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Line(geometry, material);
}

function buildRingLine(radius: number, color: string, opacity: number, segments = 192) {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function useSurfacePoints(count: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const clusters = [
      new THREE.Vector3(-0.35, 0.62, 0.7).normalize(),
      new THREE.Vector3(0.72, 0.1, 0.45).normalize(),
      new THREE.Vector3(-0.62, -0.36, -0.38).normalize(),
      new THREE.Vector3(0.15, -0.58, 0.78).normalize(),
    ];

    for (let index = 0; index < count; index += 1) {
      const y = 1 - (index / (count - 1)) * 2;
      const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * index;
      const base = new THREE.Vector3(horizontalRadius * Math.cos(theta), y, horizontalRadius * Math.sin(theta));

      const nearestCluster = clusters.reduce(
        (best, cluster) => Math.max(best, base.dot(cluster)),
        -1,
      );
      const densityLift = nearestCluster > 0.92 ? 0.055 : nearestCluster > 0.84 ? 0.034 : 0;
      const radialJitter = ((index % 11) / 11) * 0.026;
      const r = globeRadius + 0.02 + densityLift + radialJitter;
      positions[index * 3] = base.x * r;
      positions[index * 3 + 1] = base.y * r;
      positions[index * 3 + 2] = base.z * r;
      sizes[index] = nearestCluster > 0.9 ? 1 : 0.58;
    }

    return { positions, sizes };
  }, [count]);
}

function GatewayCore({ reducedMotion }: { reducedMotion: boolean }) {
  const ringRef = useRef<THREE.Group>(null);
  const portalRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  const rings = useMemo(
    () => [
      buildRingLine(0.42, '#f4efe6', 0.44),
      buildRingLine(0.58, '#b8b5ac', 0.24),
      buildRingLine(0.76, '#8c8a6e', 0.22),
      buildRingLine(0.94, '#6b7a5a', 0.18),
    ],
    [],
  );

  const portalRings = useMemo(
    () => [
      buildRingLine(0.58, '#f4efe6', 0.55),
      buildRingLine(0.82, '#b8b5ac', 0.28),
      buildRingLine(1.08, '#8c8a6e', 0.18),
    ],
    [],
  );

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.z = reducedMotion ? 0 : time * 0.08;
      ringRef.current.rotation.y = reducedMotion ? 0 : Math.sin(time * 0.18) * 0.08;
    }
    if (portalRef.current) {
      portalRef.current.rotation.y = reducedMotion ? 0 : time * 0.11;
      portalRef.current.rotation.z = reducedMotion ? 0 : -time * 0.05;
    }
    if (beamRef.current) {
      const material = beamRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = reducedMotion ? 0.18 : 0.14 + Math.sin(time * 0.72) * 0.035;
    }
  });

  return (
    <group>
      <group ref={ringRef} position={[0, -0.02, 0.08]}>
        {rings.map((ring, index) => (
          <primitive key={index} object={ring} rotation={[Math.PI / 2, 0, index * 0.08]} />
        ))}
        <mesh>
          <sphereGeometry args={[0.22, 32, 32]} />
          <meshBasicMaterial color="#121210" transparent opacity={0.88} depthWrite={false} />
        </mesh>
        <Text
          position={[0, -0.01, 0.24]}
          fontSize={0.32}
          color="#f4efe6"
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          F
        </Text>
      </group>

      <group ref={portalRef} position={[0.12, -1.82, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
        {portalRings.map((ring, index) => (
          <primitive key={index} object={ring} />
        ))}
        <mesh>
          <torusGeometry args={[0.52, 0.018, 10, 140]} />
          <meshBasicMaterial color="#f4efe6" transparent opacity={0.42} depthWrite={false} />
        </mesh>
      </group>

      <mesh ref={beamRef} position={[0.08, -0.92, 0.28]}>
        <cylinderGeometry args={[0.03, 0.24, 1.68, 32, 1, true]} />
        <meshBasicMaterial
          color="#f4efe6"
          transparent
          opacity={0.15}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export function DigitalGlobe({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const outerGlowRef = useRef<THREE.Mesh>(null);

  const gridLines = useMemo(() => {
    const lines: THREE.Line[] = [];
    for (let lat = -75; lat <= 75; lat += 10) lines.push(buildLatitudeLine(lat));
    for (let lon = 0; lon < 180; lon += 10) lines.push(buildLongitudeLine(lon));
    return lines;
  }, []);

  const { positions } = useSurfacePoints(4200);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = reducedMotion ? 0.18 : time * 0.02;
      groupRef.current.rotation.x = reducedMotion ? 0.02 : Math.sin(time * 0.11) * 0.018;
    }

    if (coreRef.current) {
      const scale = reducedMotion ? 1 : 1 + Math.sin(time * 0.34) * 0.004;
      coreRef.current.scale.setScalar(scale);
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y = reducedMotion ? 0 : -time * 0.006;
      const material = pointsRef.current.material as THREE.PointsMaterial;
      material.opacity = reducedMotion ? 0.82 : 0.78 + Math.sin(time * 0.7) * 0.08;
    }

    if (innerGlowRef.current) {
      (innerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = reducedMotion
        ? 0.05
        : 0.045 + Math.sin(time * 0.42) * 0.012;
    }

    if (outerGlowRef.current) {
      (outerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = reducedMotion
        ? 0.024
        : 0.022 + Math.sin(time * 0.28 + 1.2) * 0.007;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[globeRadius - 0.11, 96, 96]} />
        <meshStandardMaterial
          color="#161715"
          roughness={0.72}
          metalness={0.18}
          transparent
          opacity={0.36}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <icosahedronGeometry args={[globeRadius + 0.008, 5]} />
        <meshBasicMaterial
          color="#b8b5ac"
          transparent
          opacity={0.16}
          wireframe
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[globeRadius + 0.02, 96, 96]} />
        <meshBasicMaterial
          color="#8c8a6e"
          transparent
          opacity={0.115}
          wireframe
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {gridLines.map((line, index) => (
        <primitive key={index} object={line} />
      ))}

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} count={positions.length / 3} />
        </bufferGeometry>
        <pointsMaterial
          color="#f4efe6"
          size={0.017}
          sizeAttenuation
          transparent
          opacity={0.82}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <ArcConnections reducedMotion={reducedMotion} />
      <GatewayCore reducedMotion={reducedMotion} />

      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[globeRadius + 0.28, 80, 80]} />
        <meshBasicMaterial
          color="#c9c5bb"
          transparent
          opacity={0.078}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={outerGlowRef}>
        <sphereGeometry args={[globeRadius + 0.78, 80, 80]} />
        <meshBasicMaterial
          color="#6b7a5a"
          transparent
          opacity={0.04}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
