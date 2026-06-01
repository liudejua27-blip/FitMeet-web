import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ArcConnections } from './ArcConnections';
import { pointerProgress } from './cameraMotion';

const globeRadius = 2.08;

const asiaFocusRotationY = -3.42;
const asiaFocusRotationX = 0.08;

type GeoNode = {
  name: string;
  lat: number;
  lng: number;
};

const ASIA_NODES: GeoNode[] = [
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
];

const landAreas = [
  { lat: 50, lon: 104, latRadius: 28, lonRadius: 70, tilt: 0.02, asia: true },
  { lat: 29, lon: 105, latRadius: 18, lonRadius: 34, tilt: -0.18, asia: true },
  { lat: 19, lon: 103, latRadius: 14, lonRadius: 24, tilt: 0.18, asia: true },
  { lat: 22, lon: 78, latRadius: 14, lonRadius: 18, tilt: -0.06, asia: true },
  { lat: 36, lon: 138, latRadius: 8, lonRadius: 12, tilt: -0.48, asia: true },
  { lat: -4, lon: 121, latRadius: 10, lonRadius: 24, tilt: 0.18, asia: true },
  { lat: -25, lon: 134, latRadius: 15, lonRadius: 22, tilt: 0.08 },
  { lat: 52, lon: 12, latRadius: 14, lonRadius: 28, tilt: 0.12 },
  { lat: 22, lon: 18, latRadius: 33, lonRadius: 24, tilt: -0.08 },
  { lat: -22, lon: 25, latRadius: 14, lonRadius: 18, tilt: 0.1 },
  { lat: 52, lon: -106, latRadius: 22, lonRadius: 45, tilt: -0.22 },
  { lat: 37, lon: -96, latRadius: 16, lonRadius: 29, tilt: 0.06 },
  { lat: -13, lon: -60, latRadius: 31, lonRadius: 19, tilt: -0.22 },
];

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function longitudeDelta(lon: number, center: number) {
  let delta = lon - center;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function areaScore(lat: number, lon: number, area: (typeof landAreas)[number]) {
  const tilt = area.tilt ?? 0;
  const dx = longitudeDelta(lon, area.lon);
  const dy = lat - area.lat;
  const rotatedX = dx * Math.cos(tilt) - dy * Math.sin(tilt);
  const rotatedY = dx * Math.sin(tilt) + dy * Math.cos(tilt);
  return (rotatedX / area.lonRadius) ** 2 + (rotatedY / area.latRadius) ** 2;
}

function isLand(lat: number, lon: number, seed: number) {
  const score = landAreas.reduce((best, area) => Math.min(best, areaScore(lat, lon, area)), Number.POSITIVE_INFINITY);
  const coastlineNoise = (seededUnit(seed) - 0.5) * 0.16;
  return score + coastlineNoise < 1;
}

function isAsiaLng(lon: number) {
  return lon > 48 && lon < 150;
}

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

function buildLatitudeLine(lat: number) {
  const points: THREE.Vector3[] = [];
  for (let lon = -180; lon <= 180; lon += 2) points.push(latLonToVector(lat, lon, 0.012));

  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: lat === 0 ? '#f4efe6' : '#a6aa94',
      transparent: true,
      opacity: lat === 0 ? 0.34 : 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function buildLongitudeLine(lon: number) {
  const points: THREE.Vector3[] = [];
  for (let lat = -80; lat <= 80; lat += 2) points.push(latLonToVector(lat, lon, 0.012));

  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: '#8c8a6e',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
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

function buildLandPointCloud() {
  const world: number[] = [];
  const asia: number[] = [];
  const minorNodes: number[] = [];

  for (let lat = -54; lat <= 74; lat += 2.25) {
    for (let lon = -176; lon <= 178; lon += 2.25) {
      const seed = (lat + 91) * 997 + lon + 181;
      if (!isLand(lat, lon, seed)) continue;

      const jitterLat = lat + (seededUnit(seed + 7) - 0.5) * 0.54;
      const jitterLon = lon + (seededUnit(seed + 13) - 0.5) * 0.54;
      const position = latLonToVector(jitterLat, jitterLon, 0.036 + seededUnit(seed + 19) * 0.018);
      const asiaLand = isAsiaLng(jitterLon) && jitterLat > -12 && jitterLat < 62;

      if (asiaLand) {
        asia.push(position.x, position.y, position.z);
        if (seededUnit(seed + 31) < 0.1) {
          const node = latLonToVector(jitterLat, jitterLon, 0.086);
          minorNodes.push(node.x, node.y, node.z);
        }
      } else {
        world.push(position.x, position.y, position.z);
      }
    }
  }

  return {
    world: new Float32Array(world),
    asia: new Float32Array(asia),
    minorNodes: new Float32Array(minorNodes),
  };
}

function buildCityNodePositions(nodes: GeoNode[]) {
  const positions: number[] = [];
  nodes.forEach((node, index) => {
    positions.push(...latLonToVector(node.lat, node.lng, 0.12).toArray());
    for (let point = 0; point < 6; point += 1) {
      const seed = index * 101 + point * 13;
      const satellite = latLonToVector(
        node.lat + (seededUnit(seed + 1) - 0.5) * 3.4,
        node.lng + (seededUnit(seed + 2) - 0.5) * 4.0,
        0.096,
      );
      positions.push(satellite.x, satellite.y, satellite.z);
    }
  });

  return new Float32Array(positions);
}

function buildAsiaMeshNetwork() {
  const positions: number[] = [];
  ASIA_NODES.forEach((node, index) => {
    const next = ASIA_NODES[(index + 1) % ASIA_NODES.length];
    const hub = ASIA_NODES[index % 3 === 0 ? 1 : index % 3 === 1 ? 0 : 6];
    [next, hub].forEach((target) => {
      const start = latLonToVector(node.lat, node.lng, 0.105);
      const end = latLonToVector(target.lat, target.lng, 0.105);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    });
  });

  return new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)),
    new THREE.LineBasicMaterial({
      color: '#f4efe6',
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
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

export function DigitalGlobe({
  reducedMotion,
  visualMode = 'ambient',
}: {
  reducedMotion: boolean;
  visualMode?: 'ambient' | 'hero';
}) {
  const isHero = visualMode === 'hero';
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const asiaNodesRef = useRef<THREE.Points>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const outerGlowRef = useRef<THREE.Mesh>(null);
  const initializedRef = useRef(false);

  const gridLines = useMemo(() => {
    const lines: THREE.Line[] = [];
    for (let lat = -60; lat <= 60; lat += 15) lines.push(buildLatitudeLine(lat));
    for (let lon = -180; lon < 180; lon += 15) lines.push(buildLongitudeLine(lon));
    return lines;
  }, []);

  const landPoints = useMemo(() => buildLandPointCloud(), []);
  const asiaNetwork = useMemo(() => buildAsiaMeshNetwork(), []);
  const asiaCityNodes = useMemo(() => buildCityNodePositions(ASIA_NODES), []);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();

    if (groupRef.current) {
      const pointerYRotation = reducedMotion ? 0 : pointerProgress.x * 0.08;
      const pointerXTilt = reducedMotion ? 0 : pointerProgress.y * 0.04;
      const targetY = asiaFocusRotationY + pointerYRotation + (reducedMotion ? 0 : Math.sin(time * 0.1) * 0.016);
      const targetX = asiaFocusRotationX + pointerXTilt + (reducedMotion ? 0 : Math.sin(time * 0.11) * 0.014);
      const targetZ = -0.08 + (reducedMotion ? 0 : pointerProgress.x * 0.014);

      if (!initializedRef.current) {
        groupRef.current.rotation.set(targetX, targetY, targetZ);
        initializedRef.current = true;
      } else {
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetX, 0.06);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, 0.06);
        groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetZ, 0.06);
      }
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 0.34) * 0.004);
    }

    if (pointsRef.current) {
      const material = pointsRef.current.material as THREE.PointsMaterial;
      const baseOpacity = isHero ? 0.22 : 0.46;
      material.opacity = reducedMotion ? baseOpacity : baseOpacity + Math.sin(time * 0.54) * 0.025;
    }

    if (asiaNodesRef.current) {
      const material = asiaNodesRef.current.material as THREE.PointsMaterial;
      const nodeOpacity = isHero ? 0.62 : 0.8;
      const nodeSize = isHero ? 0.023 : 0.028;
      material.opacity = reducedMotion ? nodeOpacity : nodeOpacity + Math.sin(time * 0.76) * 0.04;
      material.size = reducedMotion ? nodeSize : nodeSize + Math.sin(time * 0.68) * 0.002;
    }

    if (innerGlowRef.current) {
      (innerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = reducedMotion
        ? isHero ? 0.05 : 0.08
        : (isHero ? 0.048 : 0.075) + Math.sin(time * 0.42) * 0.012;
    }

    if (outerGlowRef.current) {
      (outerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = reducedMotion
        ? isHero ? 0.03 : 0.038
        : (isHero ? 0.026 : 0.034) + Math.sin(time * 0.28 + 1.2) * 0.006;
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
          opacity={isHero ? 0.34 : 0.44}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <icosahedronGeometry args={[globeRadius + 0.008, isHero ? 3 : 5]} />
        <meshBasicMaterial
          color="#b8b5ac"
          transparent
          opacity={isHero ? 0.1 : 0.24}
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
          opacity={isHero ? 0.09 : 0.17}
          wireframe
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {gridLines.map((line, index) => (
        <primitive key={`grid-${index}`} object={line} />
      ))}

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[landPoints.world, 3]} count={landPoints.world.length / 3} />
        </bufferGeometry>
        <pointsMaterial
          color="#b8b5ac"
          size={0.008}
          sizeAttenuation
          transparent
          opacity={isHero ? 0.22 : 0.48}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[landPoints.asia, 3]} count={landPoints.asia.length / 3} />
        </bufferGeometry>
        <pointsMaterial
          color="#f4efe6"
          size={0.01}
          sizeAttenuation
          transparent
          opacity={isHero ? 0.42 : 0.66}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[landPoints.minorNodes, 3]} count={landPoints.minorNodes.length / 3} />
        </bufferGeometry>
        <pointsMaterial
          color="#6b7a5a"
          size={0.014}
          sizeAttenuation
          transparent
          opacity={isHero ? 0.22 : 0.34}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <primitive object={asiaNetwork} />

      <points ref={asiaNodesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[asiaCityNodes, 3]} count={asiaCityNodes.length / 3} />
        </bufferGeometry>
        <pointsMaterial
          color="#f4efe6"
          size={isHero ? 0.022 : 0.024}
          sizeAttenuation
          transparent
          opacity={isHero ? 0.62 : 0.82}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <ArcConnections reducedMotion={reducedMotion} intensity={isHero ? 0.58 : 1} />
      {isHero ? null : <GatewayCore reducedMotion={reducedMotion} />}

      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[globeRadius + 0.28, 80, 80]} />
        <meshBasicMaterial
          color="#c9c5bb"
          transparent
          opacity={0.1}
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
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
