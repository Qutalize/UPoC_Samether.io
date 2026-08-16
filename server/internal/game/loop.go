package game

import (
	"fmt"
	"math"
	"math/rand"
)

const (
	WorldWidth     = 4000.0
	WorldHeight    = 4000.0
	TickHz         = 20
	TickDurationMs = 1000 / TickHz

	FoodCount      = 300
	FoodPickupDist = 14.0
	DiverCount         = 3
	DiverPickupDist    = 20.0
	DiverXP            = 10
	DiverSpeedBoostSec = 5.0
	DiverSpeed         = 25.0

	BaseSpeed       = 140.0
	DashMultiplier  = 2.0
	DashDurationSec = 1.0

	// CP System
	InitialCP    = 50.0 // deprecated: daily distance bonus replaces this
	MaxCPDefault = 100.0
	DashCPPerSec  = 2.0 // ダッシュ消費レート（1秒あたりCP）。調整はここだけでOK
	CPRegenPerSec = 0.5 // CP自然回復レート（1秒あたりCP、常時回復）

	SegmentSpacing    = 5.5
	CollisionHeadRad  = 8.0
	CollisionBodyRad  = 9.0
	VisibilityRadius  = 2500.0
	VisibilityStage5  = 4000.0
	MinPopulation     = 6
	BaseTurnSpeed     = 4.0 // Radians per second (approx 230 deg/s)
)

// UpdateBots makes bots steer toward their target food or find a new one.
func (w *World) UpdateBots() {
	for _, s := range w.Sharks {
		if !s.IsBot || !s.Alive {
			continue
		}

		target, ok := w.Foods[s.TargetFoodID]
		minTurnRadius := BaseSpeed / (BaseTurnSpeed / s.SizeScale())

		// If target exists but we overshot it, abandon it and set a cool-off period
		if ok {
			dx := target.Pos.X - s.Head.X
			dy := target.Pos.Y - s.Head.Y
			dist := math.Sqrt(dx*dx + dy*dy)
			targetAng := math.Atan2(dy, dx)
			diff := targetAng - s.Angle
			for diff > math.Pi {
				diff -= 2 * math.Pi
			}
			for diff < -math.Pi {
				diff += 2 * math.Pi
			}
			
			// If target is inside my turn radius and requires a sharp turn, let it go
			if dist < minTurnRadius*1.5 && math.Abs(diff) > math.Pi/4 {
				s.AbandonedFoodID = s.TargetFoodID
				s.AbandonedUntilTick = w.Tick + int64(TickHz * 1.5) // 1.5 seconds cool-off
				s.TargetFoodID = ""
				ok = false
			}
		}

		// Recovery mode: if we just abandoned a food, we don't pick a new one immediately.
		// Just wait out the cool-off unless we are near a wall.
		if w.Tick < s.AbandonedUntilTick {
			s.TargetFoodID = ""
			ok = false
		}

		// Find new target
		if !ok {
			var bestID string
			bestScore := math.MaxFloat64

			for id, f := range w.Foods {
				// Skip the recently abandoned food
				if id == s.AbandonedFoodID {
					continue
				}

				dx := f.Pos.X - s.Head.X
				dy := f.Pos.Y - s.Head.Y
				dist := math.Sqrt(dx*dx + dy*dy)
				
				targetAng := math.Atan2(dy, dx)
				diff := targetAng - s.Angle
				for diff > math.Pi {
					diff -= 2 * math.Pi
				}
				for diff < -math.Pi {
					diff += 2 * math.Pi
				}

				// Score heavily penalizes foods that are behind the shark
				score := dist
				if math.Abs(diff) > math.Pi/2 {
					score += 2000.0 // Massive penalty for being behind
				} else if dist < minTurnRadius*2.0 {
					score += math.Abs(diff) * 500.0
				}

				if score < bestScore {
					bestScore = score
					bestID = id
				}
			}
			if bestID != "" {
				s.TargetFoodID = bestID
				target = w.Foods[bestID]
			}
		}

		// Steer toward target, BUT override if approaching a wall
		if target != nil && ok {
			dx := target.Pos.X - s.Head.X
			dy := target.Pos.Y - s.Head.Y
			s.TargetAngle = math.Atan2(dy, dx)
		} else {
			s.TargetAngle = s.Angle // keep straight if no target
		}

		// Wall avoidance (High priority)
		margin := 100.0 // Distance to start turning away from wall
		wallRisk := false

		if s.Head.X < margin {
			wallRisk = true
		} else if s.Head.X > WorldWidth-margin {
			wallRisk = true
		}
		if s.Head.Y < margin {
			wallRisk = true
		} else if s.Head.Y > WorldHeight-margin {
			wallRisk = true
		}

		if wallRisk {
			// If near a wall, steer towards the center of the map
			dx := (WorldWidth / 2) - s.Head.X
			dy := (WorldHeight / 2) - s.Head.Y
			s.TargetAngle = math.Atan2(dy, dx)
			s.TargetFoodID = "" // Drop target to focus on survival
			s.AbandonedUntilTick = w.Tick + int64(TickHz)
		}
	}
}

