import Phaser from "phaser";
import type {
  StatePayload,
  StateSharkView,
  StateFoodView,
  SharkRoute,
} from "../../network/protocol";
import { Shark } from "../objects/Shark";
import { Food } from "../objects/Food";

/* Deterministic route fallback based on shark ID string hash */
function getDummyRoute(id: string): SharkRoute {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0;
  }
  const routes: SharkRoute[] = ["attack", "non-attack", "deep-sea"];
  return routes[Math.abs(h) % routes.length];
}

/**
 * GameState manages the authoritative entity Maps (sharks / foods) and
 * applies server state payloads, notifying the scene about entity lifecycle
 * events so it can update its rendering containers.
 */
export class GameState {
  private sharks = new Map<string, Shark>();
  private foods = new Map<string, Food>();
  private myLevel: number = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private myId: string,
    private myRoute: SharkRoute,
    private readonly onSharkAdded: (shark: Shark) => void,
    private readonly onFoodAdded: (food: Food) => void,
  ) {}

  /** Update the local player ID (called on welcome / first state). */
  setMyId(id: string): void {
    this.myId = id;
  }

  /** Update the local player's level (called when stage changes). */
  setMyLevel(level: number): void {
    this.myLevel = level;
    // Update all existing sharks with the new level for territory filtering
    for (const shark of this.sharks.values()) {
      shark.setMyLevel(level);
    }
  }

  /** Update all sharks with the player's route for territory filtering */
  setMyRoute(route: SharkRoute): void {
    this.myRoute = route;
    for (const shark of this.sharks.values()) {
      shark.setMyRoute(route);
    }
  }

  /** Read-only view of the current shark entities (for radar, etc.). */
  getSharks(): Map<string, Shark> {
    return this.sharks;
  }

  /** Read-only view of the current food entities (for animation, etc.). */
  getFoods(): Map<string, Food> {
    return this.foods;
  }

  /** Replace all entities with the full snapshot from the server. */
  applyFullState(m: StatePayload): void {
    const seen = new Set<string>();
    for (const v of m.sharks ?? []) {
      seen.add(v.id);
      this.getOrCreateShark(v);
    }
    for (const [id, s] of this.sharks) {
      if (!seen.has(id)) {
        s.destroy();
        this.sharks.delete(id);
      }
    }

    const seenF = new Set<string>();
    for (const f of m.foods ?? []) {
      seenF.add(f.id);
      this.getOrCreateFood(f);
    }
    for (const [id, f] of this.foods) {
      if (!seenF.has(id)) {
        f.destroy();
        this.foods.delete(id);
      }
    }
  }

  /** Apply an incremental delta update from the server. */
  applyStateDelta(m: StatePayload): void {
    for (const v of m.addedSharks ?? []) this.getOrCreateShark(v);
    for (const v of m.updatedSharks ?? []) this.getOrCreateShark(v);
    for (const id of m.removedSharks ?? []) this.removeShark(id);

    for (const f of m.addedFoods ?? []) this.getOrCreateFood(f);
    for (const f of m.updatedFoods ?? []) this.getOrCreateFood(f);
    for (const id of m.removedFoods ?? []) this.removeFood(id);
  }

  /**
   * Get-or-create a Shark for the given view, then update its state.
   * Consolidates the duplicate shark-creation logic that previously existed
   * in both applyFullState and upsertShark.
   */
  private getOrCreateShark(v: StateSharkView): Shark {
    let s = this.sharks.get(v.id);
    const isSelf = v.id === this.myId;
    if (!s) {
      s = new Shark(this.scene, v.x, v.y, isSelf);
      s.setMyLevel(this.myLevel); // Set current player level for territory filtering
      s.setMyRoute(this.myRoute); // Set current player route for territory filtering
      this.sharks.set(v.id, s);
      this.onSharkAdded(s);
    }
    // Apply the player's own chosen route; fall back to a deterministic
    // hash-based route for other players whose route the server does not send.
    const route = isSelf ? this.myRoute : (v.route ?? getDummyRoute(v.id));
    s.updateFromState(
      v.x,
      v.y,
      v.angle,
      v.stage,
      this.scene.time.now,
      route,
      v.name,
      v.territories ?? [],
      v.boosted ?? false,
    );
    return s;
  }

  private removeShark(id: string): void {
    const s = this.sharks.get(id);
    if (!s) return;
    s.destroy();
    this.sharks.delete(id);
  }

  /** Get-or-create a Food for the given view, then sync its position. */
  private getOrCreateFood(v: StateFoodView): Food {
    let f = this.foods.get(v.id);
    if (!f) {
      f = new Food(this.scene, v.x, v.y, v.isRed, v.isDiver);
      this.foods.set(v.id, f);
      this.onFoodAdded(f);
    }
    f.updatePosition(v.x, v.y);
    return f;
  }

  private removeFood(id: string): void {
    const f = this.foods.get(id);
    if (!f) return;
    f.destroy();
    this.foods.delete(id);
  }
}
