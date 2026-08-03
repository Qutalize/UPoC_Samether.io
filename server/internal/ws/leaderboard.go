package ws

type LeaderboardStore interface {
	Top() (name string, score int, ok bool)
	MaybeUpdate(name string, score int) bool
}

type inMemoryLeaderboard struct {
	topName  string
	topScore int
	has      bool
}

func NewInMemoryLeaderboard() LeaderboardStore {
	return &inMemoryLeaderboard{}
}

func (l *inMemoryLeaderboard) Top() (string, int, bool) {
	return l.topName, l.topScore, l.has
}

func (l *inMemoryLeaderboard) MaybeUpdate(name string, score int) bool {
	if name == "" {
		return false
	}
	if !l.has || score > l.topScore || name == l.topName {
		changed := !l.has || l.topName != name || l.topScore != score
		l.topName = name
		l.topScore = score
		l.has = true
		return changed
	}
	return false
}
