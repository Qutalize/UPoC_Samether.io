/* ============================================================
 * UECPort_Samezario データ構造 型定義
 * 配置先: client/src/data/types.ts
 *
 * 設計原則（既存サメザリオの流儀を継承）:
 *  1. サーバー権威: 進捗の「真実」はサーバー(Redis)。クライアントは射影キャッシュ
 *  2. マスタは不変(readonly)・ロック状態はマスタに持たずderive（進捗から計算）
 *  3. protocol.ts ⇔ message.go のミラー規約に従い、WSペイロード型は分離して定義
 *  4. 照合の秘匿情報(参照画像・しきい値)はサーバー専用型に隔離しクライアントへ出さない
 * ============================================================ */

/* ------------------------------------------------------------
 * 0. 共通・ID型
 * ---------------------------------------------------------- */

/** エリアID（数値）。/ws?stage=N やRedisキーで使用 */
export type AreaId = number;
/** スポットID。"spot_" + slug 形式 */
export type SpotId = string;
/** 緯度経度 */
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/* ------------------------------------------------------------
 * 1. エリア・マスターデータ（駅エリア = ステージ）
 *    → stages.master.json としてクライアント/サーバー双方が読む
 * ---------------------------------------------------------- */

export interface AreaMaster {
  readonly id: AreaId;
  /** URLや画像パスに使う英字slug（例: "chofu"） */
  readonly slug: string;
  /** 表示名（例: "調布駅エリア"） */
  readonly name: string;
  /** 最寄り駅名。深大寺のみ null（駅がない設定） */
  readonly station: string | null;
  /** 属する町名（例: ["調布ヶ丘", "布田", "小島町"]） */
  readonly towns: readonly string[];
  /** マップ表示の中心座標 */
  readonly center: GeoPoint;
  /** ゲームワールドの一辺(px)。初期エリアは狭く(1200)、通常4000、ボス5000 */
  readonly worldSize: number;
  /** 解放に必要な先行エリア。空配列 = 初期解放 */
  readonly requires: readonly AreaId[];
  /** このエリアを解放する照合スポット。初期エリアは null */
  readonly unlockSpotId: SpotId | null;
  /** ラスボスエリアか */
  readonly isBoss: boolean;
  /** bot自動補充の下限人数（過疎対策）。この人数未満ならbotが湧く */
  readonly minPopulation: number;
  /** マップ描画用のテーマ（未解放グレーは進捗からderiveするので持たない） */
  readonly theme: "lagoon" | "river" | "stadium" | "forest";
}

/* ------------------------------------------------------------
 * 2. 歴史スポット・マスターデータ
 *    クライアント公開部分。照合の答え(refImages/threshold)は
 *    SpotVerifySecret(サーバー専用)に分離。
 * ---------------------------------------------------------- */

export interface SpotMaster {
  readonly id: SpotId;
  readonly areaId: AreaId;
  /** 表示名（例: "調布市郷土博物館"） */
  readonly name: string;
  readonly location: GeoPoint;
  /** 照合を許可する半径(m)。サーバーでも二重に検証する */
  readonly geofenceM: number;
  /** クリア時獲得ポイント */
  readonly clearPoints: number;
  /** SNSシェア時ボーナスポイント */
  readonly sharePoints: number;
  /** お手本アングル画像（クライアントに配布してOKなサンプル） */
  readonly sampleImageUrl: string;
  /** 撮影ガイド文（例: "正面から建物全体が入るように"） */
  readonly angleGuide: string;
  /** 歴史解説（郷土博物館提供テキスト） */
  readonly description: string;
  /** 分類（マップのピンアイコン出し分け用） */
  readonly category: "museum" | "shrine" | "temple" | "monument" | "landmark";
}

/**
 * ★サーバー専用★ 照合の秘匿メタデータ（verify.server.json）
 * クライアントバンドルに絶対に含めないこと。
 * 含めると「照合の答えを配る」ことになる。
 */
export interface SpotVerifySecret {
  readonly spotId: SpotId;
  /** 参照画像（時間帯・天候違いで2〜3枚） */
  readonly refImages: readonly {
    readonly path: string;          // server内パス or S3キー
    readonly takenCondition: string; // "晴れ・午前" 等（チューニング記録用）
  }[];
  /** 参照画像とのハミング距離しきい値（0-64）。初期値: pHashなら20前後・dHashなら14前後（docs/07）。現地サンプルで要調整 */
  readonly phashThreshold: number;
}

/* ------------------------------------------------------------
 * 3. ユーザー進行状況データ
 *    真実: サーバーRedis。クライアントは ProgressStore が保持する射影
 * ---------------------------------------------------------- */

/** スポット1件のクリア記録 */
export interface SpotClearRecord {
  readonly spotId: SpotId;
  readonly clearedAt: string;      // ISO 8601
  readonly matchScore: number;     // 照合一致度 0-100（演出・デバッグ用）
  readonly shared: boolean;        // SNSシェア済みか（ボーナス重複防止）
  readonly sharedAt?: string;
}

/** ユーザー進捗（サーバー⇔クライアントで共有するスナップショット） */
export interface UserProgress {
  /** スキーマ変更時のマイグレーション用 */
  readonly version: 1;
  /** サーバー発行の匿名トークン（auth.tsのセッションと紐づけ） */
  readonly token: string;
  readonly playerName: string;
  /** 保有ポイント（クリア+シェアボーナス+ゲーム内獲得の合算） */
  readonly points: number;
  /** 解放済みエリアID */
  readonly unlockedAreaIds: readonly AreaId[];
  /** クリア済みスポット記録（キー: spotId） */
  readonly clearedSpots: Readonly<Record<SpotId, SpotClearRecord>>;
  readonly updatedAt: string;
}

