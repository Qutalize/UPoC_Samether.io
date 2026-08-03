package cp

import (
	"math"
	"testing"
)

func TestHaversine(t *testing.T) {
	// 東京駅 → 新宿駅: 約6,400m
	d := haversine(35.6812, 139.7671, 35.6896, 139.6999)
	if d < 6000 || d > 7000 {
		t.Errorf("Tokyo-Shinjuku distance: got %.1fm, want ~6400m", d)
	}
}

func TestCalcTotalDistance_StraightWalk(t *testing.T) {
	// 直線歩行: 各ステップ10mずつ北に移動 (緯度の1度 ≈ 111km)
	const stepLat = 10.0 / 111_000.0
	positions := make([]Position, 10)
	for i := range positions {
		positions[i] = Position{Lat: 35.0 + float64(i)*stepLat, Lon: 139.0}
	}
	d := CalcTotalDistance(positions)
	// 9区間 × 10m = 90m (Haversineの丸め誤差を考慮)
	if math.Abs(d-90) > 1.0 {
		t.Errorf("straight walk: got %.1fm, want ~90m", d)
	}
}

func TestCalcTotalDistance_StationaryFilter(t *testing.T) {
	// 静止状態: GPSドリフトで0.5mずつブレるが実際には動いていない
	base := Position{Lat: 35.0, Lon: 139.0}
	drift := 0.5 / 111_000.0 // ~0.5m in lat
	positions := []Position{
		base,
		{Lat: base.Lat + drift, Lon: base.Lon},
		{Lat: base.Lat - drift, Lon: base.Lon},
		{Lat: base.Lat + drift, Lon: base.Lon},
		{Lat: base.Lat - drift, Lon: base.Lon},
		{Lat: base.Lat + drift, Lon: base.Lon},
	}

	d := CalcTotalDistance(positions)
	// 静止フィルタにより、最初の1区間分(~0.5m)のみ加算され残りはフィルタされる
	if d > 2.0 {
		t.Errorf("stationary drift: got %.1fm, want <2m", d)
	}
}

func TestCalcTotalDistance_SpeedFilter(t *testing.T) {
	// 1区間だけ異常な跳び(100m)を含む歩行
	const stepLat = 10.0 / 111_000.0
	const jumpLat = 100.0 / 111_000.0
	positions := []Position{
		{Lat: 35.0, Lon: 139.0},
		{Lat: 35.0 + stepLat, Lon: 139.0},     // +10m
		{Lat: 35.0 + stepLat*2, Lon: 139.0},    // +10m
		{Lat: 35.0 + stepLat*2 + jumpLat, Lon: 139.0}, // +100m (棄却される)
		{Lat: 35.0 + stepLat*3 + jumpLat, Lon: 139.0}, // +10m
	}

	d := CalcTotalDistance(positions)
	// 100mの区間は棄却 → 残りは10m × 3区間 = 30m前後
	if d > 40 {
		t.Errorf("speed filter: got %.1fm, want ~30m (100m jump should be filtered)", d)
	}
}

func TestCalcTotalDistance_MixedWalkAndStationary(t *testing.T) {
	// 歩行 → 静止 → 歩行 の複合パターン
	const stepLat = 10.0 / 111_000.0
	const driftLat = 0.5 / 111_000.0

	positions := []Position{
		// 歩行区間: 3ステップ (30m)
		{Lat: 35.0, Lon: 139.0},
		{Lat: 35.0 + stepLat, Lon: 139.0},
		{Lat: 35.0 + stepLat*2, Lon: 139.0},
		{Lat: 35.0 + stepLat*3, Lon: 139.0},
		// 静止区間: ドリフト (距離加算なし)
		{Lat: 35.0 + stepLat*3 + driftLat, Lon: 139.0},
		{Lat: 35.0 + stepLat*3 - driftLat, Lon: 139.0},
		{Lat: 35.0 + stepLat*3, Lon: 139.0},
		// 歩行再開: 3ステップ (30m)
		{Lat: 35.0 + stepLat*4, Lon: 139.0},
		{Lat: 35.0 + stepLat*5, Lon: 139.0},
		{Lat: 35.0 + stepLat*6, Lon: 139.0},
	}

	d := CalcTotalDistance(positions)
	// 期待: 歩行30m + 静止~0m + 歩行30m ≈ 60m
	if d < 50 || d > 70 {
		t.Errorf("mixed walk+stationary: got %.1fm, want ~60m", d)
	}
}

func TestCalcTotalDistance_Empty(t *testing.T) {
	if d := CalcTotalDistance(nil); d != 0 {
		t.Errorf("nil: got %.1f, want 0", d)
	}
	if d := CalcTotalDistance([]Position{{Lat: 35, Lon: 139}}); d != 0 {
		t.Errorf("single point: got %.1f, want 0", d)
	}
}
