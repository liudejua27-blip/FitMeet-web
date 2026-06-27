import { encodeGeoHash, normalizeTimeGeoContext } from './time-geo.util';

describe('time-geo.util', () => {
  it('defaults China users to Asia/Shanghai locale context', () => {
    expect(normalizeTimeGeoContext({})).toEqual({
      locale: 'zh-CN',
      countryCode: 'CN',
      timeZone: 'Asia/Shanghai',
      utcOffsetMinutes: 480,
      geoHash: '',
    });
  });

  it('normalizes explicit locale, timezone, offset and geohash', () => {
    expect(
      normalizeTimeGeoContext({
        locale: 'en-GB',
        countryCode: 'gb',
        timeZone: 'Europe/London',
        utcOffsetMinutes: 60,
        geoHash: 'gcpvj0d',
      }),
    ).toEqual({
      locale: 'en-GB',
      countryCode: 'GB',
      timeZone: 'Europe/London',
      utcOffsetMinutes: 60,
      geoHash: 'gcpvj0d',
    });
  });

  it('fails soft for invalid timezone and derives geohash from coordinates', () => {
    const context = normalizeTimeGeoContext({
      timeZone: 'Invalid/Zone',
      lat: 36.0671,
      lng: 120.3826,
    });

    expect(context.timeZone).toBe('Asia/Shanghai');
    expect(context.utcOffsetMinutes).toBe(480);
    expect(context.geoHash).toBe(encodeGeoHash(36.0671, 120.3826, 7));
    expect(context.geoHash).toHaveLength(7);
  });
});
