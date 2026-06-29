import { Injectable, Logger } from '@nestjs/common';

import { cleanDisplayText } from '../../common/display-text.util';
import type {
  ChinaGeoProvider,
  ChinaGeoProviderResolveInput,
  GeoCandidate,
  GeoResolutionResult,
} from './geo-resolver.types';

type AmapPoi = {
  id?: string;
  name?: string;
  type?: string;
  typecode?: string;
  address?: string | unknown[];
  pname?: string;
  cityname?: string;
  adname?: string;
  adcode?: string;
  location?: string;
};

type AmapGeocode = {
  formatted_address?: string;
  province?: string;
  city?: string | unknown[];
  district?: string;
  adcode?: string;
  location?: string;
  level?: string;
};

@Injectable()
export class AmapChinaGeoProviderService implements ChinaGeoProvider {
  private readonly logger = new Logger(AmapChinaGeoProviderService.name);

  async resolve(
    input: ChinaGeoProviderResolveInput,
  ): Promise<GeoResolutionResult> {
    const query = cleanDisplayText(input.query, '').trim();
    const cityHint = cleanDisplayText(input.cityHint, '') || null;
    if (!query) {
      return this.emptyResult(input, query, 'empty_query');
    }
    const key = this.apiKey();
    if (!key) {
      return this.emptyResult(input, query, 'amap_key_missing');
    }

    const limit = Math.max(1, Math.min(input.limit ?? 5, 10));
    const [pois, geocodes] = await Promise.all([
      this.searchPoi({ key, query, cityHint, limit, signal: input.signal }),
      this.geocode({ key, query, cityHint, limit, signal: input.signal }),
    ]);
    const candidates = this.dedupeCandidates([...pois, ...geocodes]).slice(
      0,
      limit,
    );
    return this.resultFromCandidates(input, query, candidates);
  }

  private async searchPoi(input: {
    key: string;
    query: string;
    cityHint: string | null;
    limit: number;
    signal?: AbortSignal | null;
  }): Promise<GeoCandidate[]> {
    const url = new URL('https://restapi.amap.com/v3/place/text');
    url.searchParams.set('key', input.key);
    url.searchParams.set('keywords', input.query);
    url.searchParams.set('offset', String(input.limit));
    url.searchParams.set('page', '1');
    url.searchParams.set('extensions', 'all');
    url.searchParams.set('output', 'JSON');
    if (input.cityHint) url.searchParams.set('city', input.cityHint);
    const data = await this.fetchJson(url, input.signal);
    const pois = Array.isArray(data?.pois) ? (data.pois as AmapPoi[]) : [];
    return pois
      .map((poi) => this.poiToCandidate(poi, input.query, input.cityHint))
      .filter((candidate): candidate is GeoCandidate => Boolean(candidate));
  }

  private async geocode(input: {
    key: string;
    query: string;
    cityHint: string | null;
    limit: number;
    signal?: AbortSignal | null;
  }): Promise<GeoCandidate[]> {
    const url = new URL('https://restapi.amap.com/v3/geocode/geo');
    url.searchParams.set('key', input.key);
    url.searchParams.set('address', input.query);
    url.searchParams.set('output', 'JSON');
    if (input.cityHint) url.searchParams.set('city', input.cityHint);
    const data = await this.fetchJson(url, input.signal);
    const geocodes = Array.isArray(data?.geocodes)
      ? (data.geocodes as AmapGeocode[])
      : [];
    return geocodes
      .slice(0, input.limit)
      .map((geocode) =>
        this.geocodeToCandidate(geocode, input.query, input.cityHint),
      )
      .filter((candidate): candidate is GeoCandidate => Boolean(candidate));
  }

