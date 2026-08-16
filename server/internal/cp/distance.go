package cp

import "math"

const earthRadiusM = 6_371_000 // 地球の平均半径 (m)

// Position はTrackerから取得した1つの測位点を表す。
type Position struct {
	Lat float64 // 緯度 (degrees)
	Lon float64 // 経度 (degrees)
}

// haversine は2点間の大圏距離をメートルで返す。
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	dLat := degToRad(lat2 - lat1)
	dLon := degToRad(lon2 - lon1)
	rLat1 := degToRad(lat1)
	rLat2 := degToRad(lat2)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rLat1)*math.Cos(rLat2)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusM * c
}

func degToRad(d float64) float64 {
	return d * math.Pi / 180
}

const (
	// stationaryThresholdM: 連続3点間の移動距離がこの値未満の場合、静止とみなし距離0にする。
	// GPSドリフトによる偽の移動距離蓄積を抑制する。
	stationaryThresholdM = 2.0

	// maxSegmentM: 5秒間隔で50km/hに相当する移動距離上限。超過する区間は棄却する。
	maxSegmentM = 69.0
)

// CalcTotalDistance は位置履歴の隣接点間のHaversine距離を累積して総移動距離(m)を返す。
// 静止フィルタ: 連続3点の各区間がいずれも stationaryThresholdM 未満なら静止とみなし
// その区間の距離は加算しない。
// 速度フィルタ: 隣接2点間が maxSegmentM を超える場合その区間を棄却する。
func CalcTotalDistance(positions []Position) float64 {
	n := len(positions)
	if n < 2 {
		return 0
	}

	// 隣接点間距離を事前計算
	segments := make([]float64, n-1)
	for i := 0; i < n-1; i++ {
		segments[i] = haversine(
			positions[i].Lat, positions[i].Lon,
			positions[i+1].Lat, positions[i+1].Lon,
		)
	}

	total := 0.0
	for i, d := range segments {
		// 速度フィルタ: 50km/h超の区間を棄却
		if d > maxSegmentM {
			continue
		}

		// 静止フィルタ: 連続3点 (i-1, i, i+1) の2区間がいずれも閾値未満なら静止とみなす
		if i > 0 && segments[i-1] < stationaryThresholdM && d < stationaryThresholdM {
			continue
		}

		total += d
	}
	return total
}
