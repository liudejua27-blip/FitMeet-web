import { memo, useEffect, useRef, useState } from 'react';
import { loadAmap } from '../../lib/amap';
import type { AmapInstance, Coordinates } from '../../lib/amap';

interface AmapMeetMapProps {
  location?: Coordinates | null;
  title: string;
  address: string;
  userLocation?: Coordinates | null;
}

export const AmapMeetMap = memo(function AmapMeetMap({
  location,
  title,
  address,
  userLocation,
}: AmapMeetMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mapRef.current || !location) return undefined;

    let mapInstance: AmapInstance | null = null;
    let disposed = false;

    loadAmap().then((amap) => {
      if (!amap || disposed || !mapRef.current) {
        setFailed(true);
        return;
      }

      const container = mapRef.current;
      if (!container) return;

      mapInstance = new amap.Map(container, {
        zoom: 14,
        center: [location.lng, location.lat],
        mapStyle: 'amap://styles/darkblue',
        resizeEnable: true,
      });

      new amap.Marker({
        position: [location.lng, location.lat],
        title,
      }).setMap(mapInstance);

      if (userLocation) {
        new amap.Marker({
          position: [userLocation.lng, userLocation.lat],
          title: '我的位置',
          content:
            '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>',
        }).setMap(mapInstance);
      }
    });

    return () => {
      disposed = true;
      mapInstance?.destroy();
    };
  }, [address, location, title, userLocation]);

  if (!location || failed) {
    return (
      <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="z-10 px-6 text-center">
          <div className="text-sm font-bold text-white">{title}</div>
          <div className="mt-1 text-xs text-textMuted">{address}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div ref={mapRef} className="h-[260px] w-full" />
      <div className="border-t border-border px-4 py-3">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="mt-1 text-xs text-textMuted">{address}</div>
      </div>
    </div>
  );
});
