package cp

import (
	"context"
	"fmt"
	"log"
	"time"
)

// CPResultMsg is sent back to Hub via the result channel.
type CPResultMsg struct {
	PlayerID string
	MsgType  string
	Payload  any
}

// CPStartedPayload is the response for cp_start.
type CPStartedPayload struct {
	SessionID string `json:"sessionId"`
}

// CPProgressPayload is the response for cp_update.
type CPProgressPayload struct {
	PointsRecorded int     `json:"pointsRecorded"`
	EstimatedDist  float64 `json:"estimatedDist"`
}

// CPPositionView represents a position in the result.
type CPPositionView struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
	Ts  string  `json:"ts,omitempty"`
}

// CPResultPayload is the response for cp_stop.
type CPResultPayload struct {
	Distance  float64          `json:"distance"`
	Earned    int              `json:"earned"`
	Total     int              `json:"total"`
	Positions []CPPositionView `json:"positions"`
}

// CPBalanceResultPayload is the response for cp_balance.
type CPBalanceResultPayload struct {
	Total int `json:"total"`
}

// CPErrorPayload is the error response.
type CPErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Handler manages CP sessions and coordinates with Tracker and Store.
type Handler struct {
	tracker    *TrackerClient
	store      CPStore
	sessions   map[string]*CPSession // playerID -> session
	cooldowns  map[string]time.Time  // playerID -> last session end time
	resultChan chan CPResultMsg       // async results from goroutines -> Hub
}

// NewHandler creates a new CP handler.
func NewHandler(tracker *TrackerClient, store CPStore) *Handler {
	return &Handler{
		tracker:    tracker,
		store:      store,
		sessions:   make(map[string]*CPSession),
		cooldowns:  make(map[string]time.Time),
		resultChan: make(chan CPResultMsg, 64),
	}
}

// ResultChan returns the channel for async results (Hub reads from this).
func (h *Handler) ResultChan() <-chan CPResultMsg {
	return h.resultChan
}

// HandleStart processes a cp_start message.
func (h *Handler) HandleStart(playerID string) (string, any) {
	if playerID == "" {
		return "cp_error", CPErrorPayload{Code: "NOT_JOINED", Message: "join first"}
	}
	if _, ok := h.sessions[playerID]; ok {
		return "cp_error", CPErrorPayload{Code: "ALREADY_MEASURING", Message: "session already active"}
	}
	if lastEnd, ok := h.cooldowns[playerID]; ok {
		remaining := SessionCooldown - time.Since(lastEnd)
		if remaining > 0 {
			return "cp_error", CPErrorPayload{
				Code:    "COOLDOWN",
				Message: fmt.Sprintf("wait %d seconds", int(remaining.Seconds())),
			}
		}
	}
	sess := NewSession(playerID)
	h.sessions[playerID] = sess
	return "cp_started", CPStartedPayload{SessionID: sess.SessionID}
}

// HandleUpdate processes a cp_update message.
func (h *Handler) HandleUpdate(playerID string, lat, lon, acc float64) (string, any) {
	sess, ok := h.sessions[playerID]
	if !ok || !sess.Active {
		return "cp_error", CPErrorPayload{Code: "NOT_MEASURING", Message: "no active session"}
	}
	if sess.IsExpired() {
		return h.finishSession(playerID, sess)
	}
	// Validate coordinate ranges
	if lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return "cp_error", CPErrorPayload{Code: "INVALID_POSITION", Message: "lat must be -90..90, lon must be -180..180"}
	}
	// Reject low-accuracy readings but still return progress
	if acc > AccuracyThreshold {
		return "cp_progress", CPProgressPayload{
			PointsRecorded: sess.PointCount,
			EstimatedDist:  sess.EstDist,
		}
	}
	sess.AddPosition(lat, lon)

	// Fire-and-forget position update to Tracker
	if h.tracker != nil {
		go func(devID string, la, lo float64) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.tracker.UpdatePosition(ctx, devID, la, lo); err != nil {
				log.Printf("tracker update error: %v", err)
			}
		}(sess.DeviceID, lat, lon)
	}

	return "cp_progress", CPProgressPayload{
		PointsRecorded: sess.PointCount,
		EstimatedDist:  sess.EstDist,
	}
}

// HandleStop processes a cp_stop message.
func (h *Handler) HandleStop(playerID string) (string, any) {
	sess, ok := h.sessions[playerID]
	if !ok || !sess.Active {
		return "cp_error", CPErrorPayload{Code: "NOT_MEASURING", Message: "no active session"}
	}
	return h.finishSession(playerID, sess)
}

