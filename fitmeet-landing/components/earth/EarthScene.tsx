'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/dist/ScrollTrigger';
import { DigitalGlobe } from './DigitalGlobe';
import { OrbitingEntities } from './OrbitingEntities';
import { ParticleField } from './ParticleField';

// ── Module-level refs (no re-render on change) ────────────────────
const scrollProg  = { v: 0 };
const mouseProg   = { x: 0, y: 0 };

// ── Scroll-driven camera keyframes [progress, x, y, z] ───────────
const CAM_KEYS = [
  [0.00,  0.00,  0.45, 7.60],
  [0.18,  0.00,  0.28, 7.05],
  [0.38, -0.75,  0.15, 6.85],
  [0.58,  1.20, -0.30, 6.65],
  [0.78,  0.00,  0.90, 6.10],
  [1.00,  0.00,  0.45, 7.60],
] as const;

function smoothstep(t: number) { return t * t * (3 - 2 * t); }

function getCamPos(p: number): [number, number, number] {
  for (let i = 0; i < CAM_KEYS.length - 1; i++) {
    const [p0, x0, y0, z0] = CAM_KEYS[i];
    const [p1, x1, y1, z1] = CAM_KEYS[i + 1];
    if (p >= p0 && p <= p1) {
      const s = smoothstep((p - p0) / (p1 - p0));
      return [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, z0 + (z1 - z0) * s];
    }
  }
  return [0, 0.45, 7.6];
}

// ── Camera controller (runs inside Canvas) ───────────────────────
function CameraRig() {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(0, 0.45, 7.6));
  const look = useRef(new THREE.Vector3(0, -0.05, 0));

  useFrame(() => {
    const [tx, ty, tz] = getCamPos(scrollProg.v);
    const target = new THREE.Vector3(
      tx + mouseProg.x * 0.28,
      ty + mouseProg.y * 0.18,
      tz,
    );
    pos.current.lerp(target, 0.032);
    camera.position.copy(pos.current);

    const lt = new THREE.Vector3(mouseProg.x * 0.06, -0.05 + mouseProg.y * 0.04, 0);
    look.current.lerp(lt, 0.04);
    camera.lookAt(look.current);
  });
  return null;
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const fn = () => setM(mq.matches);
    fn(); mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}

function useWebGL() {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      setOk(!!(c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch { setOk(false); }
  }, []);
  return ok;
}

export function EarthScene() {
  const isMobile = useIsMobile();
  const webglOk  = useWebGL();

  useEffect(() => {
    // ── GSAP ScrollTrigger drives scrollProg with smooth scrub ──
    gsap.registerPlugin(ScrollTrigger);

    // Tween a proxy object so scrub interpolates between frames,
    // giving the camera path a buttery feel even with stutter.
    const proxy = { v: 0 };
    const tween = gsap.to(proxy, {
      v: 1,
      ease: 'none',
      paused: true,
      onUpdate: () => { scrollProg.v = proxy.v; },
    });

    const st = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end:   'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => tween.progress(self.progress),
    });

    const onMouse = (e: MouseEvent) => {
      mouseProg.x = (e.clientX / window.innerWidth)  * 2 - 1;
      mouseProg.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouse, { passive: true });

    // ScrollTrigger.refresh after layout settles (Lenis + dynamic content)
    const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 200);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('mousemove', onMouse);
      st.kill();
      tween.kill();
    };
  }, []);

  if (!webglOk) {
    return (
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(107,122,90,0.1) 0%, transparent 70%)' }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
      {/* Edge vignette */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 82% 72% at 50% 48%, transparent 25%, #0A0A09 100%)' }}
      />
      <Canvas
        camera={{ position: [0, 0.45, 7.6], fov: 38 }}
        dpr={[1, isMobile ? 1.2 : 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <fog attach="fog" args={['#090A0C', 20, 40]} />
        <ambientLight intensity={0.35} />
        <pointLight position={[4, 6, 4]}  intensity={0.28} color="#F0ECE4" />
        <pointLight position={[-8, -4, -3]} intensity={0.14} color="#6B7A5A" />
        <Suspense fallback={null}>
          <CameraRig />
          <DigitalGlobe />
          <OrbitingEntities />
          <ParticleField count={isMobile ? 380 : 900} />
        </Suspense>

        {/* ── Postprocessing: subtle cinematic bloom on bright nodes ── */}
        {!isMobile && (
          <EffectComposer multisampling={0}>
            <Bloom
              intensity={0.55}
              luminanceThreshold={0.62}
              luminanceSmoothing={0.22}
              kernelSize={KernelSize.LARGE}
              mipmapBlur
            />
            <Vignette
              offset={0.32}
              darkness={0.55}
              blendFunction={BlendFunction.NORMAL}
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
