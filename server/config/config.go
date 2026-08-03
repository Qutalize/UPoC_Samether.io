package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
) 
 
type Config struct {
	RoomID              string
	RoomCapacity        int
	InstanceID          string
	RedisAddr           string
	RedisPassword       string
	RedisDB             int
	RedisPrefix         string
	LocationTrackerName string
	LocationMapAPIKey   string
	AWSRegion           string
}

func Load() Config {
	// .env を読み込む（GO_ENV=production 以外のみ）
	if os.Getenv("GO_ENV") != "production" {
		for _, p := range []string{".env", "../.env"} {
			if err := godotenv.Load(p); err == nil {
				log.Printf("Loaded env from %s", p)
				break
			}
		}
	}

	cfg := Config{
		RoomCapacity: 50,
		RedisDB:      0,
	}

	// Room configuration
	if raw := os.Getenv("ROOM_CAPACITY"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			cfg.RoomCapacity = parsed
		} else {
			log.Printf("Warning: Invalid ROOM_CAPACITY value: %s, using default: %d", raw, cfg.RoomCapacity)
		}
	}

	cfg.RoomID = getenvDefault("ROOM_ID", defaultRoomID())
	cfg.InstanceID = getenvDefault("INSTANCE_ID", cfg.RoomID)

	// Redis configuration with validation
	cfg.RedisAddr = os.Getenv("REDIS_ADDR")
	if cfg.RedisAddr != "" {
		log.Printf("Redis enabled at: %s", cfg.RedisAddr)
	} else {
		log.Printf("Redis not configured, using in-memory leaderboard")
	}

	cfg.RedisPassword = os.Getenv("REDIS_PASSWORD")
	cfg.RedisPrefix = getenvDefault("REDIS_PREFIX", "samezario:leaderboard")

	if raw := os.Getenv("REDIS_DB"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			cfg.RedisDB = parsed
		} else {
			log.Printf("Warning: Invalid REDIS_DB value: %s, using default: %d", raw, cfg.RedisDB)
		}
	}

	// AWS Location Service configuration
	cfg.AWSRegion = getenvDefault("AWS_REGION", "ap-northeast-1")
	cfg.LocationTrackerName = os.Getenv("LOCATION_TRACKER_NAME")
	cfg.LocationMapAPIKey = os.Getenv("LOCATION_MAP_API_KEY")

	return cfg
}

func getenvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func defaultRoomID() string {
	hostname, err := os.Hostname()
	if err == nil && hostname != "" {
		return hostname
	}
	return "room-1"
}
