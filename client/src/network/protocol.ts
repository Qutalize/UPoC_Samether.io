// Mirrors server/internal/ws/message.go

export type SharkRoute = "attack" | "non-attack" | "deep-sea" | "human";

export type BaseMessage<T extends string, P> = {
  type: T;
  payload: P;
};

// Client → Server
export type JoinMsg = BaseMessage<"join", {
  name: string;
  route: SharkRoute;
  dailyDistance?: number;
}>;
export type InputMsg = BaseMessage<"input", { angle: number; dash: boolean; draw: boolean; move: boolean }>;
export type CPStartMsg = BaseMessage<"cp_start", Record<string, never>>;
export type CPUpdateMsg = BaseMessage<"cp_update", { lat: number; lon: number; acc: number }>;
export type CPStopMsg = BaseMessage<"cp_stop", Record<string, never>>;
export type CPBalanceMsg = BaseMessage<"cp_balance", Record<string, never>>;
export type ClientMsg = JoinMsg | InputMsg | CPStartMsg | CPUpdateMsg | CPStopMsg | CPBalanceMsg;

// Server → Client payloads
export interface WelcomePayload {
  playerId: string;
  worldW: number;
  worldH: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface StateSharkView {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  stage: number;
  route?: SharkRoute;
  territories?: Point[][];
  boosted?: boolean;
}

export interface StateFoodView {
  id: string;
  x: number;
  y: number;
  isRed?: boolean;
  isDiver?: boolean;
}

export interface StateYou {
  id: string;
  x: number;
  y: number;
  xp: number;
  stage: number;
  cp?: number;
  maxCp?: number;
}

export interface StatePayload {
  tick: number;
  you: StateYou;
  full?: boolean;
  sharks?: StateSharkView[];
  foods?: StateFoodView[];
  addedSharks?: StateSharkView[];
  updatedSharks?: StateSharkView[];
  removedSharks?: string[];
  addedFoods?: StateFoodView[];
  updatedFoods?: StateFoodView[];
  removedFoods?: string[];
}

export interface DeathPayload {
  score: number;
  stage: number;
}

export interface LeaderboardPayload {
  topName: string;
  topScore: number;
}

// CP Server → Client payloads
export interface CPStartedPayload {
  sessionId: string;
}
export interface CPProgressPayload {
  pointsRecorded: number;
  estimatedDist: number;
}
export interface CPPositionView {
  lat: number;
  lon: number;
  ts?: string;
}
export interface CPResultPayload {
  distance: number;
  earned: number;
  total: number;
  positions: CPPositionView[];
}
export interface CPBalanceResultPayload {
  total: number;
}
export interface CPErrorPayload {
  code: string;
  message: string;
}

// Server → Client messages
export type WelcomeMsg = BaseMessage<"welcome", WelcomePayload>;
export type StateMsg = BaseMessage<"state", StatePayload>;
export type DeathMsg = BaseMessage<"death", DeathPayload>;
export type LeaderboardMsg = BaseMessage<"leaderboard", LeaderboardPayload>;
export type CPStartedMsg = BaseMessage<"cp_started", CPStartedPayload>;
export type CPProgressMsg = BaseMessage<"cp_progress", CPProgressPayload>;
export type CPResultMsg = BaseMessage<"cp_result", CPResultPayload>;
export type CPBalanceResultMsg = BaseMessage<"cp_balance_result", CPBalanceResultPayload>;
export type CPErrorMsg = BaseMessage<"cp_error", CPErrorPayload>;
export type ServerMsg =
  | WelcomeMsg | StateMsg | DeathMsg | LeaderboardMsg
  | CPStartedMsg | CPProgressMsg | CPResultMsg | CPBalanceResultMsg | CPErrorMsg;
