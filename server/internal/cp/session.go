package cp

import (
	"fmt"
	"time"
)

const (
	MaxSessionDuration = 60 * time.Minute
	MaxCPPerSession    = 500
	MaxCPBalance       = 10_000
	AccuracyThreshold  = 50.0 // meters
	MinSessionDistance  = 10.0 // meters; sessions under this yield 0 CP
	SessionCooldown    = 10 * time.Second
	MetersPerCP        = 5.0
)

// CPSession represents an active CP measurement session.
type CPSession struct {
	SessionID  string
	PlayerID   string
	DeviceID   string // Tracker device ID: "cp-{playerID}-{unixMs}"
	StartedAt  time.Time
	LastUpdate time.Time
	PointCount int
	Positions  []Position // server-side position log for fallback distance calc
	EstDist    float64    // running estimated distance
	Active     bool
}

// NewSession creates a new CP measurement session.
func NewSession(playerID string) *CPSession {
	now := time.Now()
	sessionID := fmt.Sprintf("cp-%s-%d", playerID, now.UnixMilli())
	return &CPSession{
		SessionID:  sessionID,
		PlayerID:   playerID,
		DeviceID:   sessionID,
		StartedAt:  now,
		LastUpdate: now,
		Active:     true,
	}
}

// IsExpired checks if the session exceeded max duration.
func (s *CPSession) IsExpired() bool {
	return time.Since(s.StartedAt) > MaxSessionDuration
}

// AddPosition records a position and returns updated estimated distance.
// Applies the same speed and stationary filters as CalcTotalDistance.
func (s *CPSession) AddPosition(lat, lon float64) float64 {
	pos := Position{Lat: lat, Lon: lon}
	n := len(s.Positions)
	if n > 0 {
		last := s.Positions[n-1]
		seg := haversine(last.Lat, last.Lon, lat, lon)
		if seg <= maxSegmentM {
			stationary := false
			if n >= 2 {
				prev := s.Positions[n-2]
				prevSeg := haversine(prev.Lat, prev.Lon, last.Lat, last.Lon)
				if prevSeg < stationaryThresholdM && seg < stationaryThresholdM {
					stationary = true
				}
			}
			if !stationary {
				s.EstDist += seg
			}
		}
	}
	s.Positions = append(s.Positions, pos)
	s.PointCount++
	s.LastUpdate = time.Now()
	return s.EstDist
}

// CalcEarned computes CP earned from the final distance.
func CalcEarned(distanceM float64) int {
	if distanceM < MinSessionDistance {
		return 0
	}
	earned := int(distanceM / MetersPerCP)
	if earned > MaxCPPerSession {
		earned = MaxCPPerSession
	}
	return earned
}
