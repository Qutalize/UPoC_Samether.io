package ws

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 5 * time.Second
	pongWait   = 5 * time.Minute
	pingPeriod = 30 * time.Second
	maxMsgSize = 4096
)

// Client wraps one websocket connection and owns a write pump.
// Reads are consumed by the Hub which owns game state.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte // outbound frames
	playerID string      // set after join; empty while not playing
	cpOnly   bool        // true when joined only for CP tracking (no shark spawned)

	lastStateTick int64
	lastSharks map[string]StateSharkView
	lastFoods map[string]StateFoodView
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMsgSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("read error: %v", err)
			}
			return
		}

		// 新プロトコルで type 取得
		typ, _, err := DecodeMessage(raw)
		if err != nil {
			continue
		}

		c.hub.inbound <- inboundMsg{
			client: c,
			raw:    raw,
			typ:    typ,
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
 
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}