package game

import "math"

const (
	TrailRecordDistance = 18.0
	TrailMaxPoints      = 120
	MaxTerritories      = 4
	MinTerritoryArea    = 16.0
)

func (s *Shark) recordTrailPoint(oldHead, newHead Vec) {
	if len(s.Trail) == 0 {
		s.Trail = append(s.Trail, newHead)
		return
	}

	last := s.Trail[len(s.Trail)-1]
	if last.Dist(newHead) < TrailRecordDistance {
		return
	}

	// Check for self-intersection between the new segment and existing trail.
	for i := 0; i < len(s.Trail)-2; i++ {
		if hit, inter := segmentIntersection(last, newHead, s.Trail[i], s.Trail[i+1]); hit {
			polygon := make([]Vec, 0, len(s.Trail)-i+3)
			polygon = append(polygon, inter)
			polygon = append(polygon, s.Trail[i+1:]...)
			polygon = append(polygon, newHead)
			polygon = append(polygon, inter)

			if math.Abs(polygonArea(polygon)) >= MinTerritoryArea {
				if len(s.Territories) >= MaxTerritories {
					s.Territories = s.Territories[1:]
				}
				s.Territories = append(s.Territories, polygon)
			}
			break
		}
	}

	s.Trail = append(s.Trail, newHead)
	if len(s.Trail) > TrailMaxPoints {
		s.Trail = s.Trail[len(s.Trail)-TrailMaxPoints:]
	}
}

func segmentIntersection(a, b, c, d Vec) (bool, Vec) {
	dx1 := b.X - a.X
	dy1 := b.Y - a.Y
	dx2 := d.X - c.X
	dy2 := d.Y - c.Y
	den := dx1*dy2 - dy1*dx2
	if math.Abs(den) < 1e-9 {
		return false, Vec{}
	}

	t := ((c.X-a.X)*dy2 - (c.Y-a.Y)*dx2) / den
	u := ((c.X-a.X)*dy1 - (c.Y-a.Y)*dx1) / den
	if t < 0 || t > 1 || u < 0 || u > 1 {
		return false, Vec{}
	}

	return true, Vec{
		X: a.X + dx1*t,
		Y: a.Y + dy1*t,
	}
}

func polygonArea(points []Vec) float64 {
	area := 0.0
	for i := 0; i < len(points)-1; i++ {
		area += points[i].X*points[i+1].Y - points[i+1].X*points[i].Y
	}
	return area * 0.5
}

func pointInPolygon(pt Vec, polygon []Vec) bool {
	inside := false
	for i, j := 0, len(polygon)-1; i < len(polygon); j, i = i, i+1 {
		a := polygon[i]
		b := polygon[j]
		if ((a.Y > pt.Y) != (b.Y > pt.Y)) &&
			(pt.X < (b.X-a.X)*(pt.Y-a.Y)/(b.Y-a.Y)+a.X) {
			inside = !inside
		}
	}
	return inside
}

func (s *Shark) HasTerritoryAt(pt Vec) bool {
	for _, poly := range s.Territories {
		if pointInPolygon(pt, poly) {
			return true
		}
	}
	return false
}

func (w *World) CheckTerritoryViolations() []string {
	var dead []string
	for id, self := range w.Sharks {
		if !self.Alive {
			continue
		}
		for otherID, other := range w.Sharks {
			if otherID == id || !other.Alive {
				continue
			}
			// Safe if same route (same species)
			if other.Route == self.Route {
				continue
			}
			// Safe if equal or lower level
			if other.Stage <= self.Stage {
				continue
			}
			if other.HasTerritoryAt(self.Head) {
				self.Alive = false
				dead = append(dead, id)
				goto nextSelf
			}
		}
	nextSelf:
	}
	return dead
}
