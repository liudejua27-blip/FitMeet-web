import { Injectable, Optional } from '@nestjs/common';

import { extractKnownCity, sanitizeCity } from '../../common/city.util';
import { cleanDisplayText } from '../../common/display-text.util';
import { AmapChinaGeoProviderService } from './amap-china-geo-provider.service';
import type { GeoCandidate, GeoResolution } from './geo-resolver.types';

type ResolveGeoInput = {
  message: string;
  locationText?: string;
  city?: string;
  district?: string;
  poiName?: string;
  profileCity?: string;
  clientCity?: string;
  userConfirmed?: boolean;
};

type PoiEntry = {
  aliases: string[];
  locationText: string;
  city?: string;
  district?: string;
  poiName: string;
  province?: string;
  ambiguous?: boolean;
  confirmationQuestion?: string;
};

const POI_DICTIONARY: PoiEntry[] = [
  {
    aliases: ['陆家嘴'],
    locationText: '陆家嘴附近',
    city: '上海',
    district: '浦东新区',
    poiName: '陆家嘴',
  },
  {
    aliases: ['徐家汇'],
    locationText: '徐家汇附近',
    city: '上海',
    district: '徐汇区',
    poiName: '徐家汇',
  },
  {
    aliases: ['金鸡湖'],
    locationText: '金鸡湖附近',
    city: '苏州',
    poiName: '金鸡湖',
  },
  {
    aliases: ['五大道'],
    locationText: '五大道附近',
    city: '天津',
    poiName: '五大道',
  },
  {
    aliases: ['岳麓山'],
    locationText: '岳麓山附近',
    city: '长沙',
    poiName: '岳麓山',
  },
  {
    aliases: ['观音桥'],
    locationText: '观音桥附近',
    city: '重庆',
    poiName: '观音桥',
  },
  {
    aliases: ['北京大学', '北大'],
    locationText: '北京大学',
    city: '北京',
    district: '海淀区',
    poiName: '北京大学',
  },
  {
    aliases: ['青岛大学'],
    locationText: '青岛大学',
    city: '青岛',
    poiName: '青岛大学',
  },
  {
    aliases: ['太古里'],
    locationText: '太古里附近',
    poiName: '太古里',
    ambiguous: true,
    confirmationQuestion: '你说的太古里是成都太古里，还是北京三里屯太古里？',
  },
  {
    aliases: ['奥体中心'],
    locationText: '奥体中心附近',
    poiName: '奥体中心',
    ambiguous: true,
    confirmationQuestion: '你说的奥体中心在哪个城市或区域？',
  },
];

const GENERIC_PLACE_PATTERN = /(学校|公司)(?:附近)?/;

@Injectable()
export class GeoResolverService {
  private readonly cache = new Map<string, GeoResolution>();

  constructor(
    @Optional()
    private readonly chinaGeoProvider?: AmapChinaGeoProviderService,
  ) {}

  resolve(input: ResolveGeoInput): GeoResolution {
    const message = cleanDisplayText(input.message, '');
    const locationText = cleanDisplayText(input.locationText, '');
    const rawText = [locationText, message].filter(Boolean).join(' ');
    const explicitCity = sanitizeCity(input.city || extractKnownCity(rawText));
    const explicitPoi = cleanDisplayText(input.poiName, '');

    if (input.userConfirmed && (explicitCity || locationText)) {
      return {
        rawText,
        locationText: locationText || explicitCity,
        city: explicitCity || undefined,
        district: cleanDisplayText(input.district, '') || undefined,
        poiName: explicitPoi || undefined,
        source: 'user_confirmed',
        confidence: 1,
        needsConfirmation: false,
      };
    }

    const poi = this.findPoi(rawText);
    if (poi?.ambiguous) {
      return {
        rawText,
        locationText: locationText || poi.locationText,
        city: explicitCity || undefined,
        district: cleanDisplayText(input.district, '') || poi.district,
        poiName: explicitPoi || poi.poiName,
        province: poi.province,
        source: 'poi_dictionary',
        confidence: explicitCity ? 0.64 : 0.48,
        needsConfirmation: true,
        confirmationQuestion:
          poi.confirmationQuestion ??
          (explicitCity
            ? `我理解为：在${explicitCity}${poi.locationText}，对吗？`
            : `你说的${poi.poiName}在哪个城市？`),
      };
    }

    if (explicitCity) {
      return {
        rawText,
        locationText: locationText || poi?.locationText || explicitCity,
        city: explicitCity,
        district: cleanDisplayText(input.district, '') || poi?.district,
        poiName: explicitPoi || poi?.poiName,
        province: poi?.province,
        source: 'explicit_city',
        confidence: 0.98,
        needsConfirmation: false,
      };
    }

    if (poi) {
      if (!poi.city) {
        return {
          rawText,
          locationText: locationText || poi.locationText,
          district: poi.district,
          poiName: poi.poiName,
          province: poi.province,
          source: 'poi_dictionary',
          confidence: 0.48,
          needsConfirmation: true,
          confirmationQuestion:
            poi.confirmationQuestion ?? `你说的${poi.poiName}在哪个城市？`,
        };
      }
      return {
        rawText,
        locationText: locationText || poi.locationText,
        city: poi.city,
        district: poi.district,
        poiName: poi.poiName,
        province: poi.province,
        source: 'poi_dictionary',
        confidence: 0.9,
        needsConfirmation: true,
        confirmationQuestion: `我理解为：在${poi.city}${poi.locationText}，对吗？`,
      };
    }

    const generic = rawText.match(GENERIC_PLACE_PATTERN)?.[0];
    if (generic) {
      return {
        rawText,
        locationText: generic.endsWith('附近') ? generic : `${generic}附近`,
        poiName: generic.replace(/附近$/, ''),
        source: 'unknown',
        confidence: 0.35,
        needsConfirmation: true,
        confirmationQuestion: `你说的“${generic}”具体是哪个学校、公司或区域？`,
      };
    }

    const profileCity = sanitizeCity(input.profileCity);
    if (profileCity) {
      return {
        rawText,
        locationText: locationText || profileCity,
        city: profileCity,
        source: 'profile_city',
        confidence: 0.58,
        needsConfirmation: true,
        confirmationQuestion: `这次约练默认按${profileCity}处理吗？`,
      };
    }

    const clientCity = sanitizeCity(input.clientCity);
    if (clientCity) {
      return {
        rawText,
        locationText: locationText || clientCity,
        city: clientCity,
        source: 'client_geo',
        confidence: 0.52,
        needsConfirmation: true,
        confirmationQuestion: `这次约练是在${clientCity}吗？`,
      };
    }

    return {
      rawText,
      locationText: locationText || undefined,
      source: 'unknown',
      confidence: locationText ? 0.45 : 0.2,
      needsConfirmation: false,
    };
  }

