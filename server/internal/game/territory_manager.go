package game

import (
	"fmt"
	"sync"
	"time"
)

// Territory represents a closed area owned by a shark
type Territory struct {
	ID        string    `json:"id"`
	SharkID   string    `json:"sharkId"`
	Route     string    `json:"route"`    // Shark route type: "attack", "non-attack", "deep-sea"
	Level     int       `json:"level"`    // Shark evolution level (1-5)
	Polygon   []Vec     `json:"polygon"`
	BBox      BBox      `json:"bbox"`
	CreatedAt int64     `json:"createdAt"` // Unix timestamp in milliseconds for WS/JSON payloads
	ExpiresAt int64     `json:"expiresAt"` // Unix timestamp in milliseconds for WS/JSON payloads
}

// BBox represents a bounding box for fast collision checks
type BBox struct {
	MinX float64 `json:"minX"`
	MinY float64 `json:"minY"`
	MaxX float64 `json:"maxX"`
	MaxY float64 `json:"maxY"`
}

// TerritoryManager manages all active territories with event-driven updates
type TerritoryManager struct {
	mu          sync.RWMutex
	territories map[string]*Territory  // ID -> Territory
	byShark     map[string][]string    // SharkID -> Territory IDs
	lifetime    time.Duration
}

// NewTerritoryManager creates a new territory manager
func NewTerritoryManager(lifetime time.Duration) *TerritoryManager {
	return &TerritoryManager{
		territories: make(map[string]*Territory),
		byShark:     make(map[string][]string),
		lifetime:    lifetime,
	}
}

// CreateTerritory creates a new territory from a polygon
func (tm *TerritoryManager) CreateTerritory(sharkID string, route string, level int, polygon []Vec) *Territory {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now()
	territory := &Territory{
		ID:        fmt.Sprintf("%s_territory_%d", sharkID, now.UnixNano()),
		SharkID:   sharkID,
		Route:     route,
		Level:     level,
		Polygon:   polygon,
		BBox:      calculateBBox(polygon),
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(tm.lifetime).UnixMilli(),
	}

	tm.territories[territory.ID] = territory
	tm.byShark[sharkID] = append(tm.byShark[sharkID], territory.ID)

	return territory
}

// UpdateSharkLevel updates all territories owned by a shark when it evolves
func (tm *TerritoryManager) UpdateSharkLevel(sharkID string, newLevel int) []string {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	territoryIDs := tm.byShark[sharkID]
	updated := make([]string, 0, len(territoryIDs))

	for _, id := range territoryIDs {
		if territory, exists := tm.territories[id]; exists {
			territory.Level = newLevel
			updated = append(updated, id)
		}
	}

	return updated
}

// CheckCollision checks if a point is inside a dangerous territory
// Returns the territory if the point is in a higher-level territory, nil otherwise
func (tm *TerritoryManager) CheckCollision(sharkID string, sharkLevel int, point Vec) *Territory {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	for id, territory := range tm.territories {
		// Skip own territories
		if territory.SharkID == sharkID {
			continue
		}

		// Only check territories of higher level
		if territory.Level <= sharkLevel {
			continue
		}

		// Quick bounding box check
		if !pointInBBox(point, territory.BBox) {
			continue
		}

		// Precise polygon check
		if pointInPolygon(point, territory.Polygon) {
			return tm.territories[id]
		}
	}

	return nil
}

// RemoveExpired removes expired territories and returns their IDs
func (tm *TerritoryManager) RemoveExpired() []string {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now().UnixMilli()
	expired := make([]string, 0)

	for id, territory := range tm.territories {
		if territory.ExpiresAt <= now {
			expired = append(expired, id)
			delete(tm.territories, id)

			// Remove from byShark index
			sharkIDs := tm.byShark[territory.SharkID]
			for i, sid := range sharkIDs {
				if sid == id {
					tm.byShark[territory.SharkID] = append(sharkIDs[:i], sharkIDs[i+1:]...)
					break
				}
			}
		}
	}

	return expired
}

// RemoveSharkTerritories removes all territories owned by a shark (e.g., when shark dies)
func (tm *TerritoryManager) RemoveSharkTerritories(sharkID string) []string {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	territoryIDs := tm.byShark[sharkID]
	removed := make([]string, len(territoryIDs))
	copy(removed, territoryIDs)

	for _, id := range territoryIDs {
		delete(tm.territories, id)
	}

	delete(tm.byShark, sharkID)

	return removed
}

// GetTerritory returns a territory by ID
func (tm *TerritoryManager) GetTerritory(id string) *Territory {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return tm.territories[id]
}

// GetAllTerritories returns all active territories
func (tm *TerritoryManager) GetAllTerritories() []*Territory {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	territories := make([]*Territory, 0, len(tm.territories))
	for _, territory := range tm.territories {
		territories = append(territories, territory)
	}

	return territories
}

// GetSharkTerritories returns all territories owned by a shark
func (tm *TerritoryManager) GetSharkTerritories(sharkID string) []*Territory {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	territoryIDs := tm.byShark[sharkID]
	territories := make([]*Territory, 0, len(territoryIDs))

	for _, id := range territoryIDs {
		if territory, exists := tm.territories[id]; exists {
			territories = append(territories, territory)
		}
	}

	return territories
}

// Count returns the number of active territories
func (tm *TerritoryManager) Count() int {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return len(tm.territories)
}

// calculateBBox calculates the bounding box of a polygon
func calculateBBox(polygon []Vec) BBox {
	if len(polygon) == 0 {
		return BBox{}
	}

	bbox := BBox{
		MinX: polygon[0].X,
		MinY: polygon[0].Y,
		MaxX: polygon[0].X,
		MaxY: polygon[0].Y,
	}

	for _, p := range polygon[1:] {
		if p.X < bbox.MinX {
			bbox.MinX = p.X
		}
		if p.X > bbox.MaxX {
			bbox.MaxX = p.X
		}
		if p.Y < bbox.MinY {
			bbox.MinY = p.Y
		}
		if p.Y > bbox.MaxY {
			bbox.MaxY = p.Y
		}
	}

	return bbox
}

// pointInBBox checks if a point is inside a bounding box
func pointInBBox(pt Vec, bbox BBox) bool {
	return pt.X >= bbox.MinX && pt.X <= bbox.MaxX &&
		pt.Y >= bbox.MinY && pt.Y <= bbox.MaxY
}
