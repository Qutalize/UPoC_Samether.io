import Phaser from "phaser";
import type { HudComponent } from "./HudComponent";
import type { SharkRoute } from "../../network/protocol";

const RADAR_R = 90;
const RADAR_RANGE = 1400;
const RADAR_M = 28;
const TAU = Math.PI * 2;

export interface RadarBlip {
  id: string;
  x: number;
  y: number;
}

export class RadarRenderer implements HudComponent {
  private gfx: Phaser.GameObjects.Graphics;
  private isMobile = false;
  private originX = 0;
  private originY = 0;

  private sweep = 0;
  private myId = "";
  private myX = 0;
  private myY = 0;
  private myAngle = 0;
  private myRoute: SharkRoute = "attack";
  private sharks: RadarBlip[] = [];
  private foods: { x: number; y: number; isRed?: boolean }[] = [];

  private static isTouchDevice(scene: Phaser.Scene): boolean {
    const nav = globalThis.navigator;
    return !scene.sys.game.device.os.desktop || (nav?.maxTouchPoints ?? 0) > 0;
  }

  constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
    this.isMobile = RadarRenderer.isTouchDevice(scene);
    this.gfx = scene.add.graphics();
    container.add(this.gfx);
    this.updateOrigin(scene.scale.width, scene.scale.height);
    scene.scale.on("resize", (sz: Phaser.Structs.Size) => this.resize(sz));
  }

  setBlips(
    myId: string,
    myX: number,
    myY: number,
    myAngle: number,
    myRoute: SharkRoute,
    sharks: RadarBlip[],
    foods: { x: number; y: number; isRed?: boolean }[],
  ): void {
    this.myId = myId;
    this.myX = myX;
    this.myY = myY;
    this.myAngle = myAngle;
    this.myRoute = myRoute;
    this.sharks = sharks;
    this.foods = foods;
  }

  tick(delta: number): void {
    this.sweep = (this.sweep + delta * 0.0008) % TAU;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.originX;
    const cy = this.originY;
    const r = this.isMobile ? Math.round(RADAR_R * 0.8) : RADAR_R;

    /* dark circle background */
    g.fillStyle(0x040e18, 0.85);
    g.fillCircle(cx, cy, r);

    /* sonar sweep trail (fading pie sector) */
    const steps = 16;
    const arc = Math.PI * 0.4;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a0 = this.sweep - (arc * (i + 1)) / steps;
      const a1 = this.sweep - (arc * i) / steps;
      g.fillStyle(0x22aacc, 0.1 * (1 - t));
      g.slice(cx, cy, r - 1, a0, a1, false);
      g.fillPath();
    }

    /* sweep line */
    g.lineStyle(1.5, 0x44ddff, 0.35);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(
      cx + Math.cos(this.sweep) * (r - 2),
      cy + Math.sin(this.sweep) * (r - 2),
    );
    g.strokePath();

    /* concentric grid rings */
    g.lineStyle(0.5, 0x1a4060, 0.5);
    g.strokeCircle(cx, cy, r * 0.33);
    g.strokeCircle(cx, cy, r * 0.66);

    /* crosshair lines */
    g.lineStyle(0.5, 0x1a4060, 0.4);
    g.beginPath();
    g.moveTo(cx - r, cy);
    g.lineTo(cx + r, cy);
    g.moveTo(cx, cy - r);
    g.lineTo(cx, cy + r);
    g.strokePath();

    /* outer ring */
    g.lineStyle(2, 0x2288aa, 0.85);
    g.strokeCircle(cx, cy, r);

    const s = r / RADAR_RANGE;

    /* food dots */
    for (const f of this.foods) {
      const dx = (f.x - this.myX) * s;
      const dy = (f.y - this.myY) * s;
      if (dx * dx + dy * dy < (r - 2) * (r - 2)) {
        if (f.isRed) {
          /* red food: only visible to attack sharks */
          if (this.myRoute === "attack") {
            g.fillStyle(0xff4444, 0.65);
            g.fillCircle(cx + dx, cy + dy, 1.5);
          }
        } else {
          /* normal food: green dot */
          g.fillStyle(0x44ee88, 0.65);
          g.fillCircle(cx + dx, cy + dy, 1.5);
        }
      }
    }

    /* shark blips (red with glow) */
    for (const sh of this.sharks) {
      if (sh.id === this.myId) continue;
      const dx = (sh.x - this.myX) * s;
      const dy = (sh.y - this.myY) * s;
      const d2 = dx * dx + dy * dy;
      if (d2 < (r - 4) * (r - 4)) {
        g.fillStyle(0xff4444, 0.2);
        g.fillCircle(cx + dx, cy + dy, 5);
        g.fillStyle(0xff4444, 0.8);
        g.fillCircle(cx + dx, cy + dy, 2.5);
      }
    }

    /* player direction arrow (center) - points in shark's movement direction */
    const a = this.myAngle;
    const al = 10;
    const aw = 6;
    const tipX = cx + Math.cos(a) * al;
    const tipY = cy + Math.sin(a) * al;
    const ba = a + Math.PI;
    const lx = cx + Math.cos(ba + 0.5) * aw;
    const ly = cy + Math.sin(ba + 0.5) * aw;
    const rx = cx + Math.cos(ba - 0.5) * aw;
    const ry = cy + Math.sin(ba - 0.5) * aw;

    /* arrow glow */
    g.fillStyle(0x44ddff, 0.12);
    g.fillTriangle(
      cx + Math.cos(a) * (al + 4),
      cy + Math.sin(a) * (al + 4),
      cx + Math.cos(ba + 0.55) * (aw + 3),
      cy + Math.sin(ba + 0.55) * (aw + 3),
      cx + Math.cos(ba - 0.55) * (aw + 3),
      cy + Math.sin(ba - 0.55) * (aw + 3),
    );
    /* arrow body */
    g.fillStyle(0x44ddff, 0.9);
    g.fillTriangle(tipX, tipY, lx, ly, rx, ry);
  }

  resize(sz: Phaser.Structs.Size): void {
    this.updateOrigin(sz.width, sz.height);
  }

  private updateOrigin(width: number, height: number): void {
    if (this.isMobile) {
      this.originX = width - RADAR_M - RADAR_R;
      this.originY = RADAR_M + RADAR_R;
      return;
    }

    this.originX = RADAR_M + RADAR_R;
    this.originY = height - RADAR_M - RADAR_R;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