// Stage defines the growth tiers. Index 0 = stage 1.
type StageDef struct {
	XPRequired  int
	SegmentCount int
	SizeScale   float64
}

var Stages = []StageDef{
	{XPRequired: 0,   SegmentCount: 24, SizeScale: 1.55},
	{XPRequired: 10,  SegmentCount: 24, SizeScale: 1.75},
	{XPRequired: 25,  SegmentCount: 24, SizeScale: 1.90},
	{XPRequired: 50,  SegmentCount: 24, SizeScale: 2.15},
	{XPRequired: 100, SegmentCount: 24, SizeScale: 2.45},
}

// StageFromXP returns zero-based stage index for accumulated XP.
func StageFromXP(xp int) int {
	stage := 0
	for i, s := range Stages {
		if xp >= s.XPRequired {
			stage = i
		}
	}
	return stage
}

// Vec is a 2D point.
type Vec struct {
	X, Y float64
}

// Dist returns Euclidean distance.
func (v Vec) Dist(o Vec) float64 {
	dx := v.X - o.X
	dy := v.Y - o.Y
	return math.Sqrt(dx*dx + dy*dy)
}

// World holds all game state. Only touched by Hub goroutine.
type World struct {
	Tick       int64
	Sharks     map[string]*Shark
	Foods      map[string]*Food
	nextFoodID int
}

func NewWorld() *World {
	return &World{
		Sharks: make(map[string]*Shark),
		Foods:  make(map[string]*Food),
	}
}

// AddCP adds CP to a shark's in-game balance, capped at MaxCP.
// Called by Hub when a GPS session result arrives.
func (w *World) AddCP(playerID string, amount float64) {
	s, ok := w.Sharks[playerID]
	if !ok {
		return
	}
	s.CP += amount
	if s.CP > s.MaxCP {
		s.CP = s.MaxCP
	}
}

func (w *World) nextFoodKey() string {
	w.nextFoodID++
	return fmt.Sprintf("f%d", w.nextFoodID)
}

// SpawnDiversTo adds diver foods until count divers exist.
func (w *World) SpawnDiversTo(count int) {
	margin := 200.0
	diverCount := 0
	for _, f := range w.Foods {
		if f.IsDiver {
			diverCount++
		}
	}
	for diverCount < count {
		id := w.nextFoodKey()
		w.Foods[id] = &Food{
			ID:      id,
			IsDiver: true,
			Speed:   DiverSpeed,
			Angle:   rand.Float64() * math.Pi * 2,
			Pos: Vec{
				X: margin + rand.Float64()*(WorldWidth-2*margin),
				Y: margin + rand.Float64()*(WorldHeight-2*margin),
			},
		}
		diverCount++
	}
}

