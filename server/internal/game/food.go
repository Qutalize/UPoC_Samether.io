package game

import "math"

type Food struct {
	ID      string
	Pos     Vec
	IsRed   bool
	IsDiver bool
	// Diver movement
	Angle float64
	Speed float64
}

// MoveDiver updates a diver food's position.
func (f *Food) MoveDiver(dt float64) {
	if !f.IsDiver {
		return
	}
	f.Pos.X += math.Cos(f.Angle) * f.Speed * dt
	f.Pos.Y += math.Sin(f.Angle) * f.Speed * dt

	// Bounce off walls
	margin := 150.0
	if f.Pos.X < margin {
		f.Pos.X = margin
		f.Angle = math.Pi - f.Angle
	} else if f.Pos.X > WorldWidth-margin {
		f.Pos.X = WorldWidth - margin
		f.Angle = math.Pi - f.Angle
	}
	if f.Pos.Y < margin {
		f.Pos.Y = margin
		f.Angle = -f.Angle
	} else if f.Pos.Y > WorldHeight-margin {
		f.Pos.Y = WorldHeight - margin
		f.Angle = -f.Angle
	}
}