// HandleBalance processes a cp_balance message.
func (h *Handler) HandleBalance(playerID string) (string, any) {
	if playerID == "" {
		return "cp_error", CPErrorPayload{Code: "NOT_JOINED", Message: "join first"}
	}
	total, err := h.store.GetCP(playerID)
	if err != nil {
		log.Printf("cp store GetCP error: %v", err)
		return "cp_error", CPErrorPayload{Code: "INTERNAL", Message: "failed to get balance"}
	}
	return "cp_balance_result", CPBalanceResultPayload{Total: total}
}

// finishSession ends a session and kicks off distance calculation.
func (h *Handler) finishSession(playerID string, sess *CPSession) (string, any) {
	sess.Active = false
	delete(h.sessions, playerID)
	h.cooldowns[playerID] = time.Now()

	// If Tracker is configured, fetch history asynchronously
	if h.tracker != nil {
		go h.fetchHistoryAndFinalize(playerID, sess)
		return "", nil // Hub will receive result via resultChan
	}

	// No Tracker: calculate immediately from local positions
	return h.finalizeFromLocal(playerID, sess)
}

func (h *Handler) fetchHistoryAndFinalize(playerID string, sess *CPSession) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	positions, err := h.tracker.GetHistory(ctx, sess.DeviceID, sess.StartedAt, time.Now())
	if err != nil {
		log.Printf("tracker history error: %v, falling back to local", err)
		msgType, payload := h.finalizeFromLocal(playerID, sess)
		if msgType != "" {
			h.resultChan <- CPResultMsg{PlayerID: playerID, MsgType: msgType, Payload: payload}
		}
		return
	}

	dist := CalcTotalDistance(positions)
	earned := CalcEarned(dist)
	total, err := h.store.AddCP(playerID, earned)
	if err != nil {
		log.Printf("cp store AddCP error: %v", err)
		h.resultChan <- CPResultMsg{PlayerID: playerID, MsgType: "cp_error", Payload: CPErrorPayload{Code: "INTERNAL", Message: "failed to save CP"}}
		return
	}

	cpPositions := make([]CPPositionView, 0, len(positions))
	for _, p := range positions {
		cpPositions = append(cpPositions, CPPositionView{Lat: p.Lat, Lon: p.Lon})
	}

	h.resultChan <- CPResultMsg{
		PlayerID: playerID,
		MsgType:  "cp_result",
		Payload: CPResultPayload{
			Distance:  dist,
			Earned:    earned,
			Total:     total,
			Positions: cpPositions,
		},
	}
}

func (h *Handler) finalizeFromLocal(playerID string, sess *CPSession) (string, any) {
	dist := CalcTotalDistance(sess.Positions)
	earned := CalcEarned(dist)
	total, err := h.store.AddCP(playerID, earned)
	if err != nil {
		log.Printf("cp store AddCP error: %v", err)
		return "cp_error", CPErrorPayload{Code: "INTERNAL", Message: "failed to save CP"}
	}

	cpPositions := make([]CPPositionView, 0, len(sess.Positions))
	for _, p := range sess.Positions {
		cpPositions = append(cpPositions, CPPositionView{Lat: p.Lat, Lon: p.Lon})
	}

	return "cp_result", CPResultPayload{
		Distance:  dist,
		Earned:    earned,
		Total:     total,
		Positions: cpPositions,
	}
}

// CleanupExpired should be called periodically to expire stale sessions and stale cooldowns.
func (h *Handler) CleanupExpired() []CPResultMsg {
	var results []CPResultMsg
	for pid, sess := range h.sessions {
		if sess.IsExpired() {
			sess.Active = false
			delete(h.sessions, pid)
			h.cooldowns[pid] = time.Now()
			msgType, payload := h.finalizeFromLocal(pid, sess)
			if msgType != "" {
				results = append(results, CPResultMsg{PlayerID: pid, MsgType: msgType, Payload: payload})
			}
		}
	}
	// Evict expired cooldown entries to prevent memory leak
	for pid, lastEnd := range h.cooldowns {
		if time.Since(lastEnd) > SessionCooldown {
			delete(h.cooldowns, pid)
		}
	}
	return results
}

// Balance returns the player's current CP balance from the store.
// Returns 0 on error or if the player has no balance.
func (h *Handler) Balance(playerID string) int {
	total, err := h.store.GetCP(playerID)
	if err != nil {
		return 0
	}
	return total
}

// HasSession returns true if the player has an active CP session.
func (h *Handler) HasSession(playerID string) bool {
	sess, ok := h.sessions[playerID]
	return ok && sess.Active
}

// RemovePlayer cleans up when a player disconnects.
func (h *Handler) RemovePlayer(playerID string) *CPResultMsg {
	sess, ok := h.sessions[playerID]
	if !ok {
		return nil
	}
	sess.Active = false
	delete(h.sessions, playerID)
	h.cooldowns[playerID] = time.Now()
	msgType, payload := h.finalizeFromLocal(playerID, sess)
	if msgType != "" {
		return &CPResultMsg{PlayerID: playerID, MsgType: msgType, Payload: payload}
	}
	return nil
}
