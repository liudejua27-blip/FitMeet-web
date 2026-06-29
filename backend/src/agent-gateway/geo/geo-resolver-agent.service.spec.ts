import { GeoResolverService } from './geo-resolver.service';

describe('GeoResolverService async provider path', () => {
  it('uses a nationwide provider candidate when one is available', async () => {
    const provider = {
      resolve: jest.fn().mockResolvedValue({
        rawText: '华师大',
        normalizedQuery: '华师大',
        cityHint: null,
        candidates: [
          {
            name: '华南师范大学',
            address: '广东省广州市天河区',
            province: '广东省',
            city: '广州',
            district: '天河区',
            adcode: '440106',
            lat: 23.14,
            lng: 113.35,
            level: 'poi',
            source: 'amap',
            confidence: 0.88,
          },
        ],
        selected: {
          name: '华南师范大学',
          address: '广东省广州市天河区',
          province: '广东省',
          city: '广州',
          district: '天河区',
          adcode: '440106',
          lat: 23.14,
          lng: 113.35,
          level: 'poi',
          source: 'amap',
          confidence: 0.88,
        },
        needsConfirmation: false,
        displayLocationText: '广州市天河区华南师范大学',
        source: 'amap',
      }),
    };
    const service = new GeoResolverService(provider as never);

    await expect(
      service.resolveAsync({
        message: '明晚华师大附近打羽毛球',
        locationText: '华师大附近',
      }),
    ).resolves.toMatchObject({
      city: '广州',
      district: '天河区',
      poiName: '华南师范大学',
      lat: 23.14,
      lng: 113.35,
      source: 'amap',
      needsConfirmation: false,
    });
  });

  it('falls back to local conservative resolution when provider has no match', async () => {
    const provider = {
      resolve: jest.fn().mockResolvedValue({
        rawText: '学校',
        normalizedQuery: '学校',
        candidates: [],
        selected: null,
        needsConfirmation: false,
        displayLocationText: '学校',
        source: 'unknown',
      }),
    };
    const service = new GeoResolverService(provider as never);

    await expect(
      service.resolveAsync({
        message: '明晚学校附近跑步',
        locationText: '学校附近',
      }),
    ).resolves.toMatchObject({
      poiName: '学校',
      source: 'unknown',
      needsConfirmation: true,
    });
  });
});