  async resolveAsync(input: ResolveGeoInput): Promise<GeoResolution> {
    const fallback = this.resolve(input);
    const query = this.normalizedLocationQuery(input);
    if (!query || !this.chinaGeoProvider) return fallback;

    const cityHint = sanitizeCity(
      input.city ?? fallback.city ?? input.profileCity ?? input.clientCity,
    );
    const cacheKey = [query, cityHint ?? ''].join(':');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.chinaGeoProvider.resolve({
      query,
      cityHint: cityHint ?? null,
      userCity: input.profileCity ?? null,
      limit: 5,
    });
    const selected = result.selected ?? result.candidates[0] ?? null;
    if (!selected || result.source === 'unknown') return fallback;

    const geo = this.resolutionFromCandidate({
      query,
      fallback,
      selected,
      needsConfirmation: result.needsConfirmation,
      ambiguityReason: result.ambiguityReason ?? null,
    });
    this.cache.set(cacheKey, geo);
    return geo;
  }

  private findPoi(rawText: string): PoiEntry | null {
    return (
      POI_DICTIONARY.find((entry) =>
        entry.aliases.some((alias) => rawText.includes(alias)),
      ) ?? null
    );
  }

  private normalizedLocationQuery(input: ResolveGeoInput): string {
    return (
      cleanDisplayText(input.poiName, '') ||
      cleanDisplayText(input.locationText, '') ||
      cleanDisplayText(input.message, '')
    )
      .replace(/附近$/, '')
      .trim();
  }

  private resolutionFromCandidate(input: {
    query: string;
    fallback: GeoResolution;
    selected: GeoCandidate;
    needsConfirmation: boolean;
    ambiguityReason: string | null;
  }): GeoResolution {
    const locationText =
      this.displayLocation(input.selected) ||
      input.fallback.locationText ||
      input.query;
    return {
      rawText: input.query,
      locationText,
      city: sanitizeCity(input.selected.city) ?? input.fallback.city,
      district: input.selected.district ?? input.fallback.district,
      poiName: input.selected.name ?? input.fallback.poiName,
      province: input.selected.province ?? input.fallback.province,
      lat: input.selected.lat ?? input.fallback.lat,
      lng: input.selected.lng ?? input.fallback.lng,
      source: 'amap',
      confidence: input.selected.confidence,
      needsConfirmation: input.needsConfirmation,
      confirmationQuestion: input.needsConfirmation
        ? this.confirmationQuestion({
            candidate: input.selected,
            fallback: input.fallback,
            ambiguityReason: input.ambiguityReason,
          })
        : undefined,
    };
  }

  private displayLocation(candidate: GeoCandidate): string {
    return [candidate.city, candidate.district, candidate.name]
      .map((value) => cleanDisplayText(value, ''))
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join('');
  }

  private confirmationQuestion(input: {
    candidate: GeoCandidate;
    fallback: GeoResolution;
    ambiguityReason: string | null;
  }): string {
    if (input.ambiguityReason === 'multiple_city_candidates') {
      return `我查到多个城市可能匹配“${input.candidate.name}”，这次约练是在${this.displayLocation(input.candidate)}吗？`;
    }
    if (input.fallback.confirmationQuestion) {
      return input.fallback.confirmationQuestion;
    }
    return `地点我理解为${this.displayLocation(input.candidate) || input.candidate.name}，对吗？`;
  }
}
