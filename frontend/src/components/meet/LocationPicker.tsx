import { memo, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { AmapInstance, AmapPlace, Coordinates } from '../../lib/amap';
import { loadAmap, reverseGeocode, searchAmapPlaces, searchNearbyPlaces } from '../../lib/amap';

interface LocationPickerProps {
  value: string;
  onTextChange: (value: string) => void;
  onPlaceSelect: (place: AmapPlace) => void;
  error?: string;
  selectedLocation?: Coordinates | null;
  selectedTitle?: string;
  showMap?: boolean;
  compactMap?: boolean;
  className?: string;
  userCoords?: Coordinates | null;
}

export const LocationPicker = memo(function LocationPicker({
  className,
  compactMap = false,
  error,
  onPlaceSelect,
  onTextChange,
  selectedLocation,
  selectedTitle,
  showMap = false,
  userCoords,
  value,
}: LocationPickerProps) {
  const [results, setResults] = useState<AmapPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [nearbyResults, setNearbyResults] = useState<AmapPlace[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => { onPlaceSelectRef.current = onPlaceSelect; }, [onPlaceSelect]);

  // Keyword search (debounced)
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      searchAmapPlaces(value)
        .then((places) => {
          if (active) setResults(places);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [value]);

  // Nearby POI search when focused with empty input and user coordinates available
  useEffect(() => {
    if (!isFocused || value.trim().length > 0 || !userCoords) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setLoadingNearby(true);
      searchNearbyPlaces(userCoords)
        .then((places) => {
          if (active) setNearbyResults(places);
        })
        .catch(() => {
          if (active) setNearbyResults([]);
        })
        .finally(() => {
          if (active) setLoadingNearby(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isFocused, userCoords, value]);

  const handleSelect = useCallback(
    (place: AmapPlace) => {
      onPlaceSelect(place);
      setResults([]);
      setNearbyResults([]);
    },
    [onPlaceSelect],
  );

  // Map rendering + click-to-select
  useEffect(() => {
    if (!showMap || !mapRef.current) return undefined;
    const center = selectedLocation ?? userCoords;
    if (!center) return undefined;

    let disposed = false;
    let mapInstance: AmapInstance | null = null;
    let clickHandler: ((e: { lnglat: { lng: number; lat: number } }) => void) | null = null;

    loadAmap().then((amap) => {
      if (!amap || disposed || !mapRef.current) {
        if (!amap) setMapFailed(true);
        return;
      }

      setMapFailed(false);
      const instance = new amap.Map(mapRef.current, {
        zoom: 15,
        center: [center.lng, center.lat],
        mapStyle: 'amap://styles/normal',
        resizeEnable: true,
      });
      mapInstance = instance;

      if (selectedLocation) {
        new amap.Marker({
          position: [selectedLocation.lng, selectedLocation.lat],
          title: selectedTitle || value || '已选地点',
        }).setMap(instance);
      }

      clickHandler = (ev) => {
        if (disposed) return;
        const coords = { lat: ev.lnglat.lat, lng: ev.lnglat.lng };
        reverseGeocode(coords)
          .then((place) => {
            if (!disposed && place) onPlaceSelectRef.current(place);
          })
          .catch(() => {});
      };
      instance.on('click', clickHandler);
    });

    return () => {
      disposed = true;
      if (mapInstance && clickHandler) {
        mapInstance.off('click', clickHandler);
      }
      mapInstance?.destroy();
    };
  }, [selectedLocation, selectedTitle, showMap, value, userCoords]);

  const showDropdown = isFocused && (
    (value.trim().length >= 2 && (results.length > 0 || loading)) ||
    (value.trim().length === 0 && (nearbyResults.length > 0 || loadingNearby) && !!userCoords)
  );

  return (
    <div className={clsx('space-y-3', className)}>
      <div className="relative">
        <div className="flex items-center rounded-xl border border-border bg-surfaceMuted shadow-sm transition focus-within:border-lime/40 focus-within:ring-2 focus-within:ring-lime/10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center text-base text-lime">⌖</div>
          <input
            type="text"
            placeholder="搜索健身房、公园、商场或地标"
            value={value}
            maxLength={100}
            onChange={(event) => onTextChange(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() =>
              window.setTimeout(() => {
                setIsFocused(false);
                setNearbyResults([]);
              }, 150)
            }
            className="h-11 min-w-0 flex-1 bg-transparent pr-4 text-sm font-bold text-white outline-none placeholder:text-textSofter"
          />
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
            {value.trim().length === 0 && userCoords && (
              <div className="border-b border-border px-3 py-2 text-[11px] font-black uppercase text-lime">
                附近地点
              </div>
            )}
            {(loading || loadingNearby) && <div className="px-3 py-3 text-xs font-bold text-textMuted">正在搜索高德地点...</div>}
            {!loading && !loadingNearby && value.trim().length >= 2 && results.length === 0 && (
              <div className="px-3 py-3 text-xs font-bold text-textMuted">没有找到地点，请换个关键词</div>
            )}
            {(value.trim().length >= 2 ? results : nearbyResults).map((place) => (
              <button
                key={place.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(place)}
                className="block w-full border-t border-border px-3 py-3 text-left transition hover:bg-surfaceMuted"
              >
                <div className="text-sm font-black text-white">{place.name}</div>
                <div className="mt-1 truncate text-xs text-textMuted">
                  {[place.district, place.address].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showMap && (
        <div className="overflow-hidden rounded-xl border border-border bg-surfaceMuted">
          {(selectedLocation || userCoords) && !mapFailed ? (
            <div className="relative">
              <div ref={mapRef} className={clsx('w-full', compactMap ? 'h-40' : 'h-56')} />
              {!selectedLocation && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pb-2">
                  <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white/80">
                    点击地图选择地点
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className={clsx('flex w-full items-center justify-center px-4 text-center text-xs font-bold text-textMuted', compactMap ? 'h-40' : 'h-56')}>
              {mapFailed ? '高德地图加载失败，请检查 API Key 或网络' : '选择地点后显示地图预览'}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
