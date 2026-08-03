package ws

import (
	"testing"

	"github.com/samezario/server/internal/game"
)

func TestTerritoriesEqual(t *testing.T) {
	a := [][]Point{{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}, {X: 0, Y: 10}}}
	b := [][]Point{{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}, {X: 0, Y: 10}}}
	c := [][]Point{{{X: 0, Y: 0}, {X: 11, Y: 0}, {X: 10, Y: 10}, {X: 0, Y: 10}}}

	if !territoriesEqual(a, b) {
		t.Fatal("expected territories to be equal")
	}
	if territoriesEqual(a, c) {
		t.Fatal("expected territories to be different")
	}
}

func TestShouldSendSharkWhenTerritoryContainsSelf(t *testing.T) {
	self := &game.Shark{
		ID:    "p1",
		Head:  game.Vec{X: 50, Y: 50},
		Alive: true,
	}
	other := &game.Shark{
		ID:    "p2",
		Head:  game.Vec{X: 300, Y: 300},
		Alive: true,
		Territories: [][]game.Vec{{
			{X: 20, Y: 20},
			{X: 80, Y: 20},
			{X: 80, Y: 80},
			{X: 20, Y: 80},
			{X: 20, Y: 20},
		}},
	}

	if !shouldSendShark(self, other, 64) {
		t.Fatal("expected shark to be visible because self is inside the territory")
	}
}