  private async fetchJson(
    url: URL,
    signal?: AbortSignal | null,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(url, { signal: signal ?? undefined });
      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            event: 'amap.geo.http_failed',
            status: response.status,
          }),
        );
        return null;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const status =
        typeof data.status === 'string' || typeof data.status === 'number'
          ? String(data.status)
          : '';
      if (status !== '1') {
        this.logger.warn(
          JSON.stringify({
            event: 'amap.geo.api_failed',
            infocode: data.infocode ?? null,
            info: data.info ?? null,
          }),
        );
        return null;
      }
      return data;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'amap.geo.fetch_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private poiToCandidate(
    poi: AmapPoi,
    query: string,
    cityHint: string | null,
  ): GeoCandidate | null {
    const name = cleanDisplayText(poi.name, '');
    if (!name) return null;
    const { lng, lat } = this.parseLocation(poi.location);
    const city = this.textOrUndefined(poi.cityname);
    const district = this.textOrUndefined(poi.adname);
    return {
      name,
      address: this.addressText(poi.address),
      province: this.textOrUndefined(poi.pname),
      city,
      district,
      adcode: this.textOrUndefined(poi.adcode),
      lat,
      lng,
      level: 'poi',
      source: 'amap',
      confidence: this.scoreCandidate({
        query,
        cityHint,
        name,
        city,
        district,
        hasCoordinate: Boolean(lat && lng),
        base: 0.72,
      }),
    };
  }

  private geocodeToCandidate(
    geocode: AmapGeocode,
    query: string,
    cityHint: string | null,
  ): GeoCandidate | null {
    const name = cleanDisplayText(geocode.formatted_address, '') || query;
    if (!name) return null;
    const { lng, lat } = this.parseLocation(geocode.location);
    const city = this.textOrUndefined(geocode.city);
    const district = this.textOrUndefined(geocode.district);
    return {
      name,
      address: name,
      province: this.textOrUndefined(geocode.province),
      city,
      district,
      adcode: this.textOrUndefined(geocode.adcode),
      lat,
      lng,
      level: this.levelFromAmap(geocode.level),
      source: 'amap',
      confidence: this.scoreCandidate({
        query,
        cityHint,
        name,
        city,
        district,
        hasCoordinate: Boolean(lat && lng),
        base: 0.64,
      }),
    };
  }

  private resultFromCandidates(
    input: ChinaGeoProviderResolveInput,
    query: string,
    candidates: GeoCandidate[],
  ): GeoResolutionResult {
    if (candidates.length === 0) {
      return this.emptyResult(input, query, 'no_amap_candidates');
    }
    const selected = this.selectCandidate(candidates, input.cityHint);
    const distinctCities = new Set(
      candidates
        .map((candidate) => cleanDisplayText(candidate.city, ''))
        .filter(Boolean),
    );
    const needsConfirmation =
      !selected ||
      selected.confidence < 0.76 ||
      (distinctCities.size > 1 && !input.cityHint);
    return {
      rawText: query,
      normalizedQuery: query,
      cityHint: input.cityHint ?? null,
      candidates,
      selected: selected ?? null,
      needsConfirmation,
      ambiguityReason: needsConfirmation
        ? distinctCities.size > 1
          ? 'multiple_city_candidates'
          : 'low_confidence_location'
        : null,
      displayLocationText: selected ? this.displayLocation(selected) : query,
      source: 'amap',
    };
  }

  private selectCandidate(
    candidates: GeoCandidate[],
    cityHint?: string | null,
  ): GeoCandidate | null {
    const city = cleanDisplayText(cityHint, '');
    const sorted = [...candidates].sort((left, right) => {
      const leftCityBoost = city && left.city?.includes(city) ? 0.08 : 0;
      const rightCityBoost = city && right.city?.includes(city) ? 0.08 : 0;
      return (
        right.confidence + rightCityBoost - (left.confidence + leftCityBoost)
      );
    });
    return sorted[0] ?? null;
  }

  private scoreCandidate(input: {
    query: string;
    cityHint: string | null;
    name: string;
    city?: string;
    district?: string;
    hasCoordinate: boolean;
    base: number;
  }): number {
    const query = input.query.toLowerCase();
    let score = input.base;
    if (input.name.toLowerCase().includes(query)) score += 0.12;
    if (input.cityHint && input.city?.includes(input.cityHint)) score += 0.1;
    if (input.district && query.includes(input.district)) score += 0.05;
    if (input.hasCoordinate) score += 0.04;
    return Math.max(0, Math.min(score, 0.98));
  }

  private dedupeCandidates(candidates: GeoCandidate[]): GeoCandidate[] {
    const seen = new Set<string>();
    const result: GeoCandidate[] = [];
    for (const candidate of candidates) {
      const key = [
        candidate.name,
        candidate.city,
        candidate.district,
        candidate.lat?.toFixed(5),
        candidate.lng?.toFixed(5),
      ]
        .filter(Boolean)
        .join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(candidate);
    }
    return result.sort((left, right) => right.confidence - left.confidence);
  }

  private emptyResult(
    input: ChinaGeoProviderResolveInput,
    query: string,
    reason: string,
  ): GeoResolutionResult {
    return {
      rawText: query,
      normalizedQuery: query,
      cityHint: input.cityHint ?? null,
      candidates: [],
      selected: null,
      needsConfirmation: false,
      ambiguityReason: reason,
      displayLocationText: query,
      source: 'unknown',
    };
  }

  private displayLocation(candidate: GeoCandidate): string {
    return [candidate.city, candidate.district, candidate.name]
      .map((value) => cleanDisplayText(value, ''))
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join('');
  }

  private addressText(value: unknown): string {
    if (Array.isArray(value)) return '';
    return cleanDisplayText(value, '');
  }

  private textOrUndefined(value: unknown): string | undefined {
    if (Array.isArray(value)) return undefined;
    return cleanDisplayText(value, '') || undefined;
  }

  private levelFromAmap(value: unknown): GeoCandidate['level'] {
    const text = cleanDisplayText(value, '');
    if (/区县|区|县/.test(text)) return 'district';
    if (/街道|道路/.test(text)) return 'street';
    if (/城市|市/.test(text)) return 'city';
    if (/兴趣点|门牌|地址|建筑/.test(text)) return 'address';
    return 'unknown';
  }

  private parseLocation(value: unknown): { lng?: number; lat?: number } {
    const text = cleanDisplayText(value, '');
    const [lngRaw, latRaw] = text.split(',');
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : {};
  }

  private apiKey(): string {
    return cleanDisplayText(
      process.env.FITMEET_AMAP_WEB_SERVICE_KEY ??
        process.env.AMAP_WEB_SERVICE_KEY,
      '',
    );
  }
}
