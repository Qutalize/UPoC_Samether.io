package cp

import "sync"

// CPStore is the interface for CP balance persistence.
type CPStore interface {
	GetCP(playerID string) (int, error)
	AddCP(playerID string, earned int) (int, error)
}

// inMemoryCPStore is a simple in-memory CP store for development or when Redis is unavailable.
type inMemoryCPStore struct {
	mu       sync.Mutex
	balances map[string]int
}

// NewInMemoryCPStore creates an in-memory CP store.
func NewInMemoryCPStore() CPStore {
	return &inMemoryCPStore{balances: make(map[string]int)}
}

func (s *inMemoryCPStore) GetCP(playerID string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.balances[playerID], nil
}

func (s *inMemoryCPStore) AddCP(playerID string, earned int) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.balances[playerID]
	newTotal := current + earned
	if newTotal > MaxCPBalance {
		newTotal = MaxCPBalance
	}
	s.balances[playerID] = newTotal
	return newTotal, nil
}