// MoveDivers updates all diver positions.
func (w *World) MoveDivers(dt float64) {
	for _, f := range w.Foods {
		if f.IsDiver {
			// Random direction change
			if rand.Float64() < 0.01 {
				f.Angle += (rand.Float64() - 0.5) * 0.8
			}
			f.MoveDiver(dt)
		}
	}
}

// ConsumeDivers checks shark vs diver collisions. Returns eaten diver IDs and applies speed boost.
func (w *World) ConsumeDivers() []string {
	var eaten []string
	for fid, f := range w.Foods {
		if !f.IsDiver {
			continue
		}
		for _, s := range w.Sharks {
			if !s.Alive {
				continue
			}
			if s.Head.Dist(f.Pos) < DiverPickupDist*s.SizeScale() {
				s.XP += DiverXP
				s.SpeedBoostUntilTick = w.Tick + int64(DiverSpeedBoostSec*float64(TickHz))
				eaten = append(eaten, fid)
				delete(w.Foods, fid)
				break
			}
		}
	}
	return eaten
}

// SpawnFoodsTo adds random foods until count foods exist.
func (w *World) SpawnFoodsTo(count int) {
	margin := 50.0
	for len(w.Foods) < count {
		id := w.nextFoodKey()
		w.Foods[id] = &Food{
			ID: id,
			Pos: Vec{
				X: margin + rand.Float64()*(WorldWidth-2*margin),
				Y: margin + rand.Float64()*(WorldHeight-2*margin),
			},
		}
	}
}

// ConsumeFoods checks all sharks vs all foods. Returns eaten food IDs.
func (w *World) ConsumeFoods() []string {
	var eaten []string
	defaultTrait := &DefaultTrait{} // 使い回し用

	for fid, f := range w.Foods {
		for _, s := range w.Sharks {
			if !s.Alive {
				continue
			}

			// 特性に応じた判定
			trait := s.Trait
			if trait == nil {
				trait = defaultTrait
			}

			if trait.CanConsume(s, f) {
				s.XP++
				eaten = append(eaten, fid)
				delete(w.Foods, fid)
				break
			}
		}
	}
	return eaten
}

// ScatterDeadShark spawns up to 20 foods at positions of the shark's segments
// (1 food per segment, evenly sampled if more than 20 segments).
// Returns the number of foods dropped.
func (w *World) ScatterDeadShark(s *Shark) int {
	dropCounts := []int{5, 8, 12, 18, 20}
	drop := 5
	if s.Stage >= 0 && s.Stage < len(dropCounts) {
		drop = dropCounts[s.Stage]
	}

	n := len(s.Segments)
	margin := 50.0
	for i := 0; i < drop; i++ {
		idx := i * n / drop
		id := w.nextFoodKey()
		pos := s.Segments[idx]
		
		if pos.X < margin { pos.X = margin }
		if pos.X > WorldWidth-margin {
			pos.X = WorldWidth - margin
		}
		if pos.Y < margin {
			pos.Y = margin
		}
		if pos.Y > WorldHeight-margin {
			pos.Y = WorldHeight - margin
		}

		w.Foods[id] = &Food{ID: id, Pos: pos, IsRed: true}
	}
	return drop
}

// AssignTraitToShark はサメの Stage と Route に応じて特性を割り当て
func AssignTraitToShark(s *Shark) {
	// Stage 4 Non-Attack = ジンベエザメ
	if s.Stage == 4 && s.Route == RouteNonAttack {
		if s.Trait == nil || s.Trait.ID() != "suction" {
			s.Trait = &SuctionTrait{}
		}
		return
	}

	// 他の特性も将来ここで割り当て
	// 例: Stage 4 Deep-Sea = Greenland Shark → StealthTrait

	// 該当なしの場合は nil（DefaultTrait相当）
	s.Trait = nil
}
