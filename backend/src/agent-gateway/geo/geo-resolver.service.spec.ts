import { GeoResolverService } from './geo-resolver.service';

describe('GeoResolverService', () => {
  const service = new GeoResolverService();

  it.each([
    ['明晚陆家嘴健身', '上海', '陆家嘴'],
    ['苏州金鸡湖夜跑', '苏州', '金鸡湖'],
    ['长沙岳麓山附近跑步', '长沙', '岳麓山'],
    ['天津五大道散步', '天津', '五大道'],
    ['重庆观音桥健身', '重庆', '观音桥'],
    ['明天在北京大学篮球', '北京', '北京大学'],
    ['青岛大学附近健身', '青岛', '青岛大学'],
  ])('resolves %s to %s', (message, city, poiName) => {
    expect(service.resolve({ message })).toMatchObject({
      city,
      poiName,
      source: city === '苏州' ? 'explicit_city' : expect.any(String),
    });
  });

  it.each([
    ['成都太古里跑步', '成都'],
    ['北京太古里散步', '北京'],
    ['明晚奥体中心健身', undefined],
  ])('treats ambiguous POIs as clarification-required: %s', (message, city) => {
    const result = service.resolve({ message });
    expect(result).toMatchObject({
      source: 'poi_dictionary',
      needsConfirmation: true,
    });
    expect(result.city).toBe(city);
  });

  it.each(['明晚学校附近跑步', '下班后公司附近健身'])(
    'keeps generic nearby places unknown: %s',
    (message) => {
      const result = service.resolve({ message });
      expect(result).toMatchObject({
        source: 'unknown',
        needsConfirmation: true,
      });
      expect(result.city).toBeUndefined();
    },
  );
});