/**
 * derive関数の戻り値: エリアの表示状態。
 * 「ロック状態」はここで計算し、マスタにもRedisにも保存しない。
 */
export type AreaLockState =
  | "unlocked"        // 解放済み・プレイ可能
  | "unlockable"      // requiresを満たし、現地照合すれば解放できる
  | "locked"          // 先行エリア未解放
  | "boss-sealed";    // ボス: 全通常エリア解放まで封印

export function deriveAreaState(
  area: AreaMaster,
  progress: Pick<UserProgress, "unlockedAreaIds">,
  allAreas: readonly AreaMaster[],
): AreaLockState {
  if (progress.unlockedAreaIds.includes(area.id)) return "unlocked";
  if (area.isBoss) {
    const normals = allAreas.filter((a) => !a.isBoss);
    const allCleared = normals.every((a) => progress.unlockedAreaIds.includes(a.id));
    return allCleared ? "unlockable" : "boss-sealed";
  }
  const ok = area.requires.every((id) => progress.unlockedAreaIds.includes(id));
  return ok ? "unlockable" : "locked";
}

/* ------------------------------------------------------------
 * 4. バトル/ゲーム内エンティティデータ
 *    既存 protocol.ts の StateSharkView / StateFoodView を拡張。
 *    エンティティの生成・所有はサーバー(shark.go)、クライアントは
 *    GameState.ts の Map<string, Shark> 射影を維持（既存機構を流用）。
 * ---------------------------------------------------------- */

/** 「人」ルートは UECPort で廃止（docs/08 セクション2）。既存 protocol.ts からの除去と対で管理 */
export type SharkRoute = "attack" | "non-attack" | "deep-sea";

/** サーバー→クライアントのサメ表示情報（既存StateSharkViewに3項目追加） */
export interface StateSharkView {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly stage: number;                 // 進化段階（既存のまま）
  readonly route?: SharkRoute;
  readonly territories?: readonly { x: number; y: number }[][];
  readonly boosted?: boolean;
  /* ---- ★UECPortで追加 ---- */
  readonly isBot?: boolean;               // bot名札・当たり判定演出の出し分け
  readonly isBoss?: boolean;              // 深大寺ヌシ演出
  readonly skin?: BotSkin;                // botの見た目バリエーション
}

export type BotSkin =
  | "mako" | "frilled" | "greenland" | "sandtiger" | "whale"  // 既存画像を流用
  | "megalodon";                                              // ボス専用

/** botの出現プロファイル（エリアマスタに紐づくサーバー設定） */
export interface BotProfile {
  readonly areaId: AreaId;
  /** 通常bot: プレイヤー数がminPopulation未満のとき補充される個体の定義 */
  readonly fill: {
    readonly namePrefix: string;         // 例: "bot-chofu-"
    readonly stageRange: readonly [number, number]; // 進化段階の下限・上限
    readonly skins: readonly BotSkin[];
    readonly aggression: number;         // 0-1: エサ優先 ⇔ プレイヤー追跡
  };
  /** ボス定義（isBossエリアのみ） */
  readonly boss?: {
    readonly name: string;               // 例: "深大寺のヌシ"
    readonly stage: number;              // 最大進化段階
    readonly skin: BotSkin;
    readonly aggression: number;
    readonly rewardPoints: number;       // 討伐ボーナス
  };
}

/* ------------------------------------------------------------
 * 5. WSプロトコル追加分（protocol.ts へ追記する型）
 *    ※ server/internal/ws/message.go と必ず対で編集すること
 * ---------------------------------------------------------- */

export type BaseMessage<T extends string, P> = { type: T; payload: P };

/** C→S: 参加（stageId/tokenを追加、dailyDistanceは廃止） */
export type JoinMsg = BaseMessage<"join", {
  name: string;
  route: SharkRoute;
  stageId: AreaId;
  token: string;
}>;

/** C→S: 進捗要求 / シェア完了通知 */
export type ProgressGetMsg = BaseMessage<"progress_get", Record<string, never>>;
export type ShareDoneMsg = BaseMessage<"share_done", { spotId: SpotId }>;

/** S→C: 進捗スナップショット（ログイン直後・解放直後に配信） */
export type ProgressMsg = BaseMessage<"progress", UserProgress>;
/** S→C: ポイント加算通知（シェアボーナス・ボス討伐） */
export type PointsAwardMsg = BaseMessage<"points_award", {
  reason: "share" | "spot_clear" | "boss";
  amount: number;
  total: number;
}>;
/** S→C: 未解放エリアへのjoin拒否 */
export type JoinRejectedMsg = BaseMessage<"join_rejected", {
  stageId: AreaId;
  reason: "locked" | "boss_sealed" | "room_full";
}>;

/* ------------------------------------------------------------
 * 6. 照合API（HTTP）の入出力型
 * ---------------------------------------------------------- */

/** POST /api/verify のリクエスト（multipart/form-dataの論理型） */
export interface VerifyRequest {
  photo: File;        // Canvasで長辺1280pxにリサイズ済みJPEG
  spotId: SpotId;
  lat: number;
  lon: number;
  token: string;
}

export type VerifyResponse =
  | {
      ok: true;
      spotId: SpotId;
      matchScore: number;                 // 0-100
      unlockedAreaId: AreaId | null;      // このクリアで解放されたエリア（なければnull）
      progress: UserProgress;             // 更新後スナップショット（クライアントはこれで上書き）
    }
  | {
      ok: false;
      error: "TOO_FAR" | "NO_MATCH" | "RATE_LIMITED" | "ALREADY_CLEARED" | "BAD_IMAGE";
      /** TOO_FARのとき: あと何m近づけばよいか（UIガイド用） */
      distanceM?: number;
    };