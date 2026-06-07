import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CameraRig } from './CameraRig';
import { pointerProgress, scrollProgress } from './cameraMotion';
import { DigitalGlobe } from './DigitalGlobe';
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

export function EarthScene({ mode = 'fixed' }: { mode?: 'fixed' | 'contained' }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const webglAvailable = useWebGLAvailable();
  const contained = mode === 'contained';

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

  const shellClass =
    contained
      ? 'website-earth-scene website-earth-scene--fallback'
      : 'fitmeet-earth-scene fitmeet-earth-scene--fixed fixed inset-0 z-0 pointer-events-none';

  if (!webglAvailable) {
    return (
      <div className={shellClass} aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_42%,rgba(107,122,90,0.2),transparent_58%)]" />
      </div>
    );
  }

  return (
    <div
      className={
        contained
          ? 'website-earth-scene pointer-events-none'
          : 'fitmeet-earth-scene fitmeet-earth-scene--fixed fixed inset-0 z-0 pointer-events-none'
      }
      aria-hidden="true"
    >
      <div className="living-css-globe" />
      <div className="website-earth-vignette absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_73%_45%,transparent_20%,rgba(9,9,8,0.46)_62%,#090908_100%)]" />
      <Canvas
        camera={{
          position: [0, contained ? 0.18 : 0.32, contained ? 7.2 : 7.6],
          fov: contained ? (isMobile ? 48 : 36) : isMobile ? 45 : 35,
        }}
        dpr={[1, isMobile ? 1.15 : 1.8]}
        gl={{ alpha: true, antialias: !isMobile, powerPreference: 'high-performance' }}
      >
        <fog attach="fog" args={['#090908', 11, 28]} />
        <ambientLight intensity={contained ? 0.46 : 0.34} />
        <directionalLight position={[4, 5, 3]} intensity={contained ? 0.86 : 0.82} color="#f4efe6" />
        <pointLight position={[-5, -3, 2]} intensity={contained ? 0.58 : 0.52} color="#6b7a5a" />
        <pointLight position={[4, -2, -5]} intensity={contained ? 0.36 : 0.3} color="#c9c5bb" />
        <Suspense fallback={null}>
          <CameraRig reducedMotion={reducedMotion} />
          <group
            position={
              contained
                ? isMobile
                  ? [0.05, 0.06, -0.36]
                  : [0.15, 0.01, -0.2]
                : isMobile
                  ? [0, 0.86, -0.35]
                  : [1.92, 0.04, -0.22]
            }
            scale={contained ? (isMobile ? 0.86 : 1.08) : isMobile ? 0.9 : 1.54}
          >
            <DigitalGlobe reducedMotion={reducedMotion} visualMode={contained ? 'hero' : 'ambient'} />
          </group>
          <ParticleField count={contained ? (isMobile ? 260 : 560) : isMobile ? 420 : 1100} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default EarthScene;
