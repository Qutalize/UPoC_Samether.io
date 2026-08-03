package game

import "testing"

func TestWallCollisionKillsShark(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: -10, Y: 2000}) // outside world
	w.Sharks[s.ID] = s

	dead := w.CheckWallDeaths()
	if len(dead) != 1 || dead[0] != "p1" {
		t.Fatalf("dead = %v, want [p1]", dead)
	}
	if s.Alive {
		t.Fatal("p1 should be dead")
	}
}

func TestWallCollisionInside(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 500, Y: 500})
	w.Sharks[s.ID] = s
	dead := w.CheckWallDeaths()
	if len(dead) != 0 {
		t.Fatalf("dead = %v, want []", dead)
	}
}

func TestHeadHitsDistantBody(t *testing.T) {
	w := NewWorld()
	a := NewShark("a", "a", Vec{X: 1000, Y: 1000})
	a.Angle = 0
	// Stretch a's body along -X so segment[4] is at ~ (1000-4*12, 1000)
	for i := 1; i < len(a.Segments); i++ {
		a.Segments[i] = Vec{X: 1000 - float64(i)*SegmentSpacing, Y: 1000}
	}

	// b's head touches a's segment[3] which is at (964, 1000).
	b := NewShark("b", "b", Vec{X: 964, Y: 1000})
	b.Angle = 0

	w.Sharks[a.ID] = a
	w.Sharks[b.ID] = b

	dead := w.CheckSharkCollisions()
	if len(dead) != 1 || dead[0] != "b" {
		t.Fatalf("dead = %v, want [b]", dead)
	}
	if a.Alive == false {
		t.Fatal("a should still be alive")
	}
	if b.Alive {
		t.Fatal("b should be dead")
	}
}

func TestNoCollisionWithSelf(t *testing.T) {
	w := NewWorld()
	a := NewShark("a", "a", Vec{X: 1000, Y: 1000})
	w.Sharks[a.ID] = a
	dead := w.CheckSharkCollisions()
	if len(dead) != 0 {
		t.Fatalf("dead = %v, want []", dead)
	}
}
