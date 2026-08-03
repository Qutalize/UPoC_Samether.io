package game

// CheckWallDeaths kills any shark whose head is outside the world rect.
// Returns IDs of newly dead sharks.
func (w *World) CheckWallDeaths() []string {
	var dead []string
	for id, s := range w.Sharks {
		if !s.Alive {
			continue
		}
		h := s.Head
		if h.X < 0 || h.X > WorldWidth || h.Y < 0 || h.Y > WorldHeight {
			s.Alive = false
			dead = append(dead, id)
		}
	}
	return dead
}

// CheckSharkCollisions kills any shark whose head (index 0 excluded from self)
// is within CollisionBodyRad of another shark's non-head segment.
// Humans (RouteHuman) die on collision with any shark segment, including heads.
// Returns IDs of newly dead sharks.
func (w *World) CheckSharkCollisions() []string {
	var dead []string
	for id, self := range w.Sharks {
		if !self.Alive {
			continue
		}
		headPos := self.Head
		for otherID, other := range w.Sharks {
			if otherID == id || !other.Alive {
				continue
			}
			// Humans die on collision with any shark part, including head
			startIndex := 1
			if self.Route == RouteHuman {
				startIndex = 0 // Check all segments including head
			}
				for i := startIndex; i < len(other.Segments); i++ {
					if headPos.Dist(other.Segments[i]) <= CollisionBodyRad*other.SizeScale() {
						// If the colliding entity is a human, they die. Additionally,
						// award the shark that collided with the human as if it ate a diver:
						// give XP and temporary speed boost.
						if self.Route == RouteHuman {
							other.XP += DiverXP
							other.SpeedBoostUntilTick = w.Tick + int64(DiverSpeedBoostSec*TickHz)
						}
						self.Alive = false
						dead = append(dead, id)
						goto nextSelf
					}
				}
		}
	nextSelf:
	}
	return dead
}
