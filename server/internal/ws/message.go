package ws

import "encoding/json"

// ============================================================
// 共通ラッパー（新プロトコル）
// ============================================================

type BaseMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// ============================================================
// 基本型（既存流用）
// ============================================================

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// ============================================================
// --- Client → Server Payload ---
// ============================================================

type JoinPayload struct {
	Name          string  `json:"name"`
	Route         string  `json:"route,omitempty"`
	DailyDistance float64 `json:"dailyDistance,omitempty"`
}

type InputPayload struct {
	Angle float64 `json:"angle"`
	Dash  bool    `json:"dash"`
	Draw  bool    `json:"draw"`
	Move  bool    `json:"move"`
}

// ============================================================
// --- Server → Client Payload ---
// ============================================================

type WelcomePayload struct {
	PlayerID string          `json:"playerId"`
	WorldW   float64         `json:"worldW"`
	WorldH   float64         `json:"worldH"`
	Room     RoomInfoPayload `json:"room"`
}

type StatePayload struct {
	Tick int64    `json:"tick"`
	You  StateYou `json:"you"`
	Full bool     `json:"full,omitempty"`

	Sharks []StateSharkView `json:"sharks,omitempty"`
	Foods  []StateFoodView  `json:"foods,omitempty"`

	AddedSharks   []StateSharkView `json:"addedSharks,omitempty"`
	UpdatedSharks []StateSharkView `json:"updatedSharks,omitempty"`
	RemovedSharks []string         `json:"removedSharks,omitempty"`

	AddedFoods   []StateFoodView `json:"addedFoods,omitempty"`
	UpdatedFoods []StateFoodView `json:"updatedFoods,omitempty"`
	RemovedFoods []string        `json:"removedFoods,omitempty"`
}

type DeathPayload struct {
	Score int `json:"score"`
	Stage int `json:"stage"`
}

type LeaderboardPayload struct {
	TopName  string `json:"topName"`
	TopScore int    `json:"topScore"`
}

type RoomInfoPayload struct {
	ID         string `json:"id"`
	Capacity   int    `json:"capacity"`
	Players    int    `json:"players"`
	InstanceID string `json:"instanceId"`
}

type RoomFullPayload struct {
	Room   RoomInfoPayload `json:"room"`
	Reason string          `json:"reason"`
}

// ============================================================
// --- 既存View構造（互換維持）
// ============================================================

type StateSharkView struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	X           float64   `json:"x"`
	Y           float64   `json:"y"`
	Angle       float64   `json:"angle"`
	Stage       int       `json:"stage"`
	Route       string    `json:"route,omitempty"`
	Territories [][]Point `json:"territories,omitempty"`
	Boosted     bool      `json:"boosted,omitempty"`
}

type StateFoodView struct {
	ID      string  `json:"id"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	IsRed   bool    `json:"isRed,omitempty"`
	IsDiver bool    `json:"isDiver,omitempty"`
}

type StateYou struct {
	ID    string  `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	XP    int     `json:"xp"`
	Stage int     `json:"stage"`
	CP    int     `json:"cp,omitempty"`
	MaxCP int     `json:"maxCp,omitempty"`
}

// ============================================================
// --- ユーティリティ（新プロトコル）
// ============================================================

func mustRaw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func MustMarshal(msgType string, payload any) []byte {
	msg, _ := json.Marshal(BaseMessage{
		Type:    msgType,
		Payload: mustRaw(payload),
	})
	return msg
}

// ============================================================
// --- 受信デコード（新）
// ============================================================

func DecodeMessage(data []byte) (string, any, error) {
	var base BaseMessage
	if err := json.Unmarshal(data, &base); err != nil {
		return "", nil, err
	}

	switch base.Type {
	case "join":
		var p JoinPayload
		if err := json.Unmarshal(base.Payload, &p); err != nil {
			return "", nil, err
		}
		return base.Type, p, nil
	case "input":
		var p InputPayload
		if err := json.Unmarshal(base.Payload, &p); err != nil {
			return "", nil, err
		}
		return base.Type, p, nil
	case "cp_update":
		var p CPUpdatePayload
		if err := json.Unmarshal(base.Payload, &p); err != nil {
			return "", nil, err
		}
		return base.Type, p, nil
	default:
		return base.Type, base.Payload, nil
	}
}

// ============================================================
// --- 送信ヘルパー
// ============================================================

func EncodeState(state StatePayload) []byte {
	return MustMarshal("state", state)
}

func EncodeWelcome(w WelcomePayload) []byte {
	return MustMarshal("welcome", w)
}

func EncodeDeath(d DeathPayload) []byte {
	return MustMarshal("death", d)
}

func EncodeLeaderboard(l LeaderboardPayload) []byte {
	return MustMarshal("leaderboard", l)
}

// ============================================================
// --- CP (Charge Point) Client → Server Payload ---
// ============================================================

type CPUpdatePayload struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
	Acc float64 `json:"acc"`
}

// ============================================================
// --- Territory System Messages ---
// ============================================================

type TerritoryPayload struct {
	ID        string  `json:"id"`
	SharkID   string  `json:"sharkId"`
	Route     string  `json:"route"`
	Level     int     `json:"level"`
	Polygon   []Point `json:"polygon"`
	ExpiresAt int64   `json:"expiresAt"`
}

type TerritoryCreatedPayload struct {
	Territory TerritoryPayload `json:"territory"`
}

type TerritoryUpdatedPayload struct {
	TerritoryID string `json:"territoryId"`
	NewLevel    int    `json:"newLevel"`
	Timestamp   int64  `json:"timestamp"`
}

type TerritoryExpiredPayload struct {
	TerritoryIDs []string `json:"territoryIds"`
}

type MyEvolutionPayload struct {
	NewLevel               int  `json:"newLevel"`
	RecalculateTerritories bool `json:"recalculateTerritories"`
}

func EncodeTerritoryCreated(t TerritoryCreatedPayload) []byte {
	return MustMarshal("territory_created", t)
}

func EncodeTerritoryUpdated(t TerritoryUpdatedPayload) []byte {
	return MustMarshal("territory_updated", t)
}

func EncodeTerritoryExpired(t TerritoryExpiredPayload) []byte {
	return MustMarshal("territory_expired", t)
}

func EncodeMyEvolution(e MyEvolutionPayload) []byte {
	return MustMarshal("my_evolution", e)
}
