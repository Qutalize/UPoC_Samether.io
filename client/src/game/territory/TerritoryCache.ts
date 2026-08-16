/**
 * TerritoryCache.ts
 *
 * Client-side cache for territories with level-based filtering.
 * Only stores and manages territories that are relevant to the current player.
 */

import type { SharkRoute } from "../../network/protocol";

export interface Point {
  x: number;
  y: number;
}

export type TerritoryColor = 'route' | 'danger' | null;

export interface Territory {
  id: string;
  sharkId: string;
  level: number;
  polygon: Point[];
  expiresAt: number;
  route?: SharkRoute;
  color?: TerritoryColor;
}

export class TerritoryCache {
  private territories: Map<string, Territory> = new Map();
  private mySharkId: string | null = null;
  private myLevel: number = 1;

  constructor() {}

  /**
   * Set the current player's shark ID and level
   */
  setMyShark(sharkId: string, level: number): void {
    this.mySharkId = sharkId;
    this.myLevel = level;
    this.recalculateColors();
  }

  /**
   * Update only the player's level (on evolution)
   */
  setMyLevel(level: number): void {
    this.myLevel = level;
    this.recalculateColors();
  }

  /**
   * Add a new territory to the cache
   */
  add(territory: Territory): void {
    const color = this.calculateColor(territory);

    // Only store territories that should be displayed
    if (color !== null) {
      this.territories.set(territory.id, {
        ...territory,
        color,
      });
    }
  }

  /**
   * Update a territory's level
   */
  updateLevel(territoryId: string, newLevel: number): void {
    const territory = this.territories.get(territoryId);
    if (!territory) return;

    territory.level = newLevel;
    const newColor = this.calculateColor(territory);

    if (newColor === null) {
      // Territory is no longer relevant, remove it
      this.territories.delete(territoryId);
    } else {
      territory.color = newColor;
    }
  }

  /**
   * Remove territories by IDs
   */
  remove(territoryIds: string[]): void {
    territoryIds.forEach(id => this.territories.delete(id));
  }

  /**
   * Get a specific territory
   */
  get(territoryId: string): Territory | undefined {
    return this.territories.get(territoryId);
  }

  /**
   * Get all territories that should be displayed
   */
  getAll(): Territory[] {
    return Array.from(this.territories.values());
  }

  /**
   * Get territories by color type
   */
  getByColor(color: TerritoryColor): Territory[] {
    return Array.from(this.territories.values())
      .filter(t => t.color === color);
  }

  /**
   * Get only dangerous territories (higher level, orange)
   */
  getDangerousTerritories(): Territory[] {
    return this.getByColor('danger');
  }

  /**
   * Get only own territories (route color)
   */
  getMyTerritories(): Territory[] {
    return this.getByColor('route');
  }

  /**
   * Check if a point is inside any dangerous territory
   */
  isPointInDanger(x: number, y: number): Territory | null {
    for (const territory of this.getDangerousTerritories()) {
      if (this.pointInPolygon({ x, y }, territory.polygon)) {
        return territory;
      }
    }
    return null;
  }

  /**
   * Remove expired territories
   */
  removeExpired(): string[] {
    const now = Date.now();
    const expired: string[] = [];

    this.territories.forEach((territory, id) => {
      if (territory.expiresAt <= now) {
        expired.push(id);
        this.territories.delete(id);
      }
    });

    return expired;
  }

  /**
   * Clear all territories
   */
  clear(): void {
    this.territories.clear();
  }

  /**
   * Get the count of territories
   */
  count(): number {
    return this.territories.size;
  }

  /**
   * Calculate the display color for a territory
   * Returns null if the territory should not be displayed
   */
  private calculateColor(territory: Territory): TerritoryColor {
    // Own territories use route color
    if (territory.sharkId === this.mySharkId) {
      return 'route';
    }

    // Higher level territories are dangerous (orange)
    if (territory.level > this.myLevel) {
      return 'danger';
    }

    // Same level or lower territories are not displayed
    return null;
  }

  /**
   * Recalculate colors for all territories (called on level change)
   */
  private recalculateColors(): void {
    const toRemove: string[] = [];

    this.territories.forEach((territory, id) => {
      const newColor = this.calculateColor(territory);

      if (newColor === null) {
        toRemove.push(id);
      } else {
        territory.color = newColor;
      }
    });

    // Remove territories that are no longer relevant
    toRemove.forEach(id => this.territories.delete(id));
  }

  /**
   * Point-in-polygon test (ray casting algorithm)
   */
  private pointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }
}
