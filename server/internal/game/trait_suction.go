package game

import "math"

// SuctionTrait はジンベエザメの「餌吸い込み」特性
// 前方扇形の広範囲で餌を取得できる
type SuctionTrait struct{}

func (t *SuctionTrait) ID() string {
	return "suction"
}

const (
	SuctionRange    = 40.0          // 通常の約3倍（14.0 * 2.05 ≈ 28.7 → 40.0）
	SuctionArcAngle = math.Pi * 2/3 // 前方120度
)

func (t *SuctionTrait) CanConsume(shark *Shark, food *Food) bool {
	dx := food.Pos.X - shark.Head.X
	dy := food.Pos.Y - shark.Head.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	// 範囲外
	if dist > SuctionRange*shark.SizeScale() {
		return false
	}

	// 餌への角度
	angleToFood := math.Atan2(dy, dx)

	// サメの向きとの角度差
	angleDiff := angleToFood - shark.Angle
	// 正規化 [-π, π]
	for angleDiff > math.Pi {
		angleDiff -= 2 * math.Pi
	}
	for angleDiff < -math.Pi {
		angleDiff += 2 * math.Pi
	}

	// 扇形範囲内か（前方120度 = ±60度）
	return math.Abs(angleDiff) <= SuctionArcAngle/2
}
