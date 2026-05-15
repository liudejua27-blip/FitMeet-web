import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const identitySpecs = [
  {
    labelZh: '人类',
    labelEn: 'HUMAN',
    symbol: 'H',
    radius: 3.08,
    tiltX: 0.18,
    tiltZ: 0.05,
    speed: 0.088,
    phase: 0.1,
    color: '#f4efe6',
  },
  {
    labelZh: '宠物',
    labelEn: 'PETS',
    symbol: 'P',
    radius: 3.34,
    tiltX: -0.26,
    tiltZ: 0.14,
    speed: 0.071,
    phase: 1.36,
    color: '#b8b5ac',
  },
  {
    labelZh: '机器人',
    labelEn: 'ROBOTS',
    symbol: 'R',
    radius: 3.74,
    tiltX: 0.48,
    tiltZ: -0.1,
    speed: 0.053,
    phase: 2.62,
    color: '#8c8a6e',
  },
  {
    labelZh: 'AI智能',
    labelEn: 'AI INTELLIGENCE',
    symbol: 'AI',
    radius: 4.08,
    tiltX: -0.13,
    tiltZ: 0.22,
    speed: 0.044,
    phase: 3.85,
    color: '#c9c5bb',
  },
  {
    labelZh: '智能体',
    labelEn: 'AGENTS',
    symbol: 'A',
    radius: 4.42,
    tiltX: 0.34,
    tiltZ: -0.15,
    speed: 0.036,
    phase: 5.05,
    color: '#6b7a5a',
  },
] as const;

const agentSpecs = [
  { label: 'OpenClaw', radius: 4.74, tiltX: 0.58, tiltZ: -0.22, speed: 0.034, phase: 0.5 },
  { label: 'Codex', radius: 4.96, tiltX: -0.38, tiltZ: 0.28, speed: 0.029, phase: 1.8 },
  { label: 'Hermes', radius: 5.18, tiltX: 0.26, tiltZ: 0.46, speed: 0.025, phase: 3.1 },
  { label: 'QClaw', radius: 5.38, tiltX: -0.64, tiltZ: -0.16, speed: 0.022, phase: 4.45 },
  { label: 'Custom Agent', radius: 5.62, tiltX: 0.12, tiltZ: -0.52, speed: 0.019, phase: 5.5 },
] as const;

function buildRing(radius: number, color: string, opacity: number) {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 320; index += 1) {
    const angle = (index / 320) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Line(geometry, material);
}

function IdentityNode({
  symbol,
  labelZh,
  labelEn,
  color,
}: {
  symbol: string;
  labelZh: string;
  labelEn: string;
  color: string;
}) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.085, 18, 18]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.17, 0.006, 8, 44]} />
        <meshBasicMaterial color={color} transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <Text
        position={[0, -0.24, 0]}
        fontSize={symbol.length > 1 ? 0.076 : 0.1}
        color={color}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        {symbol}
      </Text>
      <Text
        position={[0.38, -0.05, 0]}
        fontSize={0.08}
        color="#f4efe6"
        anchorX="left"
        anchorY="middle"
        material-transparent
        material-opacity={0.72}
        material-toneMapped={false}
      >
        {labelZh}
      </Text>
      <Text
        position={[0.38, -0.18, 0]}
        fontSize={0.056}
        color="#b8b5ac"
        anchorX="left"
        anchorY="middle"
        material-transparent
        material-opacity={0.64}
        material-toneMapped={false}
      >
        {labelEn}
      </Text>
    </group>
  );
}

function AgentCapsule({ label }: { label: string }) {
  return (
    <group>
      <mesh>
        <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
        <meshBasicMaterial color="#c9c5bb" transparent opacity={0.62} depthWrite={false} />
      </mesh>
      <Text
        position={[0.18, 0.02, 0]}
        fontSize={0.056}
        color="#b8b5ac"
        anchorX="left"
        anchorY="middle"
        material-transparent
        material-opacity={0.54}
        material-toneMapped={false}
      >
        {label}
      </Text>
    </group>
  );
}

export function OrbitingEntities({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<THREE.Group>(null);
  const identityRefs = useRef<(THREE.Group | null)[]>([]);
  const agentRefs = useRef<(THREE.Group | null)[]>([]);

  const identityRings = useMemo(
    () => identitySpecs.map((spec) => buildRing(spec.radius, spec.color, 0.18)),
    [],
  );
  const agentRings = useMemo(() => agentSpecs.map((spec) => buildRing(spec.radius, '#8c8a6e', 0.11)), []);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (rootRef.current) rootRef.current.rotation.y = reducedMotion ? 0.08 : time * 0.0035;

    identitySpecs.forEach((spec, index) => {
      const node = identityRefs.current[index];
      if (!node) return;

      const angle = (reducedMotion ? 0 : time * spec.speed) + spec.phase;
      const float = reducedMotion ? 0 : Math.sin(time * 0.34 + index * 1.5) * 0.1;
      node.position.set(Math.cos(angle) * spec.radius, float, Math.sin(angle) * spec.radius);
      node.rotation.y = -angle + Math.PI / 2;
      node.scale.setScalar(1 + (reducedMotion ? 0 : Math.sin(time * 0.55 + index) * 0.035));
    });

    agentSpecs.forEach((spec, index) => {
      const node = agentRefs.current[index];
      if (!node) return;

      const angle = (reducedMotion ? 0 : -time * spec.speed) + spec.phase;
      node.position.set(Math.cos(angle) * spec.radius, Math.sin(time * 0.22 + index) * 0.08, Math.sin(angle) * spec.radius);
      node.rotation.y = -angle + Math.PI / 2;
    });
  });

  return (
    <group ref={rootRef}>
      {identitySpecs.map((spec, index) => (
        <group key={spec.labelEn} rotation={[spec.tiltX, 0, spec.tiltZ]}>
          <primitive object={identityRings[index]} />
          <group
            ref={(element) => {
              identityRefs.current[index] = element;
            }}
          >
            <IdentityNode
              symbol={spec.symbol}
              labelZh={spec.labelZh}
              labelEn={spec.labelEn}
              color={spec.color}
            />
          </group>
        </group>
      ))}

      {agentSpecs.map((spec, index) => (
        <group key={spec.label} rotation={[spec.tiltX, 0, spec.tiltZ]}>
          <primitive object={agentRings[index]} />
          <group
            ref={(element) => {
              agentRefs.current[index] = element;
            }}
          >
            <AgentCapsule label={spec.label} />
          </group>
        </group>
      ))}
    </group>
  );
}
