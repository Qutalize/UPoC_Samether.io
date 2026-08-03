package game

import "testing"

func TestTrailSelfIntersectionCreatesTerritory(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Trail = []Vec{
		{X: 100, Y: 100},
		{X: 180, Y: 100},
		{X: 180, Y: 180},
		{X: 100, Y: 180},
		{X: 100, Y: 120},
	}
	s.recordTrailPoint(Vec{X: 100, Y: 120}, Vec{X: 140, Y: 100})

	if len(s.Territories) == 0 {
		t.Fatal("expected territory to be created on self-intersection")
	}
}

func TestTerritoryKillsWeakerShark(t *testing.T) {
	w := NewWorld()
	strong := NewShark("p1", "strong", Vec{X: 100, Y: 100})
	strong.Stage = 2
	strong.Route = RouteAttack
	strong.Territories = [][]Vec{{
		{X: 90, Y: 90},
		{X: 110, Y: 90},
		{X: 110, Y: 110},
		{X: 90, Y: 110},
		{X: 90, Y: 90},
	}}
	weak := NewShark("p2", "weak", Vec{X: 105, Y: 105})
	weak.Stage = 1
	weak.Route = RouteNonAttack // Different route to make territory dangerous
	w.Sharks = map[string]*Shark{"p1": strong, "p2": weak}

	dead := w.CheckTerritoryViolations()
	if len(dead) != 1 || dead[0] != "p2" {
		t.Fatalf("expected weak shark to die in strong territory, got %v", dead)
	}
}

func TestSameRouteTerritorySafe(t *testing.T) {
	w := NewWorld()
	strong := NewShark("p1", "strong", Vec{X: 100, Y: 100})
	strong.Stage = 2
	strong.Route = RouteAttack
	strong.Territories = [][]Vec{{
		{X: 90, Y: 90},
		{X: 110, Y: 90},
		{X: 110, Y: 110},
		{X: 90, Y: 110},
		{X: 90, Y: 90},
	}}
	weak := NewShark("p2", "weak", Vec{X: 105, Y: 105})
	weak.Stage = 1
	weak.Route = RouteAttack // Same route - should be safe
	w.Sharks = map[string]*Shark{"p1": strong, "p2": weak}

	dead := w.CheckTerritoryViolations()
	if len(dead) != 0 {
		t.Fatalf("expected weak shark to survive in same-route territory, got dead: %v", dead)
	}
}
