'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Five lifeform / agent types orbiting the Earth
const ORBITS = [
  { radius: 2.82, tiltX:  0.18, tiltZ:  0.06, speed: 0.155, phase: 0.00, color: '#E8E4DC', secCount: 8  },
  { radius: 3.18, tiltX: -0.30, tiltZ:  0.14, speed: 0.105, phase: 1.26, color: '#B8B5AC', secCount: 6  },
  { radius: 3.55, tiltX:  0.50, tiltZ: -0.09, speed: 0.078, phase: 2.51, color: '#8C8A6E', secCount: 6  },
  { radius: 3.92, tiltX: -0.13, tiltZ:  0.20, speed: 0.058, phase: 3.77, color: '#6B7A5A', secCount: 5  },
  { radius: 4.30, tiltX:  0.36, tiltZ: -0.14, speed: 0.040, phase: 5.03, color: '#C8C4B8', secCount: 5  },
] as const;

export function OrbitingEntities() {
  const groupRef = useRef<THREE.Group>(null);
  const nodeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringMatRefs = useRef<(THREE.LineBasicMaterial | null)[]>([]);

  // ── Orbit ring Line objects (once) ────────────────────────────────
  const ringObjects = useMemo(() =>
    ORBITS.map((o, i) => {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 256; j++) {
        const a = (j / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * o.radius, 0, Math.sin(a) * o.radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.16, depthWrite: false });
      ringMatRefs.current[i] = mat;
      return new THREE.Line(geo, mat);
    }),
    [],
  );

  // ── Secondary orbit particles (scattered along orbit path) ────────
  const secData = useMemo(() =>
    ORBITS.map((o) => {
      const n = o.secCount;
      const pos    = new Float32Array(n * 3);
      const phases = new Float32Array(n);
      const speeds = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        phases[i] = (i / n) * Math.PI * 2;
        speeds[i] = o.speed * (0.55 + Math.random() * 0.85);
        pos[i * 3]     = Math.cos(phases[i]) * o.radius;
        pos[i * 3 + 2] = Math.sin(phases[i]) * o.radius;
      }
      const geo  = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return { geo, phases, speeds, pos, n };
    }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) groupRef.current.rotation.y = t * 0.0038;

    ORBITS.forEach((o, i) => {
      // Main node position
      const a = t * o.speed + o.phase;
      const node = nodeRefs.current[i];
      if (node) {
        node.position.set(Math.cos(a) * o.radius, 0, Math.sin(a) * o.radius);
        // Breathing pulse
        const pulse = 1 + Math.sin(t * 1.1 + i * 1.3) * 0.18;
        node.scale.setScalar(pulse);
      }

      // Secondary scattered particles
      const { geo, phases, speeds, pos, n } = secData[i];
      for (let j = 0; j < n; j++) {
        const sa = t * speeds[j] + phases[j];
        pos[j * 3]     = Math.cos(sa) * o.radius;
        pos[j * 3 + 1] = 0;
        pos[j * 3 + 2] = Math.sin(sa) * o.radius;
      }
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    });
  });

  return (
    <group ref={groupRef}>
      {ORBITS.map((o, i) => (
        <group key={i} rotation={[o.tiltX, 0, o.tiltZ]}>
          {/* Orbit ring */}
          <primitive object={ringObjects[i]} />

          {/* Main entity node with glow layers */}
          <mesh ref={(el) => { nodeRefs.current[i] = el; }}>
            <sphereGeometry args={[0.052, 14, 14]} />
            <meshBasicMaterial color={o.color} transparent opacity={0.95} />
          </mesh>
          {/* Glow halo 1 */}
          <mesh ref={(el) => { nodeRefs.current[i] && (nodeRefs.current[i]!.userData.halo1 = el); }}>
            <sphereGeometry args={[0.092, 10, 10]} />
            <meshBasicMaterial color={o.color} transparent opacity={0.22} depthWrite={false} />
          </mesh>
          {/* Glow halo 2 */}
          <mesh>
            <sphereGeometry args={[0.155, 8, 8]} />
            <meshBasicMaterial color={o.color} transparent opacity={0.07} depthWrite={false} />
          </mesh>

          {/* Secondary orbit particles */}
          <points>
            <primitive object={secData[i].geo} attach="geometry" />
            <pointsMaterial color={o.color} size={0.020} transparent opacity={0.28} sizeAttenuation depthWrite={false} />
          </points>
        </group>
      ))}
    </group>
  );
}
