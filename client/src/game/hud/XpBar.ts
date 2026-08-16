import Phaser from "phaser";
import type { HudComponent } from "./HudComponent";
import type { SharkRoute } from "../../network/protocol";

const STAGE_THRESHOLDS = [0, 10, 25, 50, 100];

const ROUTE_STAGE_NAMES: Record<SharkRoute, string[]> = {
  "attack": ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
  "non-attack": ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
  "deep-sea": ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
  "human": ["人間", "人間", "人間", "人間", "人間"], // Humans don't evolve
};

export class XpBar implements HudComponent {
  private gfx: Phaser.GameObjects.Graphics;
  private scoreText: Phaser.GameObjects.Text;
  private stageText: Phaser.GameObjects.Text;
  private cpText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    initialRoute: SharkRoute,
  ) {
    this.gfx = scene.add.graphics();
    container.add(this.gfx);

    const offsetX = 10; 
    const baseX = 28 + offsetX;

    this.scoreText = scene.add
      .text(baseX, 42, "", { // 28 から baseX に変更
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#aabbcc",
      });
    container.add(this.scoreText);

    this.stageText = scene.add
      .text(baseX, 20, ROUTE_STAGE_NAMES[initialRoute][0], { // 28 から baseX に変更
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#cce6ff",
      });
    container.add(this.stageText);

    this.cpText = scene.add
      .text(baseX, 138, "CP 0 / 100", { // 28 から baseX に変更
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: "#99bbcc",
      });
    container.add(this.cpText);
  }

  update(xp: number, stage: number, route: SharkRoute, cp: number, maxCp: number): void {
    const isMax = stage >= STAGE_THRESHOLDS.length - 1;
    const threshold = isMax
      ? STAGE_THRESHOLDS[STAGE_THRESHOLDS.length - 1]
      : STAGE_THRESHOLDS[stage + 1];

    this.drawBar(xp, threshold, cp, maxCp);
    this.scoreText.setText(isMax ? `${xp} XP` : `${xp} / ${threshold} XP`);
    const stageName = ROUTE_STAGE_NAMES[route][
      Math.min(stage, ROUTE_STAGE_NAMES[route].length - 1)
    ];
    this.stageText.setText(`${stageName} (Lv.${stage + 1})`);
    this.cpText.setText(`CP ${Math.max(0, Math.round(cp))} / ${maxCp}`);
  }

  private drawBar(xp: number, threshold: number, cp: number, maxCp: number): void {
    const g = this.gfx;
    g.clear();
    const W = 320;
    const H = 26;
    const offsetX = 10;
    const X = 28 + offsetX; 
    
    const Y = 68;
    const R = 6;
    const CP_Y = 108;

    /* dark background */
    g.fillStyle(0x080808, 0.85);
    g.fillRoundedRect(X, Y, W, H, R);
    g.lineStyle(1.5, 0x223344, 0.6);
    g.strokeRoundedRect(X, Y, W, H, R);

    const ratio = Math.min(xp / threshold, 1.0);
    if (ratio > 0) {
      const fw = (W - 4) * ratio;

      /* red fill base */
      g.fillStyle(0xaa2020, 1);
      g.fillRoundedRect(X + 2, Y + 2, fw, H - 4, R - 1);
      /* brighter highlight top half */
      g.fillStyle(0xdd4444, 0.55);
      g.fillRoundedRect(X + 2, Y + 2, fw, (H - 4) * 0.45, R - 1);
      /* gloss line */
      g.fillStyle(0xff5555, 0.22);
      g.fillRect(X + 4, Y + 3, Math.max(fw - 4, 0), 2);
      /* leading edge glow */
      if (fw > 6) {
        g.fillStyle(0xff6666, 0.25);
        g.fillRect(X + 2 + fw - 3, Y + 4, 3, H - 8);
      }
    }

    /* CP gauge */
    g.fillStyle(0x08131b, 0.8);
    g.fillRoundedRect(X, CP_Y, W, 16, 6);
    g.lineStyle(1.2, 0x20485a, 0.65);
    g.strokeRoundedRect(X, CP_Y, W, 16, 6);

    const cpRatio = Math.max(0, Math.min(cp / maxCp, 1));
    if (cpRatio > 0) {
      const cpW = (W - 4) * cpRatio;
      g.fillStyle(0x44ddff, 0.9);
      g.fillRoundedRect(X + 2, CP_Y + 2, cpW, 12, 5);
      g.fillStyle(0xa8f2ff, 0.35);
      g.fillRect(X + 4, CP_Y + 3, Math.max(cpW - 4, 0), 2);
    }
  }

  resize(_sz: Phaser.Structs.Size): void {
    /* XP bar is anchored top-left; no resize adjustment needed */
  }

  destroy(): void {
    this.gfx.destroy();
    this.scoreText.destroy();
    this.stageText.destroy();
    this.cpText.destroy();
  }
}
