import Phaser from "phaser";
import { SharkRoute } from "../../network/protocol";
import { TerritoryRenderer } from "./TerritoryRenderer";
import { getRouteColor } from "../config/RouteColors";

/* ── colours tuned to look like semi-transparent grey
      silhouettes against the dark ocean ──────────────────── */
const BODY_COLORS = [0x708898, 0x668090, 0x5c7488, 0x526880, 0x485c78];
const SIZE_SCALES = [1.55, 1.75, 1.90, 2.15, 2.45];

function resolveSharkTextureKey(stage: number, route: SharkRoute): string {
  if (route === "human") return "diver"; // Human uses diver sprite
  if (stage <= 1) return "shark_stage01";
  if (stage <= 3) {
    if (route === "attack")     return "shark_stage2_attack";
    if (route === "non-attack") return "shark_stage2_nonatk";
    return "shark_stage2_deep";
  }
  if (route === "attack")     return "shark_stage4_attack";
  if (route === "non-attack") return "shark_stage4_nonatk";
  return "shark_stage4_deep";
}

const SEGMENT_COUNT = 24;
const BASE_SPACING = 5.5;

export class Shark extends Phaser.GameObjects.Container {
  private rope: Phaser.GameObjects.Rope;
  private humanSprite?: Phaser.GameObjects.Sprite; // Simple sprite for human mode
  private nameText: Phaser.GameObjects.Text;
  private territoryRenderer: TerritoryRenderer;

  private stage = 0;
  private route: SharkRoute = "attack";
  private isSelf: boolean;
  private sharkName = "";
  private boosted = false;

  // For territory filtering
  private myLevel: number = 0;
  private myRoute: SharkRoute = "attack";

