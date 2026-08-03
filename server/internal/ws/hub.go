package ws

import (
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"github.com/samezario/server/internal/cp"
	"github.com/samezario/server/internal/game"
	"github.com/samezario/server/internal/session"
)

type inboundMsg struct {
	client *Client
	raw    []byte
	typ    string
}

type Hub struct {
	roomID       string
	roomCapacity int
	instanceID   string

	world            *game.World
	leaderboard      *game.Leaderboard
	leaderboardStore LeaderboardStore
	clients          map[*Client]bool

	register   chan *Client
	unregister chan *Client
	inbound    chan inboundMsg

	cpHandler *cp.Handler

	nextPlayerID uint64
	nextBotID    uint64
}

type Config struct {
	RoomID        string
	RoomCapacity  int
	InstanceID    string
	RedisAddr     string
	RedisPassword string
	RedisDB       int
	RedisPrefix   string
	// AWS Location Service
	LocationTrackerName string
	LocationMapAPIKey   string
	AWSRegion           string
}

func NewHub(cfg Config) *Hub {
	w := game.NewWorld()
	w.SpawnFoodsTo(game.FoodCount)

	if cfg.RoomID == "" {
		cfg.RoomID = "room-1"
	}
	if cfg.RoomCapacity <= 0 {
		cfg.RoomCapacity = 50
	}
	if cfg.InstanceID == "" {
		cfg.InstanceID = cfg.RoomID
	}

	store := NewInMemoryLeaderboard()
	if cfg.RedisAddr != "" {
		redisStore, err := session.NewRedisLeaderboard(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB, cfg.RedisPrefix)
		if err != nil {
			log.Printf("failed to initialize redis leaderboard: %v", err)
		} else {
			store = redisStore
		}
	}

	// CP Handler initialization
	tracker, err := cp.NewTrackerClient(cfg.LocationTrackerName, cfg.AWSRegion)
	if err != nil {
		log.Printf("failed to init tracker client: %v (CP will use local mode)", err)
	}
	var cpStore cp.CPStore = cp.NewInMemoryCPStore()
	if cfg.RedisAddr != "" {
		redisCPStore, err := session.NewRedisCPStore(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
		if err != nil {
			log.Printf("failed to init redis CP store: %v (using in-memory)", err)
		} else {
			cpStore = redisCPStore
		}
	}
	cpHandler := cp.NewHandler(tracker, cpStore)

	return &Hub{
		roomID:           cfg.RoomID,
		roomCapacity:     cfg.RoomCapacity,
		instanceID:       cfg.InstanceID,
		world:            w,
		leaderboard:      game.NewLeaderboard(),
		leaderboardStore: store,
		clients:          make(map[*Client]bool),
		register:         make(chan *Client),
		unregister:       make(chan *Client, 16),
		inbound:          make(chan inboundMsg, 256),
		cpHandler:        cpHandler,
	}
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}

	client := &Client{
		hub:        h,
		conn:       conn,
		send:       make(chan []byte, 64),
		lastSharks: make(map[string]StateSharkView),
		lastFoods:  make(map[string]StateFoodView),
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (h *Hub) RoomSnapshot() RoomInfoPayload {
	return RoomInfoPayload{
		ID:         h.roomID,
		Capacity:   h.roomCapacity,
		Players:    h.playerCount(),
		InstanceID: h.instanceID,
	}
}

func (h *Hub) playerCount() int {
	count := 0
	for _, shark := range h.world.Sharks {
		if shark != nil && shark.Alive && !shark.IsBot {
			count++
		}
	}
	return count
}

func (h *Hub) allocPlayerID() string {
	n := atomic.AddUint64(&h.nextPlayerID, 1)
	return fmtPlayerID(n)
}

func (h *Hub) allocBotID() string {
	n := atomic.AddUint64(&h.nextBotID, 1)
	return "b" + itoa(n)
}

func fmtPlayerID(n uint64) string {
	return "p" + itoa(n)
}

func itoa(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func randomSpawn() game.Vec {
	const margin = 150.0
	return game.Vec{
		X: margin + rand.Float64()*(game.WorldWidth-2*margin),
		Y: margin + rand.Float64()*(game.WorldHeight-2*margin),
	}
}

func randomBotRoute() string {
	routes := []string{game.RouteAttack, game.RouteNonAttack, game.RouteDeepSea}
	return routes[rand.Intn(len(routes))]
}

// 新送信関数（Payload対応）
func (h *Hub) send(c *Client, typ string, payload any) {
	b := MustMarshal(typ, payload)

	select {
	case c.send <- b:
	default:
		log.Printf("dropping message to slow client")
	}
}

func (h *Hub) Run() {
	tick := time.NewTicker(time.Second / time.Duration(game.TickHz))
	defer tick.Stop()

	cpCleanup := time.NewTicker(1 * time.Minute)
	defer cpCleanup.Stop()

	dt := 1.0 / float64(game.TickHz)

	for {
		select {
		case c := <-h.register:
			h.clients[c] = true

		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				// Clean up CP session on disconnect
				if c.playerID != "" && h.cpHandler != nil {
					if result := h.cpHandler.RemovePlayer(c.playerID); result != nil {
						h.sendToPlayer(result.PlayerID, result.MsgType, result.Payload)
					}
				}
				if c.playerID != "" && !c.cpOnly {
					delete(h.world.Sharks, c.playerID)
				}
				delete(h.clients, c)
				close(c.send)
			}

		case m := <-h.inbound:
			h.handleInbound(m)

		case result := <-h.cpHandler.ResultChan():
			h.sendToPlayer(result.PlayerID, result.MsgType, result.Payload)
			if result.MsgType == "cp_result" {
				if earned, ok := result.Payload.(cp.CPResultPayload); ok {
					h.world.AddCP(result.PlayerID, float64(earned.Earned))
				}
			}

		case <-cpCleanup.C:
			if h.cpHandler != nil {
				for _, result := range h.cpHandler.CleanupExpired() {
					h.sendToPlayer(result.PlayerID, result.MsgType, result.Payload)
				}
			}

		case <-tick.C:
			h.step(dt)
		}
	}
}

func (h *Hub) handleInbound(m inboundMsg) {
	typ, payload, err := DecodeMessage(m.raw)
	if err != nil {
		return
	}

	switch typ {

	case "join":
		p := payload.(JoinPayload)
		isCPOnly := strings.HasPrefix(p.Name, "__cp__")

		// playerIDが既にある場合の再join処理
		if m.client.playerID != "" {
			if isCPOnly && !m.client.cpOnly {
				// ゲームクライアントがCPモードに切り替え: サメを削除してCPモードへ
				delete(h.world.Sharks, m.client.playerID)
				m.client.cpOnly = true
			}
			// CP専用 or 切り替え後: welcomeを返して再利用
			if m.client.cpOnly {
				h.send(m.client, "welcome", WelcomePayload{
					PlayerID: m.client.playerID,
					WorldW:   game.WorldWidth,
					WorldH:   game.WorldHeight,
					Room:     h.RoomSnapshot(),
				})
				return
			}
			return
		}

		if !isCPOnly && h.playerCount() >= h.roomCapacity {
			h.send(m.client, "room_full", RoomFullPayload{
				Room:   h.RoomSnapshot(),
				Reason: "room capacity reached",
			})
			return
		}

		id := h.allocPlayerID()
		m.client.playerID = id
		m.client.cpOnly = isCPOnly

		if !isCPOnly {
			s := game.NewShark(id, p.Name, randomSpawn())
			s.Route = game.NormalizeRoute(p.Route)

			dailyDist := p.DailyDistance
			if dailyDist < 0 {
				dailyDist = 0
			}
			var bonusMaxCP float64
			var bonusXP int
			switch {
			case dailyDist >= 4000:
				bonusMaxCP = 100
				bonusXP = 10 // Stage 1 開始 (XP >= 10)
			case dailyDist >= 3000:
				bonusMaxCP = 100
			case dailyDist >= 2000:
				bonusMaxCP = 80
			case dailyDist >= 1000:
				bonusMaxCP = 50
			case dailyDist >= 501:
				bonusMaxCP = 30
			case dailyDist >= 201:
				bonusMaxCP = 20
			default:
				bonusMaxCP = 10
			}
			s.MaxCP = bonusMaxCP
			s.CP = bonusMaxCP / 2
			s.XP = bonusXP
			s.UpdateStage()

			h.world.Sharks[id] = s
		}

		h.send(m.client, "welcome", WelcomePayload{
			PlayerID: id,
			WorldW:   game.WorldWidth,
			WorldH:   game.WorldHeight,
			Room:     h.RoomSnapshot(),
		})

		if !isCPOnly {
			name, score, ok := h.leaderboardStore.Top()
			if ok {
				h.send(m.client, "leaderboard", LeaderboardPayload{
					TopName:  name,
					TopScore: score,
				})
			}
		}

	case "input":
		p := payload.(InputPayload)

		s, ok := h.world.Sharks[m.client.playerID]
		if !ok || !s.Alive {
			return
		}

		// If move is true, update Moving and TargetAngle. If move is false (joystick released)
		// we intentionally DO NOT set Moving = false so the shark keeps moving in the last
		// known direction. This preserves the behavior where releasing the joystick keeps
		// the shark moving forward in the previous heading.
		if p.Move {
			s.Moving = true
			s.TargetAngle = p.Angle
		}
		s.WantDash = p.Dash

		if s.TrailActive && !p.Draw {
			s.Trail = nil
		}
		s.TrailActive = p.Draw

	case "cp_start":
		if h.cpHandler == nil {
			return
		}
		msgType, resp := h.cpHandler.HandleStart(m.client.playerID)
		if msgType != "" {
			h.send(m.client, msgType, resp)
		}

	case "cp_update":
		if h.cpHandler == nil {
			return
		}
		p := payload.(CPUpdatePayload)
		msgType, resp := h.cpHandler.HandleUpdate(m.client.playerID, p.Lat, p.Lon, p.Acc)
		if msgType != "" {
			h.send(m.client, msgType, resp)
		}

	case "cp_stop":
		if h.cpHandler == nil {
			return
		}
		msgType, resp := h.cpHandler.HandleStop(m.client.playerID)
		if msgType != "" {
			h.send(m.client, msgType, resp)
		}

	case "cp_balance":
		if h.cpHandler == nil {
			return
		}
		msgType, resp := h.cpHandler.HandleBalance(m.client.playerID)
		if msgType != "" {
			h.send(m.client, msgType, resp)
		}
	}
}

func (h *Hub) sendToPlayer(playerID string, msgType string, payload any) {
	for c := range h.clients {
		if c.playerID == playerID {
			h.send(c, msgType, payload)
			return
		}
	}
}

func (h *Hub) step(dt float64) {
	h.world.Tick++

	h.world.UpdateBots()

	for len(h.world.Sharks) < game.MinPopulation {
		id := h.allocBotID()
		name := "Bot" + id

		s := game.NewShark(id, name, randomSpawn())
		s.IsBot = true
		s.Route = randomBotRoute()
		h.world.Sharks[id] = s
	}

	for _, s := range h.world.Sharks {
		if !s.Alive {
			continue
		}
		if s.IsBot || s.Moving {
			dash := s.WantDash && s.CP > 0
			s.Move(dt, dash)
			if dash {
				consume := game.DashCPPerSec / float64(game.TickHz) * game.DashCPScale(s.Route)
				s.CP -= consume
				if s.CP < 0 {
					s.CP = 0
				}
			} else if !s.WantDash {
				s.CP += game.CPRegenPerSec / float64(game.TickHz)
				if s.CP > s.MaxCP {
					s.CP = s.MaxCP
				}
			}
		}
	}

	wallDead := h.world.CheckWallDeaths()
	territoryDead := h.world.CheckTerritoryViolations()
	sharkDead := h.world.CheckSharkCollisions()
	_ = h.world.ConsumeFoods()
	h.world.MoveDivers(dt)
	_ = h.world.ConsumeDivers()

	// Decay speed boosts
	for _, s := range h.world.Sharks {
		if s.SpeedBoostUntilTick > 0 && h.world.Tick > s.SpeedBoostUntilTick {
			s.SpeedBoostUntilTick = 0
		}
	}

	for _, s := range h.world.Sharks {
		if s.Alive {
			s.UpdateStage()

			// Stage変更時に特性を再割り当て
			game.AssignTraitToShark(s)
		}
	}

	allDead := make(map[string]struct{}, len(wallDead)+len(territoryDead)+len(sharkDead))
	for _, id := range wallDead {
		allDead[id] = struct{}{}
	}
	for _, id := range territoryDead {
		allDead[id] = struct{}{}
	}
	for _, id := range sharkDead {
		allDead[id] = struct{}{}
	}
	for id := range allDead {
		s := h.world.Sharks[id]
		if s == nil {
			continue
		}
		_ = h.world.ScatterDeadShark(s)
		h.notifyDeath(id, s)
		delete(h.world.Sharks, id)
	}

	h.world.SpawnFoodsTo(game.FoodCount)
	h.world.SpawnDiversTo(game.DiverCount)

	h.leaderboard.BeginTick()
	for id, s := range h.world.Sharks {
		if s.Alive && !s.IsBot {
			h.leaderboard.Record(id, s.Name, s.XP)
		}
	}
	if h.leaderboard.EndTick() {
		name, score, ok := h.leaderboard.Top()
		if ok {
			if h.leaderboardStore.MaybeUpdate(name, score) {
				h.broadcastLeaderboard()
			} else {
				// If Redis/global store did not register a top change, still send local top
				h.broadcastLeaderboard()
			}
		}
	}

	for c := range h.clients {
		if !c.cpOnly {
			h.sendStateTo(c)
		}
	}
}

func (h *Hub) notifyDeath(playerID string, s *game.Shark) {
	for c := range h.clients {
		if c.playerID == playerID {
			h.send(c, "death", DeathPayload{
				Score: s.XP,
				Stage: s.Stage + 1,
			})
			c.playerID = ""
			return
		}
	}
}

func (h *Hub) broadcastLeaderboard() {
	name, score, ok := h.leaderboardStore.Top()
	if !ok {
		return
	}

	for c := range h.clients {
		h.send(c, "leaderboard", LeaderboardPayload{
			TopName:  name,
			TopScore: score,
		})
	}
}

func sharkViewEqual(a, b StateSharkView) bool {
	return a.ID == b.ID && a.Name == b.Name && a.X == b.X && a.Y == b.Y && a.Angle == b.Angle && a.Stage == b.Stage && a.Route == b.Route && a.Boosted == b.Boosted && territoriesEqual(a.Territories, b.Territories)
}

func territoriesEqual(a, b [][]Point) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if len(a[i]) != len(b[i]) {
			return false
		}
		for j := range a[i] {
			if a[i][j] != b[i][j] {
				return false
			}
		}
	}
	return true
}

