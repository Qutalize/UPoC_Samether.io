package game

type Leaderboard struct {
	lastTopID    string
	lastTopName  string
	lastTopScore int
	lastHasData  bool

	curTopID    string
	curTopName  string
	curTopScore int
	curHasData  bool
}

func NewLeaderboard() *Leaderboard {
	return &Leaderboard{}
}

func (l *Leaderboard) BeginTick() {
	l.curHasData = false
	l.curTopScore = -1
}

func (l *Leaderboard) Record(id string, name string, score int) {
	if !l.curHasData || score > l.curTopScore {
		l.curTopID = id
		l.curTopName = name
		l.curTopScore = score
		l.curHasData = true
	}
}

func (l *Leaderboard) EndTick() bool {
	changed := l.curHasData != l.lastHasData ||
		l.curTopID != l.lastTopID ||
		l.curTopName != l.lastTopName ||
		l.curTopScore != l.lastTopScore

	l.lastHasData = l.curHasData
	l.lastTopID = l.curTopID
	l.lastTopName = l.curTopName
	l.lastTopScore = l.curTopScore

	return changed
}

func (l *Leaderboard) Top() (name string, score int, ok bool) {
	return l.lastTopName, l.lastTopScore, l.lastHasData
}

// Update keeps older tests and callers working in single-step mode.
func (l *Leaderboard) Update(name string, score int) bool {
	if !l.lastHasData || score > l.lastTopScore || name == l.lastTopName {
		changed := !l.lastHasData || l.lastTopName != name || l.lastTopScore != score
		l.lastTopID = name
		l.lastTopName = name
		l.lastTopScore = score
		l.lastHasData = true
		return changed
	}
	return false
}
