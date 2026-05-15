import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CameraRig } from './CameraRig';
import { pointerProgress, scrollProgress } from './cameraMotion';
import { DigitalGlobe } from './DigitalGlobe';
import { OrbitingEntities } from './OrbitingEntities';
import { ParticleField } from './ParticleField';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function useWebGLAvailable() {
  const [available] = useState(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  });

  return available;
}

export function EarthScene() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const webglAvailable = useWebGLAvailable();

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    if (!reducedMotion) {
      const proxy = { value: 0 };
      const tween = gsap.to(proxy, {
        value: 1,
        paused: true,
        ease: 'none',
        onUpdate: () => {
          scrollProgress.value = proxy.value;
        },
      });

      const trigger = ScrollTrigger.create({
        trigger: document.querySelector('.living-orbit-home') ?? document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.7,
        onUpdate: (self) => tween.progress(self.progress),
      });

      const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250);

      return () => {
        window.clearTimeout(refreshTimer);
        trigger.kill();
        tween.kill();
      };
    }

    scrollProgress.value = 0.12;
    return undefined;
  }, [reducedMotion]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotion) return;
      pointerProgress.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerProgress.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [reducedMotion]);

  if (!webglAvailable) {
    return (
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(107,122,90,0.2),transparent_58%)]" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <div className="living-css-globe" />
      <div className="absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_73%_45%,transparent_20%,rgba(9,9,8,0.46)_62%,#090908_100%)]" />
      <Canvas
        camera={{ position: [0, 0.32, 7.6], fov: isMobile ? 45 : 35 }}
        dpr={[1, isMobile ? 1.15 : 1.8]}
        gl={{ alpha: true, antialias: !isMobile, powerPreference: 'high-performance' }}
      >
        <fog attach="fog" args={['#090908', 11, 28]} />
        <ambientLight intensity={0.34} />
        <directionalLight position={[4, 5, 3]} intensity={0.64} color="#f4efe6" />
        <pointLight position={[-5, -3, 2]} intensity={0.42} color="#6b7a5a" />
        <pointLight position={[4, -2, -5]} intensity={0.22} color="#c9c5bb" />
        <Suspense fallback={null}>
          <CameraRig reducedMotion={reducedMotion} />
          <group
            position={isMobile ? [0, 0.86, -0.35] : [1.9, 0.03, -0.18]}
            scale={isMobile ? 0.9 : 1.48}
          >
            <DigitalGlobe reducedMotion={reducedMotion} />
            <OrbitingEntities reducedMotion={reducedMotion} />
          </group>
          <ParticleField count={isMobile ? 420 : 1100} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default EarthScene;