func foodViewEqual(a, b StateFoodView) bool {
	return a.ID == b.ID && a.X == b.X && a.Y == b.Y && a.IsRed == b.IsRed && a.IsDiver == b.IsDiver
}

func pointInPolygon(pt game.Vec, polygon []game.Vec) bool {
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

func segmentCircleIntersect(a, b, center game.Vec, radius float64) bool {
	dx := b.X - a.X
	dy := b.Y - a.Y
	if dx == 0 && dy == 0 {
		return center.Dist(a) <= radius
	}
	// Project center onto segment [a,b]
	t := ((center.X-a.X)*dx + (center.Y-a.Y)*dy) / (dx*dx + dy*dy)
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	closest := game.Vec{X: a.X + dx*t, Y: a.Y + dy*t}
	return closest.Dist(center) <= radius
}

func polygonIntersectsCircle(polygon []game.Vec, center game.Vec, radius float64) bool {
	for _, v := range polygon {
		if v.Dist(center) <= radius {
			return true
		}
	}
	for i := 0; i < len(polygon)-1; i++ {
		if segmentCircleIntersect(polygon[i], polygon[i+1], center, radius) {
			return true
		}
	}
	return false
}

func shouldSendShark(self, other *game.Shark, radius float64) bool {
	if other.Head.Dist(self.Head) <= radius {
		return true
	}
	for _, poly := range other.Territories {
		if pointInPolygon(self.Head, poly) || polygonIntersectsCircle(poly, self.Head, radius) {
			return true
		}
	}
	return false
}

func (h *Hub) sendStateTo(c *Client) {
	self := h.world.Sharks[c.playerID]

	if self == nil {
		payload := StatePayload{
			Tick:   h.world.Tick,
			Full:   true,
			You:    StateYou{CP: int(game.InitialCP), MaxCP: int(game.MaxCPDefault)},
			Sharks: []StateSharkView{},
			Foods:  []StateFoodView{},
		}
		h.send(c, "state", payload)
		c.lastStateTick = h.world.Tick
		c.lastSharks = map[string]StateSharkView{}
		c.lastFoods = map[string]StateFoodView{}
		return
	}

	radius := game.VisibilityRadius
	if self.Stage == 4 {
		radius = game.VisibilityStage5
	}

	currentSharkMap := make(map[string]StateSharkView, 8)
	currentSharks := make([]StateSharkView, 0, 8)
	for _, s := range h.world.Sharks {
		if !s.Alive || !shouldSendShark(self, s, radius) {
			continue
		}
		territories := make([][]Point, 0, len(s.Territories))
		for _, poly := range s.Territories {
			pts := make([]Point, 0, len(poly))
			for _, p := range poly {
				pts = append(pts, Point{X: p.X, Y: p.Y})
			}
			territories = append(territories, pts)
		}
		view := StateSharkView{
			ID:          s.ID,
			Name:        s.Name,
			X:           s.Head.X,
			Y:           s.Head.Y,
			Angle:       s.Angle,
			Stage:       s.Stage,
			Route:       s.Route,
			Territories: territories,
			Boosted:     s.SpeedBoostUntilTick > 0 && h.world.Tick <= s.SpeedBoostUntilTick,
		}
		currentSharks = append(currentSharks, view)
		currentSharkMap[view.ID] = view
	}

	currentFoodMap := make(map[string]StateFoodView, 64)
	currentFoods := make([]StateFoodView, 0, 64)
	for _, f := range h.world.Foods {
		if f.Pos.Dist(self.Head) > radius {
			continue
		}
		view := StateFoodView{
			ID:      f.ID,
			X:       f.Pos.X,
			Y:       f.Pos.Y,
			IsRed:   f.IsRed,
			IsDiver: f.IsDiver,
		}
		currentFoods = append(currentFoods, view)
		currentFoodMap[view.ID] = view
	}

	payload := StatePayload{
		Tick: h.world.Tick,
		You: StateYou{
			ID:    self.ID,
			X:     self.Head.X,
			Y:     self.Head.Y,
			XP:    self.XP,
			Stage: self.Stage,
			CP:    int(self.CP),
			MaxCP: int(self.MaxCP),
		},
	}

	if c.lastStateTick == 0 {
		payload.Full = true
		payload.Sharks = currentSharks
		payload.Foods = currentFoods
	} else {
		for id, current := range currentSharkMap {
			if prev, ok := c.lastSharks[id]; !ok {
				payload.AddedSharks = append(payload.AddedSharks, current)
			} else if !sharkViewEqual(prev, current) {
				payload.UpdatedSharks = append(payload.UpdatedSharks, current)
			}
		}
		for id := range c.lastSharks {
			if _, ok := currentSharkMap[id]; !ok {
				payload.RemovedSharks = append(payload.RemovedSharks, id)
			}
		}

		for id, current := range currentFoodMap {
			if prev, ok := c.lastFoods[id]; !ok {
				payload.AddedFoods = append(payload.AddedFoods, current)
			} else if !foodViewEqual(prev, current) {
				payload.UpdatedFoods = append(payload.UpdatedFoods, current)
			}
		}
		for id := range c.lastFoods {
			if _, ok := currentFoodMap[id]; !ok {
				payload.RemovedFoods = append(payload.RemovedFoods, id)
			}
		}
	}

	h.send(c, "state", payload)
	c.lastStateTick = h.world.Tick
	c.lastSharks = currentSharkMap
	c.lastFoods = currentFoodMap
}
