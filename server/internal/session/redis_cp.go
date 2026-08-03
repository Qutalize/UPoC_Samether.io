package session

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
)

const maxCPBalance = 10_000

// addCPScript atomically increments and caps the CP balance via Lua.
const addCPScript = `local c=redis.call('INCRBY',KEYS[1],ARGV[1]) if c>tonumber(ARGV[2]) then redis.call('SET',KEYS[1],ARGV[2]) return tonumber(ARGV[2]) end return c`

// RedisCPStore persists CP balances in Redis using the same
// hand-rolled RESP protocol as RedisLeaderboard.
type RedisCPStore struct {
	address  string
	password string
	db       int
	prefix   string // key prefix, e.g. "samether:cp"
}

// NewRedisCPStore creates a Redis-backed CP store.
func NewRedisCPStore(addr, password string, db int) (*RedisCPStore, error) {
	if addr == "" {
		return nil, fmt.Errorf("redis address is empty")
	}
	store := &RedisCPStore{
		address:  addr,
		password: password,
		db:       db,
		prefix:   "samether:cp",
	}
	if err := store.ping(); err != nil {
		return nil, err
	}
	return store, nil
}

func (r *RedisCPStore) key(playerID string) string {
	return r.prefix + ":" + playerID
}

// GetCP returns the current CP balance for a player.
func (r *RedisCPStore) GetCP(playerID string) (int, error) {
	k := r.key(playerID)
	cmd := fmt.Sprintf("*2\r\n$3\r\nGET\r\n$%d\r\n%s\r\n", len(k), k)
	reply, err := r.sendRawCommand(cmd)
	if err != nil {
		// nil response means key doesn't exist → balance 0
		if strings.Contains(err.Error(), "nil response") {
			return 0, nil
		}
		return 0, err
	}
	if len(reply) == 0 {
		return 0, nil
	}
	val, err := strconv.Atoi(reply[0])
	if err != nil {
		return 0, nil
	}
	return val, nil
}

// AddCP atomically increments the CP balance and returns the new total.
// Uses a Lua script to ensure INCRBY + cap are executed atomically.
func (r *RedisCPStore) AddCP(playerID string, earned int) (int, error) {
	k := r.key(playerID)
	earnedStr := strconv.Itoa(earned)
	maxStr := strconv.Itoa(maxCPBalance)
	cmd := fmt.Sprintf("*6\r\n$4\r\nEVAL\r\n$%d\r\n%s\r\n$1\r\n1\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
		len(addCPScript), addCPScript,
		len(k), k,
		len(earnedStr), earnedStr,
		len(maxStr), maxStr)
	reply, err := r.sendRawCommand(cmd)
	if err != nil {
		return 0, err
	}
	if len(reply) == 0 {
		return 0, fmt.Errorf("empty EVAL response")
	}
	newTotal, err := strconv.Atoi(reply[0])
	if err != nil {
		return 0, err
	}
	return newTotal, nil
}

func (r *RedisCPStore) ping() error {
	conn, err := net.Dial("tcp", r.address)
	if err != nil {
		return err
	}
	defer conn.Close()

	if r.password != "" {
		if err := r.writeCommand(conn, "AUTH", r.password); err != nil {
			return err
		}
		if line, err := bufio.NewReader(conn).ReadString('\n'); err != nil {
			return err
		} else if !strings.HasPrefix(line, "+OK") {
			return fmt.Errorf("redis auth failed: %s", line)
		}
	}

	if r.db != 0 {
		if err := r.writeCommand(conn, "SELECT", strconv.Itoa(r.db)); err != nil {
			return err
		}
		if line, err := bufio.NewReader(conn).ReadString('\n'); err != nil {
			return err
		} else if !strings.HasPrefix(line, "+OK") {
			return fmt.Errorf("redis select failed: %s", line)
		}
	}

	if err := r.writeCommand(conn, "PING"); err != nil {
		return err
	}
	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		return err
	}
	if !strings.HasPrefix(line, "+PONG") {
		return fmt.Errorf("unexpected redis ping response: %s", line)
	}
	return nil
}

func (r *RedisCPStore) writeCommand(conn net.Conn, cmd string, args ...string) error {
	if _, err := conn.Write([]byte(fmt.Sprintf("*%d\r\n$%d\r\n%s\r\n", len(args)+1, len(cmd), cmd))); err != nil {
		return err
	}
	for _, arg := range args {
		if _, err := conn.Write([]byte(fmt.Sprintf("$%d\r\n%s\r\n", len(arg), arg))); err != nil {
			return err
		}
	}
	return nil
}

func (r *RedisCPStore) sendRawCommand(cmd string) ([]string, error) {
	conn, err := net.Dial("tcp", r.address)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Auth + SELECT if needed
	if r.password != "" {
		if err := r.writeCommand(conn, "AUTH", r.password); err != nil {
			return nil, err
		}
		reader := bufio.NewReader(conn)
		if line, err := reader.ReadString('\n'); err != nil {
			return nil, err
		} else if !strings.HasPrefix(line, "+OK") {
			return nil, fmt.Errorf("redis auth failed: %s", line)
		}
	}
	if r.db != 0 {
		if err := r.writeCommand(conn, "SELECT", strconv.Itoa(r.db)); err != nil {
			return nil, err
		}
		reader := bufio.NewReader(conn)
		if line, err := reader.ReadString('\n'); err != nil {
			return nil, err
		} else if !strings.HasPrefix(line, "+OK") {
			return nil, fmt.Errorf("redis select failed: %s", line)
		}
	}

	if _, err := conn.Write([]byte(cmd)); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	switch line[0] {
	case '+':
		return []string{strings.TrimSpace(line[1:])}, nil
	case ':':
		return []string{strings.TrimSpace(line[1:])}, nil
	case '$':
		length, _ := strconv.Atoi(strings.TrimSpace(line[1:]))
		if length < 0 {
			return nil, fmt.Errorf("nil response")
		}
		buf := make([]byte, length+2)
		if _, err := io.ReadFull(reader, buf); err != nil {
			return nil, err
		}
		return []string{string(buf[:length])}, nil
	case '-':
		return nil, fmt.Errorf("redis error: %s", strings.TrimSpace(line[1:]))
	default:
		return nil, fmt.Errorf("unexpected redis response: %s", line)
	}
}
