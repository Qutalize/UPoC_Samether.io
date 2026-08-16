package game

import (
	"math"
	"testing"
)

func TestSharkMoveStraight(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Angle = 0 // +X direction

	dt := 1.0 / float64(TickHz) // one tick
	s.Move(dt, false)

	expected := 100 + RouteNormalSpeed(s.Route)*dt
	if math.Abs(s.Head.X-expected) > 0.001 {
		t.Fatalf("head X = %v, want %v", s.Head.X, expected)
	}
	if math.Abs(s.Head.Y-100) > 0.001 {
		t.Fatalf("head Y = %v, want 100", s.Head.Y)
	}
}

func TestSharkSegmentsFollow(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 500, Y: 500})
	s.Angle = 0

	for i := 0; i < 20; i++ {
		s.Move(1.0/float64(TickHz), false)
	}

	// All segments should be lined up behind the head on the X axis.
	for i := 1; i < len(s.Segments); i++ {
		if s.Segments[i].X >= s.Segments[i-1].X {
			t.Fatalf("segment %d not behind segment %d: %v vs %v",
				i, i-1, s.Segments[i], s.Segments[i-1])
		}
		d := s.Segments[i].Dist(s.Segments[i-1])
		want := SegmentSpacing
		if math.Abs(d-want) > 0.5 {
			t.Fatalf("segment %d distance = %v, want %v", i, d, want)
		}
	}
}

func TestSharkDash(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 0, Y: 0})
	s.Angle = 0

	dt := 1.0 / float64(TickHz)
	s.Move(dt, true)

	expected := RouteDashSpeed(s.Route) * dt
	if math.Abs(s.Head.X-expected) > 0.001 {
		t.Fatalf("dashed head X = %v, want %v", s.Head.X, expected)
	}
}

func TestSharkGrowsAtXPThreshold(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 500, Y: 500})
	if s.Stage != 0 {
		t.Fatalf("initial stage = %d, want 0", s.Stage)
	}
	if len(s.Segments) != Stages[0].SegmentCount {
		t.Fatalf("initial segments = %d, want %d", len(s.Segments), Stages[0].SegmentCount)
	}

	s.XP = 10
	s.UpdateStage()
	if s.Stage != 1 {
		t.Fatalf("stage after XP=10 = %d, want 1", s.Stage)
	}
	if len(s.Segments) != Stages[1].SegmentCount {
		t.Fatalf("segments after stage 1 = %d, want %d", len(s.Segments), Stages[1].SegmentCount)
	}

	s.XP = 100
	s.UpdateStage()
	if s.Stage != 4 {
		t.Fatalf("stage after XP=100 = %d, want 4", s.Stage)
	}
	if len(s.Segments) != Stages[4].SegmentCount {
		t.Fatalf("segments after stage 4 = %d, want %d", len(s.Segments), Stages[4].SegmentCount)
	}
}

func TestSharkGrowthKeepsExistingSegments(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 500, Y: 500})
	oldHead := s.Head
	s.XP = 10
	s.UpdateStage()

	// Head unchanged
	if s.Head != oldHead {
		t.Fatalf("head moved: %v vs %v", s.Head, oldHead)
	}
	// Segments 0..4 approximately preserved (they existed before growth)
	if s.Segments[0] != oldHead {
		t.Fatalf("segment 0 != head")
	}
}

func TestSharkTrailRecordsOnlyWhenActive(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 0, Y: 0})
	s.Angle = 0
	s.TrailActive = false

	for i := 0; i < 50; i++ {
		s.Move(1.0/float64(TickHz), false)
	}
	if len(s.Trail) != 1 {
		t.Fatalf("expected trail to stay length 1 when inactive, got %d", len(s.Trail))
	}

	s.TrailActive = true
	for i := 0; i < 50; i++ {
		s.Move(1.0/float64(TickHz), false)
	}
	if len(s.Trail) <= 1 {
		t.Fatalf("expected trail to record while active, got %d", len(s.Trail))
	}
}
