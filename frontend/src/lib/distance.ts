import type { Coordinates } from './amap';

export function formatDistanceMeters(meters?: number | null) {
  if (!Number.isFinite(meters)) return '';
  const value = meters as number;
  if (value < 1000) return `${Math.max(Math.round(value), 0)}m`;
  if (value < 10000) return `${(value / 1000).toFixed(1)}km`;
  return `${Math.round(value / 1000)}km`;
}

export function parseDistanceMeters(value?: string | null) {
  if (!value) return undefined;
  const numeric = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numeric)) return undefined;
  return /km/i.test(value) || value.includes('公里') ? numeric * 1000 : numeric;
}

export function distanceBetweenMeters(a: Coordinates, b: Coordinates) {
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

export function getMeetDistanceMeters(meet: {
  distanceMeters?: number;
  dist?: string;
  lat?: number | null;
  lng?: number | null;
}, origin?: Coordinates | null) {
  if (Number.isFinite(meet.distanceMeters)) return meet.distanceMeters;
  if (
    origin &&
    Number.isFinite(meet.lat) &&
    Number.isFinite(meet.lng)
  ) {
    return distanceBetweenMeters(origin, { lat: meet.lat as number, lng: meet.lng as number });
  }
  return parseDistanceMeters(meet.dist);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
