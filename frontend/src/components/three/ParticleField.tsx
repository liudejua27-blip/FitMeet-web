import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type ParticleFieldProps = {
  count: number;
  reducedMotion: boolean;
};

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function ParticleField({ count, reducedMotion }: ParticleFieldProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const { positions, base, speeds } = useMemo(() => {
    const nextPositions = new Float32Array(count * 3);
    const nextBase = new Float32Array(count * 3);
    const nextSpeeds = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const radius = 6 + seededUnit(index + 1) * 10;
      const theta = seededUnit(index + 101) * Math.PI * 2;
      const phi = Math.acos(2 * seededUnit(index + 201) - 1);
      const x = Math.sin(phi) * Math.cos(theta) * radius;
      const y = Math.cos(phi) * radius * 0.65;
      const z = Math.sin(phi) * Math.sin(theta) * radius - 2;

      nextPositions[index * 3] = x;
      nextPositions[index * 3 + 1] = y;
      nextPositions[index * 3 + 2] = z;
      nextBase[index * 3] = x;
      nextBase[index * 3 + 1] = y;
      nextBase[index * 3 + 2] = z;
      nextSpeeds[index] = 0.08 + seededUnit(index + 301) * 0.16;
    }

    return { positions: nextPositions, base: nextBase, speeds: nextSpeeds };
  }, [count]);

  useFrame(({ clock }) => {
    if (reducedMotion || !geometryRef.current) return;
    const time = clock.getElapsedTime();
    const attribute = geometryRef.current.attributes.position as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;

    for (let index = 0; index < count; index += 1) {
      array[index * 3] = base[index * 3] + Math.sin(time * speeds[index] + index) * 0.035;
      array[index * 3 + 1] =
        base[index * 3 + 1] + Math.cos(time * speeds[index] + index * 0.7) * 0.025;
    }

    attribute.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#f4efe6"
        size={0.012}
        sizeAttenuation
        transparent
        opacity={0.36}
        depthWrite={false}
      />
    </points>
  );
}
