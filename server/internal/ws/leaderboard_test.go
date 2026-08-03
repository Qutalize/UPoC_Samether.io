package ws

import "testing"

func TestInMemoryLeaderboard(t *testing.T) {
	lb := NewInMemoryLeaderboard()
	if name, score, ok := lb.Top(); ok {
		t.Fatalf("expected empty leaderboard, got %s %d", name, score)
	}

	if !lb.MaybeUpdate("alice", 10) {
		t.Fatal("expected first update to return changed")
	}
	if name, score, ok := lb.Top(); !ok || name != "alice" || score != 10 {
		t.Fatalf("expected alice 10, got %s %d %v", name, score, ok)
	}

	if lb.MaybeUpdate("bob", 5) {
		t.Fatal("lower score should not change top")
	}
	if name, score, _ := lb.Top(); name != "alice" || score != 10 {
		t.Fatalf("expected alice 10 after lower score, got %s %d", name, score)
	}

	if !lb.MaybeUpdate("bob", 20) {
		t.Fatal("higher score should change top")
	}
	if name, score, _ := lb.Top(); name != "bob" || score != 20 {
		t.Fatalf("expected bob 20 after update, got %s %d", name, score)
	}
}
