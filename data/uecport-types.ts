export type StageId = string;
export type SpotId = string;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface SpotDefinition {
  id: SpotId;
  name: string;
  description: string;
  location?: GeoPoint;
  points: number;
}

export interface StageDefinition {
  id: StageId;
  name: string;
  description: string;
  spots: SpotDefinition[];
  requiredSpotCount: number;
}

export interface VerificationResult {
  spotId: SpotId;
  matched: boolean;
  score?: number;
  verifiedAt: string;
}

export interface PlayerProgress {
  version: number;
  playerId: string;
  unlockedStageIds: StageId[];
  verifiedSpotIds: SpotId[];
  totalPoints: number;
  updatedAt: string;
}
