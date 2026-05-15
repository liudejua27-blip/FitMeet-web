import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { pointerProgress, scrollProgress } from './cameraMotion';

const cameraKeys = [
  [0, 0, 0.35, 7.4],
  [0.2, -0.2, 0.22, 6.75],
  [0.42, -1.15, 0.08, 6.35],
  [0.62, 1.25, -0.24, 6.1],
  [0.82, 0.35, 0.72, 5.85],
  [1, 0, 0.35, 7.15],
] as const;

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function cameraPosition(progress: number): [number, number, number] {
  for (let index = 0; index < cameraKeys.length - 1; index += 1) {
    const [p0, x0, y0, z0] = cameraKeys[index];
    const [p1, x1, y1, z1] = cameraKeys[index + 1];
    if (progress >= p0 && progress <= p1) {
      const local = smoothstep((progress - p0) / (p1 - p0));
      return [
        x0 + (x1 - x0) * local,
        y0 + (y1 - y0) * local,
        z0 + (z1 - z0) * local,
      ];
    }
  }

  return [0, 0.35, 7.4];
}

export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree();
  const position = useRef(new THREE.Vector3(0, 0.35, 7.4));
  const lookAt = useRef(new THREE.Vector3(0, -0.05, 0));

  useFrame(() => {
    const progress = reducedMotion ? 0.12 : scrollProgress.value;
    const [x, y, z] = cameraPosition(progress);
    const targetPosition = new THREE.Vector3(
      x + pointerProgress.x * 0.18,
      y + pointerProgress.y * 0.12,
      z,
    );
    position.current.lerp(targetPosition, reducedMotion ? 0.018 : 0.035);
    camera.position.copy(position.current);

    const targetLookAt = new THREE.Vector3(
      pointerProgress.x * 0.05,
      -0.05 + pointerProgress.y * 0.035,
      0,
    );
    lookAt.current.lerp(targetLookAt, reducedMotion ? 0.018 : 0.04);
    camera.lookAt(lookAt.current);
  });

  return null;
}
