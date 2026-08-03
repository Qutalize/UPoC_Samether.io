package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/samezario/server/config"
	sstatic "github.com/samezario/server/internal/static"
	sws "github.com/samezario/server/internal/ws"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	flag.Parse()

	cfg := config.Load()

	hub := sws.NewHub(sws.Config{
		RoomID:              cfg.RoomID,
		RoomCapacity:        cfg.RoomCapacity,
		InstanceID:          cfg.InstanceID,
		RedisAddr:           cfg.RedisAddr,
		RedisPassword:       cfg.RedisPassword,
		RedisDB:             cfg.RedisDB,
		RedisPrefix:         cfg.RedisPrefix,
		LocationTrackerName: cfg.LocationTrackerName,
		LocationMapAPIKey:   cfg.LocationMapAPIKey,
		AWSRegion:           cfg.AWSRegion,
	})
	go hub.Run()

	mux := http.NewServeMux()

	// Health check endpoints
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","roomId":"` + cfg.RoomID + `","instanceId":"` + cfg.InstanceID + `"}`))
	})

	// Room info endpoint
	mux.HandleFunc("/room", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(sws.MustMarshal("room", hub.RoomSnapshot()))
	})

	// Map API key endpoint for client MapLibre GL JS
	mux.HandleFunc("/api/map-key", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		origin := r.Header.Get("Origin")
		if !isAllowedOrigin(origin) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "private, max-age=300")
		resp, _ := json.Marshal(map[string]string{
			"region": cfg.AWSRegion,
			"apiKey": cfg.LocationMapAPIKey,
		})
		_, _ = w.Write(resp)
	})

	// WebSocket endpoint
	mux.HandleFunc("/ws", hub.ServeWS)

	// Static files
	mux.Handle("/", http.FileServer(http.FS(sstatic.FS())))

	// Wrap with security middleware
	handler := securityMiddleware(mux)

	server := &http.Server{
		Addr:              *addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}

	log.Printf("samezario-server listening on %s room_id=%s capacity=%d instance_id=%s", *addr, cfg.RoomID, cfg.RoomCapacity, cfg.InstanceID)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

// securityMiddleware adds security headers and basic protection
func securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// CORS headers for WebSocket and API endpoints
		origin := r.Header.Get("Origin")
		if origin != "" && isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// isAllowedOrigin checks if the origin is allowed for CORS.
// An empty origin (same-origin / non-browser request served behind a reverse proxy) is allowed.
func isAllowedOrigin(origin string) bool {
	// Same-origin requests (no Origin header) are allowed
	if origin == "" {
		return true
	}

	// Allow localhost for development
	if strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") ||
		strings.HasPrefix(origin, "https://localhost:") {
		return true
	}

	// Production domains from environment variable (comma-separated)
	if allowedOrigins := os.Getenv("ALLOWED_ORIGINS"); allowedOrigins != "" {
		for _, allowed := range strings.Split(allowedOrigins, ",") {
			if origin == strings.TrimSpace(allowed) {
				return true
			}
		}
	}

	return false
}
