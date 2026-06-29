export type GeoResolutionSource =
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
};
