import Phaser from "phaser";
import { SharkRoute } from "../../network/protocol";

export const TERRITORY_RENDERING_ENABLED = true;

const ROUTE_HIGHLIGHT_COLORS: Record<SharkRoute, number> = {
  attack: 0xff6666,
  "non-attack": 0x66ccff,
  "deep-sea": 0xbb66ff,
  human: 0xffcc88, // Orange/Peach for humans
};

export class TerritoryRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private enabled = TERRITORY_RENDERING_ENABLED;

  constructor(scene: Phaser.Scene, depth = -2) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
    this.graphics.setVisible(this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
    if (!enabled) {
      this.graphics.clear();
    }
  }

  render(
    territories: Array<Array<{ x: number; y: number }>>,
    route: SharkRoute,
    isOwn: boolean,
    isDangerous: boolean,
    isSameRoute: boolean = false,
  ): void {
    this.graphics.clear();
    if (!this.enabled || territories.length === 0) {
      return;
    }

    // Determine color based on territory type
    let baseColor: number;
    let lineAlpha: number;
    let fillAlpha: number;

    if (isOwn) {
      // Own territories: use the route highlight color (red/blue/purple by route)
      baseColor = ROUTE_HIGHLIGHT_COLORS[route] ?? 0x66ccff;
      lineAlpha = 0.8;
      fillAlpha = 0.2;
    } else if (isSameRoute) {
      // Same route territories (allies): use route color but dimmer (safe zones)
      baseColor = ROUTE_HIGHLIGHT_COLORS[route] ?? 0x66ccff;
      lineAlpha = 0.4;
      fillAlpha = 0.1;
    } else if (isDangerous) {
      // Different route, higher level territories: orange (danger)
      baseColor = 0xff6600; // Orange
      lineAlpha = 0.9;
      fillAlpha = 0.3;
    } else {
      // Same/lower level, different route: don't render
      return;
    }

    this.graphics.lineStyle(3, baseColor, lineAlpha);
    this.graphics.fillStyle(baseColor, fillAlpha);

    for (const poly of territories) {
      if (poly.length < 3) {
        continue;
      }
      this.graphics.beginPath();
      this.graphics.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        this.graphics.lineTo(poly[i].x, poly[i].y);
      }
      this.graphics.closePath();
      this.graphics.fillPath();
      this.graphics.strokePath();
    }
  }

  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
