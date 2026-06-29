export type GeoResolutionSource =
  | 'amap'
  | 'cache'
  | 'explicit_city'
  | 'poi_dictionary'
  | 'profile_city'
  | 'client_geo'
  | 'llm_inferred'
  | 'user_confirmed'
  | 'unknown';

export type GeoResolution = {
  rawText: string;
  locationText?: string;
  city?: string;
  district?: string;
  poiName?: string;
  province?: string;
  lat?: number;
  lng?: number;
  source: GeoResolutionSource;
  confidence: number;
  needsConfirmation: boolean;
  confirmationQuestion?: string;
  candidates?: GeoCandidate[];
};

export type GeoCandidate = {
  name: string;
  address: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  lat?: number;
  lng?: number;
  level: 'poi' | 'district' | 'street' | 'address' | 'city' | 'unknown';
  source: 'amap' | 'baidu' | 'tencent' | 'llm' | 'cache' | 'dictionary';
  confidence: number;
};

export type GeoResolutionResult = {
  rawText: string;
  normalizedQuery: string;
  cityHint?: string | null;
  candidates: GeoCandidate[];
  selected?: GeoCandidate | null;
  needsConfirmation: boolean;
  ambiguityReason?: string | null;
  displayLocationText: string;
  source: GeoResolutionSource;
};

export type ChinaGeoProviderResolveInput = {
  query: string;
  cityHint?: string | null;
  userCity?: string | null;
  clientLat?: number | null;
  clientLng?: number | null;
  limit?: number;
  signal?: AbortSignal | null;
};

export interface ChinaGeoProvider {
  resolve(input: ChinaGeoProviderResolveInput): Promise<GeoResolutionResult>;
}
