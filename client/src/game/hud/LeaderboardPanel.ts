import Phaser from "phaser";
import type { HudComponent } from "./HudComponent";

export class LeaderboardPanel implements HudComponent {
  private gfx: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private scaleManager: Phaser.Scale.ScaleManager;

  constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
    this.scaleManager = scene.scale;

    this.gfx = scene.add.graphics();
    container.add(this.gfx);

    this.text = scene.add
      .text(scene.scale.width / 2, 16, "👑 Top Predator: ---", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "17px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0);
    container.add(this.text);

    this.drawPanel();
    scene.scale.on("resize", (sz: Phaser.Structs.Size) => this.resize(sz));
  }

  setLeader(topName: string, topScore: number): void {
    this.text.setText(`👑 Top Predator: ${topName} (${topScore})`);
  }

  private drawPanel(): void {
    const g = this.gfx;
    g.clear();
    const pw = 290;
    const ph = 34;
    const px = this.scaleManager.width / 2 - pw / 2;
    const py = 10;
    g.fillStyle(0x061520, 0.8);
    g.fillRoundedRect(px, py, pw, ph, 17);
    g.lineStyle(1.5, 0x225588, 0.6);
    g.strokeRoundedRect(px, py, pw, ph, 17);
  }

  resize(sz: Phaser.Structs.Size): void {
    this.text.setX(sz.width / 2);
    this.drawPanel();
  }

  destroy(): void {
    this.gfx.destroy();
    this.text.destroy();
  }
}
