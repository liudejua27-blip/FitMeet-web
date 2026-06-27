export type NormalizedTimeGeoContext = {
  locale: string;
  countryCode: string;
  timeZone: string;
  utcOffsetMinutes: number;
  geoHash: string;
};

const DEFAULT_TIME_GEO: NormalizedTimeGeoContext = {
  locale: 'zh-CN',
  countryCode: 'CN',
  timeZone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  geoHash: '',
};

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function normalizeTimeGeoContext(input: {
  locale?: unknown;
  countryCode?: unknown;
  timeZone?: unknown;
  utcOffsetMinutes?: unknown;
  geoHash?: unknown;
  lat?: unknown;
  lng?: unknown;
}): NormalizedTimeGeoContext {
  const timeZone = normalizeTimeZone(input.timeZone);
  return {
    locale: normalizeLocale(input.locale),
    countryCode: normalizeCountryCode(input.countryCode),
    timeZone,
    utcOffsetMinutes: normalizeUtcOffset(input.utcOffsetMinutes, timeZone),
    geoHash:
      normalizeGeoHash(input.geoHash) || encodeGeoHash(input.lat, input.lng, 7),
  };
}

export function encodeGeoHash(
  latValue: unknown,
  lngValue: unknown,
  precision = 7,
): string {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return '';
  }
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';
  const latRange: [number, number] = [-90, 90];
  const lngRange: [number, number] = [-180, 180];
  while (geohash.length < precision) {
    const range = evenBit ? lngRange : latRange;
    const mid = (range[0] + range[1]) / 2;
    if ((evenBit ? lng : lat) >= mid) {
      idx = idx * 2 + 1;
      range[0] = mid;
    } else {
      idx *= 2;
      range[1] = mid;
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += GEOHASH_BASE32[idx] ?? '';
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}

function normalizeLocale(value: unknown): string {
  const text = clean(value, 20);
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(text) ? text : DEFAULT_TIME_GEO.locale;
}

function normalizeCountryCode(value: unknown): string {
  const text = clean(value, 8).toUpperCase();
  return /^[A-Z]{2,3}$/.test(text) ? text : DEFAULT_TIME_GEO.countryCode;
}

function normalizeTimeZone(value: unknown): string {
  const text = clean(value, 80);
  if (!text) return DEFAULT_TIME_GEO.timeZone;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: text }).format(new Date());
    return text;
  } catch {
    return DEFAULT_TIME_GEO.timeZone;
  }
}

function normalizeUtcOffset(value: unknown, timeZone: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= -840 && parsed <= 840) {
    return Math.round(parsed);
  }
  return offsetForTimeZone(timeZone) ?? DEFAULT_TIME_GEO.utcOffsetMinutes;
}

function offsetForTimeZone(timeZone: string): number | null {
  try {
    const date = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const name = parts.find((part) => part.type === 'timeZoneName')?.value;
    const match = name?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return null;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return sign * (hours * 60 + minutes);
  } catch {
    return null;
  }
}

function normalizeGeoHash(value: unknown): string {
  const text = clean(value, 16).toLowerCase();
  return /^[0123456789bcdefghjkmnpqrstuvwxyz]{1,16}$/.test(text) ? text : '';
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
