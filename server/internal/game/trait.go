package game

// Trait はサメの特性インターフェース
// 餌取得範囲などをカスタマイズできる
type Trait interface {
	// ID は特性の識別子
	ID() string

	// CanConsume は指定された餌を取得できるか判定
	// 通常の円形範囲とは異なる判定ロジックを実装可能
	CanConsume(shark *Shark, food *Food) bool
}

// DefaultTrait は特性なし（通常の円形範囲判定）
type DefaultTrait struct{}

func (t *DefaultTrait) ID() string {
	return "default"
}

func (t *DefaultTrait) CanConsume(shark *Shark, food *Food) bool {
	return shark.Head.Dist(food.Pos) <= FoodPickupDist*shark.SizeScale()
}
