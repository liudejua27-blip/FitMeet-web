export type Coordinates = {
  lng: number;
  lat: number;
};

export type AmapPlace = {
  id: string;
  name: string;
  address: string;
  district: string;
  location: Coordinates;
};

type AmapSearchResult = {
  poiList?: {
    pois?: Array<{
      id?: string;
      name?: string;
      address?: string;
      district?: string;
      location?: unknown;
    }>;
  };
};

type AmapRegeocodeResult = {
  regeocode?: {
    formattedAddress?: string;
    addressComponent?: {
      province?: string;
      city?: string | string[];
      district?: string;
      township?: string;
    };
    pois?: Array<{
      id?: string;
      name?: string;
      address?: string;
      location?: unknown;
    }>;
  };
};

type MapClickEvent = { lnglat: { lng: number; lat: number } };

export type AmapInstance = {
  destroy: () => void;
  setFitView?: () => void;
  on: (event: string, callback: (e: MapClickEvent) => void) => void;
  off: (event: string, callback: (e: MapClickEvent) => void) => void;
};

type AmapMarker = {
  setMap: (map: AmapInstance) => void;
};

export type AmapRuntime = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AmapInstance;
  Marker: new (options: Record<string, unknown>) => AmapMarker;
  PlaceSearch: new (options: Record<string, unknown>) => {
    search: (
      keyword: string,
      callback: (status: string, result: AmapSearchResult | string) => void,
    ) => void;
  };
  Geocoder: new (options: Record<string, unknown>) => {
    getAddress: (
      location: [number, number],
      callback: (status: string, result: AmapRegeocodeResult | string) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    AMap?: AmapRuntime;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
  }
}

let amapPromise: Promise<AmapRuntime | null> | null = null;

export function loadAmap() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapPromise) return amapPromise;

  const key = import.meta.env.VITE_MAP_API_KEY as string | undefined;
  if (!key) return Promise.resolve(null);

  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined;
  if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode };
  }

  amapPromise = new Promise<AmapRuntime | null>((resolve, reject) => {
    const existing = document.getElementById('amap-js-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.AMap ?? null), {
        once: true,
      });
      existing.addEventListener('error', () => reject(new Error('AMap failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'amap-js-sdk';
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
      key,
    )}&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.GeometryUtil`;
    script.onload = () => resolve(window.AMap ?? null);
    script.onerror = () => reject(new Error('AMap failed'));
    document.head.appendChild(script);
  }).catch(() => null);

  return amapPromise;
}

export async function searchAmapPlaces(keyword: string, city = '全国') {  const trimmed = keyword.trim();
  if (trimmed.length < 2) return [];

  const amap = await loadAmap();
  if (!amap) return [];

  return new Promise<AmapPlace[]>((resolve) => {
    const search = new amap.PlaceSearch({
      city,
      pageSize: 8,
      pageIndex: 1,
      extensions: 'base',
    });

    search.search(trimmed, (_status, result) => {
      if (typeof result === 'string') {
        resolve([]);
        return;
      }

      const pois = result.poiList?.pois ?? [];
      resolve(
        pois.flatMap((poi) => {
          const location = normalizeLocation(poi.location);
          if (!location || !poi.name) return [];
          return [
            {
              id: poi.id ?? `${poi.name}-${location.lng}-${location.lat}`,
              name: poi.name,
              address: poi.address || '',
              district: poi.district || '',
              location,
            },
          ];
        }),
      );
    });
  });
}

export async function searchNearbyPlaces(location: Coordinates, keyword = '运动健身') {
  const amap = await loadAmap();
  if (!amap) return [];

  return new Promise<AmapPlace[]>((resolve) => {
    const search = new amap.PlaceSearch({
      location: [location.lng, location.lat],
      radius: 2000,
      pageSize: 8,
      pageIndex: 1,
      extensions: 'base',
    });

    search.search(keyword, (_status, result) => {
      if (typeof result === 'string') {
        resolve([]);
        return;
      }

      const pois = result.poiList?.pois ?? [];
      resolve(
        pois.flatMap((poi) => {
          const loc = normalizeLocation(poi.location);
          if (!loc || !poi.name) return [];
          return [
            {
              id: poi.id ?? `${poi.name}-${loc.lng}-${loc.lat}`,
              name: poi.name,
              address: poi.address || '',
              district: poi.district || '',
              location: loc,
            },
          ];
        }),
      );
    });
  });
}

export async function reverseGeocode(location: Coordinates): Promise<AmapPlace | null> {
  const amap = await loadAmap();
  if (!amap) return null;

  return new Promise<AmapPlace | null>((resolve) => {
    const geocoder = new amap.Geocoder({
      extensions: 'all',
      radius: 1000,
    });

    geocoder.getAddress([location.lng, location.lat], (_status, result) => {
      if (typeof result === 'string') {
        resolve(null);
        return;
      }

      const regeocode = result.regeocode;
      if (!regeocode) {
        resolve(null);
        return;
      }

      const component = regeocode.addressComponent ?? {};
      const city = Array.isArray(component.city) ? '' : component.city || component.province || '';
      const district = [city, component.district].filter(Boolean).join(' ');
      const nearestPoi = regeocode.pois?.find((poi) => poi.name);

      resolve({
        id: nearestPoi?.id ?? `current-${location.lng.toFixed(6)}-${location.lat.toFixed(6)}`,
        name: nearestPoi?.name ?? component.township ?? component.district ?? '我的当前位置',
        address: nearestPoi?.address || regeocode.formattedAddress || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
        district: district || '当前位置',
        location,
      });
    });
  });
}

export function distanceMeters(a: Coordinates, b: Coordinates) {
  const earthRadius = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const fromLat = toRadians(a.lat);
  const toLat = toRadians(b.lat);
  const value =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function normalizeLocation(location: unknown): Coordinates | null {
  if (!location || typeof location !== 'object') return null;
  const value = location as {
    lng?: unknown;
    lat?: unknown;
    getLng?: () => number;
    getLat?: () => number;
  };
  const lng = typeof value.lng === 'number' ? value.lng : value.getLng?.();
  const lat = typeof value.lat === 'number' ? value.lat : value.getLat?.();
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng: lng as number, lat: lat as number };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
