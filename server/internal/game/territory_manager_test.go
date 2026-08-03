package game

import (
	"testing"
	"time"
)

func TestTerritoryManager_CreateTerritory(t *testing.T) {
	tm := NewTerritoryManager(30 * time.Second)

	polygon := []Vec{
		{X: 0, Y: 0},
		{X: 100, Y: 0},
		{X: 100, Y: 100},
		{X: 0, Y: 100},
		{X: 0, Y: 0},
	}

	territory := tm.CreateTerritory("shark1", "attack", 2, polygon)

	if territory == nil {
		t.Fatal("Expected territory to be created")
	}

	if territory.SharkID != "shark1" {
		t.Errorf("Expected SharkID=shark1, got %s", territory.SharkID)
	}

	if territory.Level != 2 {
		t.Errorf("Expected Level=2, got %d", territory.Level)
	}

	if tm.Count() != 1 {
		t.Errorf("Expected 1 territory, got %d", tm.Count())
	}
}

func TestTerritoryManager_UpdateSharkLevel(t *testing.T) {
	tm := NewTerritoryManager(30 * time.Second)

	polygon := []Vec{{X: 0, Y: 0}, {X: 100, Y: 0}, {X: 100, Y: 100}, {X: 0, Y: 0}}

	// Create two territories for the same shark
	t1 := tm.CreateTerritory("shark1", "attack", 2, polygon)
	t2 := tm.CreateTerritory("shark1", "attack", 2, polygon)

	// Evolve the shark
	updated := tm.UpdateSharkLevel("shark1", 3)

	if len(updated) != 2 {
		t.Errorf("Expected 2 updated territories, got %d", len(updated))
	}

	// Check that levels were updated
	if t1.Level != 3 {
		t.Errorf("Expected territory 1 level=3, got %d", t1.Level)
	}

	if t2.Level != 3 {
		t.Errorf("Expected territory 2 level=3, got %d", t2.Level)
	}
}

func TestTerritoryManager_CheckCollision(t *testing.T) {
	tm := NewTerritoryManager(30 * time.Second)

	// Create a square territory
	polygon := []Vec{
		{X: 0, Y: 0},
		{X: 100, Y: 0},
		{X: 100, Y: 100},
		{X: 0, Y: 100},
		{X: 0, Y: 0},
	}

	tm.CreateTerritory("shark1", "attack", 3, polygon)

	tests := []struct {
		name        string
		sharkID     string
		sharkLevel  int
		point       Vec
		shouldDie   bool
		description string
	}{
		{
			name:        "Own territory - safe",
			sharkID:     "shark1",
			sharkLevel:  3,
			point:       Vec{X: 50, Y: 50},
			shouldDie:   false,
			description: "Should not collide with own territory",
		},
		{
			name:        "Lower level in higher territory - dies",
			sharkID:     "shark2",
			sharkLevel:  2,
			point:       Vec{X: 50, Y: 50},
			shouldDie:   true,
			description: "Lv2 shark enters Lv3 territory",
		},
		{
			name:        "Higher level in lower territory - safe",
			sharkID:     "shark3",
			sharkLevel:  4,
			point:       Vec{X: 50, Y: 50},
			shouldDie:   false,
			description: "Lv4 shark can ignore Lv3 territory",
		},
		{
			name:        "Same level - safe",
			sharkID:     "shark4",
			sharkLevel:  3,
			point:       Vec{X: 50, Y: 50},
			shouldDie:   false,
			description: "Same level sharks don't trigger territory death",
		},
		{
			name:        "Outside territory - safe",
			sharkID:     "shark5",
			sharkLevel:  1,
			point:       Vec{X: 200, Y: 200},
			shouldDie:   false,
			description: "Point outside territory is safe",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			collision := tm.CheckCollision(tt.sharkID, tt.sharkLevel, tt.point)
			died := collision != nil

			if died != tt.shouldDie {
				t.Errorf("%s: expected shouldDie=%v, got %v", tt.description, tt.shouldDie, died)
			}
		})
	}
}

func TestTerritoryManager_RemoveExpired(t *testing.T) {
	tm := NewTerritoryManager(1 * time.Second)

	polygon := []Vec{{X: 0, Y: 0}, {X: 100, Y: 0}, {X: 100, Y: 100}, {X: 0, Y: 0}}

	tm.CreateTerritory("shark1", "attack", 2, polygon)
	tm.CreateTerritory("shark2", "non-attack", 3, polygon)

	if tm.Count() != 2 {
		t.Errorf("Expected 2 territories, got %d", tm.Count())
	}

	// Wait for expiration (slightly longer than lifetime)
	time.Sleep(1200 * time.Millisecond)

	expired := tm.RemoveExpired()

	if len(expired) != 2 {
		t.Errorf("Expected 2 expired territories, got %d", len(expired))
	}

	if tm.Count() != 0 {
		t.Errorf("Expected 0 territories after expiration, got %d", tm.Count())
	}
}

func TestTerritoryManager_RemoveSharkTerritories(t *testing.T) {
	tm := NewTerritoryManager(30 * time.Second)

	polygon := []Vec{{X: 0, Y: 0}, {X: 100, Y: 0}, {X: 100, Y: 100}, {X: 0, Y: 0}}

	// Create territories for two sharks
	tm.CreateTerritory("shark1", "attack", 2, polygon)
	tm.CreateTerritory("shark1", "attack", 2, polygon)
	tm.CreateTerritory("shark2", "non-attack", 3, polygon)

	if tm.Count() != 3 {
		t.Errorf("Expected 3 territories, got %d", tm.Count())
	}

	// Remove shark1's territories
	removed := tm.RemoveSharkTerritories("shark1")

	if len(removed) != 2 {
		t.Errorf("Expected 2 removed territories, got %d", len(removed))
	}

	if tm.Count() != 1 {
		t.Errorf("Expected 1 territory remaining, got %d", tm.Count())
	}

	// Verify shark2's territory still exists
	territories := tm.GetSharkTerritories("shark2")
	if len(territories) != 1 {
		t.Errorf("Expected shark2 to have 1 territory, got %d", len(territories))
	}
}

func TestBoundingBoxOptimization(t *testing.T) {
	polygon := []Vec{
		{X: 10, Y: 20},
		{X: 50, Y: 10},
		{X: 80, Y: 40},
		{X: 60, Y: 70},
		{X: 20, Y: 60},
		{X: 10, Y: 20},
	}

	bbox := calculateBBox(polygon)

	if bbox.MinX != 10 {
		t.Errorf("Expected MinX=10, got %f", bbox.MinX)
	}
	if bbox.MinY != 10 {
		t.Errorf("Expected MinY=10, got %f", bbox.MinY)
	}
	if bbox.MaxX != 80 {
		t.Errorf("Expected MaxX=80, got %f", bbox.MaxX)
	}
	if bbox.MaxY != 70 {
		t.Errorf("Expected MaxY=70, got %f", bbox.MaxY)
	}

	// Test point in bbox
	if !pointInBBox(Vec{X: 50, Y: 50}, bbox) {
		t.Error("Point (50, 50) should be in bbox")
	}

	if pointInBBox(Vec{X: 0, Y: 0}, bbox) {
		t.Error("Point (0, 0) should not be in bbox")
	}
}