  /* backbone simulation */
  private spine: Phaser.Math.Vector2[] = [];
  private ropePts: Phaser.Math.Vector2[] = [];
  private targetX = 0;
  private targetY = 0;
  private targetAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, isSelf: boolean) {
    super(scene, x, y);
    this.isSelf = isSelf;
    this.targetX = x;
    this.targetY = y;

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.spine.push(new Phaser.Math.Vector2(x, y));
    }

    // Pre-allocate rope points array (reused every frame)
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.ropePts.push(new Phaser.Math.Vector2(i * BASE_SPACING, 0));
    }
    const initialPts = this.ropePts;

    this.territoryRenderer = new TerritoryRenderer(scene, -2);

    // horizontal = true maps texture width along the points
    this.rope = scene.add.rope(0, 0, "shark_stage01", undefined, initialPts, true);
    this.add(this.rope);

    this.nameText = scene.add
      .text(0, -50, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.add(this.nameText);

    this.updateColors();

    scene.add.existing(this as any);
  }

  private updateColors() {
    if (!this.rope) return;
    const texKey = resolveSharkTextureKey(this.stage, this.route);
    if (this.rope.texture.key !== texKey) {
      this.rope.setTexture(texKey);
    }
    // 1. Base tint (grey silhouette)
    const color = BODY_COLORS[this.stage] ?? BODY_COLORS[0];
    const tint = this.isSelf ? color : 0x5a7a8e;
    this.rope.setColors(tint);

    // 2. Route specific glow using Phaser's standard postFX
    const rope = this.rope as any; // Type assertion for Phaser 3.80 postFX API
    if (rope.postFX) {
      rope.postFX.clear();
      rope.postFX.setPadding(32);
      if (this.boosted) {
        // Bright yellow glow when speed boosted
        rope.postFX.addGlow(0xffdd00, 8, 2, false, 0.1, 16);
      } else {
        const glowColor = getRouteColor(this.route);
        rope.postFX.addGlow(glowColor, 4, 0, false, 0.1, 10);
      }
    }
  }

  /* slow powerful tail undulation */
  private waveAt(p: number, t: number, i: number): number {
    if (p < 0.4) return 0;
    const f = (p - 0.4) / 0.6;
    return Math.sin(t * 0.0035 - i * 0.25) * f * f * 10;
  }

  updateFromState(
    x: number,
    y: number,
    angle: number,
    stage: number,
    t: number,
    route: SharkRoute,
    name?: string,
    territories: Array<Array<{ x: number; y: number }>> = [],
    boosted = false,
  ): void {
    this.targetX = x;
    this.targetY = y;
    this.targetAngle = angle;

    if (name) {
      this.sharkName = name;
    }

    let changedAppearance = false;
    if (stage !== this.stage) {
      this.stage = stage;
      this.setScale(SIZE_SCALES[stage] ?? 1);
      changedAppearance = true;
    }

    if (name) {
      this.nameText.setText(this.sharkName);
    }
    
    if (route !== this.route) {
      this.route = route;
      changedAppearance = true;

      // Initialize human sprite if switching to human mode
      if (route === "human" && !this.humanSprite) {
        this.rope.setVisible(false);
        this.humanSprite = (this.scene as Phaser.Scene).add.sprite(0, 0, "diver");
        this.humanSprite.setScale(0.1); // 1/5 of original size (0.5 -> 0.1)
        this.humanSprite.setAlpha(0.9);
        this.humanSprite.setTint(0x708898);
        // Add glow effect like food diver
        if (this.humanSprite.postFX) {
          this.humanSprite.postFX.addGlow(0xccaa22, 4, 0, false, 0.1, 10);
        }
        this.add(this.humanSprite);
      } else if (route !== "human" && this.humanSprite) {
        this.humanSprite.destroy();
        this.humanSprite = undefined;
        this.rope.setVisible(true);
      }
    }

    if (boosted !== this.boosted) {
      this.boosted = boosted;
      changedAppearance = true;
    }

    if (changedAppearance && route !== "human") {
      this.updateColors();
    }

    // Human mode: simple sprite movement
    if (this.route === "human" && this.humanSprite) {
      this.setPosition(this.targetX, this.targetY);
      this.humanSprite.setRotation(angle);
    } else {
      // Shark mode: rope-based movement
      /* rigid head segments (hardly bend) */
      this.spine[0].set(x, y);
      for (let i = 1; i < 4; i++) {
        this.spine[i].set(
          this.spine[i - 1].x - Math.cos(angle) * BASE_SPACING,
          this.spine[i - 1].y - Math.sin(angle) * BASE_SPACING,
        );
      }

      /* trailing segments follow like a rope (inlined math for perf) */
      for (let i = 4; i < SEGMENT_COUNT; i++) {
        const prev = this.spine[i - 1];
        const curr = this.spine[i];
        const dx = prev.x - curr.x;
        const dy = prev.y - curr.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > BASE_SPACING) {
          const a = Math.atan2(prev.y - curr.y, prev.x - curr.x);
          curr.x = prev.x - Math.cos(a) * BASE_SPACING;
          curr.y = prev.y - Math.sin(a) * BASE_SPACING;
        }
      }

      /* compute display points (spine + wave offset) — reuse pre-allocated array */
      let pIdx = 0;
      for (let i = SEGMENT_COUNT - 1; i >= 0; i--) {
        const sp = this.spine[i];
        let sa = this.targetAngle;
        if (i > 0) {
          const dx = this.spine[i - 1].x - sp.x;
          const dy = this.spine[i - 1].y - sp.y;
          sa = Math.atan2(dy, dx);
        }

        const prog = i / (SEGMENT_COUNT - 1);
        const wave = this.waveAt(prog, t, i);
        const norm = sa + Math.PI / 2;

        this.ropePts[pIdx].x = sp.x + Math.cos(norm) * wave - this.targetX;
        this.ropePts[pIdx].y = sp.y + Math.sin(norm) * wave - this.targetY;
        pIdx++;
      }

      this.rope.setPoints(this.ropePts);

      this.setPosition(this.targetX, this.targetY);
    }

    // Determine if this territory should be shown and what color
    const isOwn = this.isSelf;
    const isSameRoute = this.route === this.myRoute;
    const isDangerous = !this.isSelf && !isSameRoute && this.stage > this.myLevel;

    this.territoryRenderer.render(territories, this.route, isOwn, isDangerous, isSameRoute);
  }

  /**
   * Set the current player's level and route for territory filtering
   */
  setMyLevel(level: number): void {
    this.myLevel = level;
  }

  setMyRoute(route: SharkRoute): void {
    this.myRoute = route;
  }

  override destroy(fromScene?: boolean): void {
    if (this.humanSprite) {
      this.humanSprite.destroy();
    }
    this.territoryRenderer.destroy();
    super.destroy(fromScene);
  }

  playEvolutionPulse(): void {
    const baseScale = SIZE_SCALES[this.stage] ?? 1;
    this.scene.tweens.add({
      targets: this,
      scaleX: baseScale * 1.35,
      scaleY: baseScale * 1.35,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.setScale(baseScale);
      },
    });
  }
}
