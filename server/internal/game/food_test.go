package game

import "testing"

func TestWorldSpawnsFoodsToCount(t *testing.T) {
	w := NewWorld()
	w.SpawnFoodsTo(FoodCount)
	if len(w.Foods) != FoodCount {
		t.Fatalf("food count = %d, want %d", len(w.Foods), FoodCount)
	}
	// Every food is inside the world.
	for _, f := range w.Foods {
		if f.Pos.X < 0 || f.Pos.X > WorldWidth || f.Pos.Y < 0 || f.Pos.Y > WorldHeight {
			t.Fatalf("food outside world: %+v", f.Pos)
		}
	}
}

func TestSharkEatsFood(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 200, Y: 200})
	w.Sharks[s.ID] = s
	f := &Food{ID: "f1", Pos: Vec{X: 205, Y: 200}}
	w.Foods[f.ID] = f

	eaten := w.ConsumeFoods()
	if len(eaten) != 1 || eaten[0] != "f1" {
		t.Fatalf("eaten = %v, want [f1]", eaten)
	}
	if s.XP != 1 {
		t.Fatalf("xp = %d, want 1", s.XP)
	}
	if _, ok := w.Foods["f1"]; ok {
		t.Fatal("food f1 should be removed")
	}
}

func TestSharkFarFromFoodNotEaten(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 200, Y: 200})
	w.Sharks[s.ID] = s
	w.Foods["f1"] = &Food{ID: "f1", Pos: Vec{X: 500, Y: 500}}

	eaten := w.ConsumeFoods()
	if len(eaten) != 0 {
		t.Fatalf("eaten = %v, want []", eaten)
	}
	if s.XP != 0 {
		t.Fatalf("xp = %d, want 0", s.XP)
	}
}

func TestScatterDeadSharkIntoFood(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 2000, Y: 2000})
	s.XP = 50
	s.UpdateStage()
	s.Alive = false
	w.Sharks[s.ID] = s

	before := len(w.Foods)
	dropped := w.ScatterDeadShark(s)

	if dropped < 1 {
		t.Fatalf("dropped = %d, want >= 1", dropped)
	}
	// Capped at 20.
	if dropped > 20 {
		t.Fatalf("dropped = %d, want <= 20", dropped)
	}
	if len(w.Foods) != before+dropped {
		t.Fatalf("world food count = %d, want %d", len(w.Foods), before+dropped)
	}
}
