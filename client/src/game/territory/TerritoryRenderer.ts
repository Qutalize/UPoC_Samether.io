/**
 * TerritoryRenderer.ts
 *
 * Renders territories with optimized drawing and visual effects.
 * Uses Phaser Graphics for efficient polygon rendering.
 */

import * as Phaser from 'phaser';
import { Territory, TerritoryCache, Point } from './TerritoryCache';
import type { SharkRoute } from '../../network/protocol';
import { getRouteColor, DANGER_COLOR } from '../config/RouteColors';

export class TerritoryRenderer {
  private scene: Phaser.Scene;
  private cache: TerritoryCache;
  private graphics: Phaser.GameObjects.Graphics;
  private warningIcons: Map<string, Phaser.GameObjects.Text> = new Map();
  private dangerousWarningIds: Set<string> = new Set();
  private myRoute: SharkRoute;

  // Visual settings for danger color
  private dangerStyle = {
    lineAlpha: 0.9,
    fillAlpha: 0.3,
  };

  // Visual settings for route colors
  private routeStyle = {
    lineAlpha: 0.8,
    fillAlpha: 0.2,
  };

  constructor(scene: Phaser.Scene, cache: TerritoryCache, myRoute: SharkRoute) {
    this.scene = scene;
    this.cache = cache;
    this.myRoute = myRoute;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5); // Below sharks, above background
  }

  /**
   * Update player's route (for color changes)
   */
  setMyRoute(route: SharkRoute): void {
    this.myRoute = route;
  }

  /**
   * Update and redraw all territories
   */
  update(): void {
    // Clear previous frame
    this.graphics.clear();

    // Remove expired territories
    this.cache.removeExpired();

    const dangerousTerritories = this.cache.getDangerousTerritories();
    this.syncWarningIcons(dangerousTerritories);

    // Draw territories by priority: own (route color) first, then dangerous (orange)
    this.renderMyTerritories(this.cache.getMyTerritories());
    this.renderDangerousTerritories(dangerousTerritories);
  }

  /**
   * Keep warning icons in sync with the current dangerous territory set.
   * Creates icons only for newly dangerous territories and destroys only
   * those that are no longer dangerous.
   */
  private syncWarningIcons(territories: Territory[]): void {
    const nextIds = new Set<string>();

    for (const territory of territories) {
      nextIds.add(territory.id);

      if (!this.warningIcons.has(territory.id)) {
        this.drawWarningIcon(territory);
      }
    }

    for (const territoryId of this.dangerousWarningIds) {
      if (!nextIds.has(territoryId)) {
        const icon = this.warningIcons.get(territoryId);
        if (icon) {
          icon.destroy();
          this.warningIcons.delete(territoryId);
        }
      }
    }

    this.dangerousWarningIds = nextIds;
  }

  /**
   * Render own territories with route color
   */
  private renderMyTerritories(territories: Territory[]): void {
    const routeColor = getRouteColor(this.myRoute);

    this.graphics.lineStyle(3, routeColor, this.routeStyle.lineAlpha);
    this.graphics.fillStyle(routeColor, this.routeStyle.fillAlpha);

    for (const territory of territories) {
      this.drawPolygon(territory.polygon);
    }
  }

  /**
   * Render dangerous territories with orange color
   */
  private renderDangerousTerritories(territories: Territory[]): void {
    this.graphics.lineStyle(3, DANGER_COLOR, this.dangerStyle.lineAlpha);
    this.graphics.fillStyle(DANGER_COLOR, this.dangerStyle.fillAlpha);

    for (const territory of territories) {
      this.drawPolygon(territory.polygon);
    }
  }

  /**
   * Draw a polygon shape
   */
  private drawPolygon(points: Point[]): void {
    if (points.length < 3) return;

    this.graphics.beginPath();
    this.graphics.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      this.graphics.lineTo(points[i].x, points[i].y);
    }

    this.graphics.closePath();
    this.graphics.strokePath();
    this.graphics.fillPath();
  }

  /**
   * Draw a warning icon at the center of a dangerous territory
   */
  private drawWarningIcon(territory: Territory): void {
    const center = this.calculateCentroid(territory.polygon);

    const icon = this.scene.add.text(center.x, center.y, '⚠', {
      fontSize: '32px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 3,
    })
      .setOrigin(0.5)
      .setDepth(6);

    // Add pulsing animation
    this.scene.tweens.add({
      targets: icon,
      scale: { from: 1.0, to: 1.2 },
      alpha: { from: 1.0, to: 0.7 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    this.warningIcons.set(territory.id, icon);
  }

  /**
   * Calculate the centroid (center point) of a polygon
   */
  private calculateCentroid(polygon: Point[]): Point {
    let cx = 0;
    let cy = 0;

    for (const point of polygon) {
      cx += point.x;
      cy += point.y;
    }

    return {
      x: cx / polygon.length,
      y: cy / polygon.length,
    };
  }

  /**
   * Clear all warning icons
   */
  private clearWarningIcons(): void {
    this.warningIcons.forEach(icon => icon.destroy());
    this.warningIcons.clear();
  }

  /**
   * Highlight a specific territory (e.g., on hover)
   */
  highlightTerritory(territoryId: string): void {
    const territory = this.cache.get(territoryId);
    if (!territory) return;

    // Draw highlight effect
    this.graphics.lineStyle(5, 0xffffff, 1.0);
    this.drawPolygon(territory.polygon);
  }

  /**
   * Show visual feedback when entering a dangerous territory
   */
  showDangerAlert(territory: Territory): void {
    const center = this.calculateCentroid(territory.polygon);

    // Create pulsing red circle effect
    const circle = this.scene.add.circle(center.x, center.y, 50, 0xff0000, 0.5);
    circle.setDepth(10);

    this.scene.tweens.add({
      targets: circle,
      scale: { from: 1, to: 3 },
      alpha: { from: 0.5, to: 0 },
      duration: 500,
      onComplete: () => circle.destroy(),
    });

    // Optional: Play warning sound
    // this.scene.sound.play('warning');
  }

  /**
   * Debug: Draw territory IDs and levels
   */
  debugDraw(): void {
    const territories = this.cache.getAll();

    territories.forEach(territory => {
      const center = this.calculateCentroid(territory.polygon);
      const label = `${territory.id.substring(0, 8)}\nLv${territory.level}`;

      this.scene.add.text(center.x, center.y + 40, label, {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 },
      })
        .setOrigin(0.5)
        .setDepth(20);
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.graphics.destroy();
    this.clearWarningIcons();
  }
}
