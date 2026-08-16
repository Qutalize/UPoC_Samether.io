import Phaser from "phaser";
import type { SharkRoute } from "../../network/protocol";
import { styledButton } from "../styledButton";
import type { GameScene } from "../../game/scenes/GameScene";

const ROUTE_STAGE_NAMES: Record<SharkRoute, string[]> = {
  "attack": ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
  "non-attack": ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
  "deep-sea": ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
  "human": ["人間", "人間", "人間", "人間", "人間"], // Humans don't evolve
};

export class DeathScreen extends Phaser.Scene {
  private score = 0;
  private stage = 0;
  private route: SharkRoute = "attack";
  private deathSound?: Phaser.Sound.BaseSound;
  private textBg!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private lineTop!: Phaser.GameObjects.Graphics;
  private lineBot!: Phaser.GameObjects.Graphics;
  private diedText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private returnBtn!: Phaser.GameObjects.Text;
  private resizeHandler!: (size: Phaser.Structs.Size) => void;

  constructor() {
    super({ key: "DeathScreen" });
  }

  preload(): void {
    this.load.audio("sfx_death", "audio/sfx_death.mp3");
  }

  init(data: { score: number; stage: number; route?: SharkRoute }): void {
    this.score = data.score;
    this.stage = data.stage;
    this.route = data.route ?? "attack";
  }

  create(): void {
    /* Stop BGM */
    const gameScene = this.scene.get("GameScene") as GameScene;
    if (gameScene && gameScene.stopBgm) {
      gameScene.stopBgm();
    }

    /* Schedule death sound effect */
    if (this.sound && this.cache.audio.exists("sfx_death")) {
      this.time.delayedCall(600, () => {
        this.deathSound = this.sound.add("sfx_death", { loop: false, volume: 1.0 });
        if (this.deathSound) {
          this.deathSound.play();
        }
      });
    }

    this.overlay = this.add.graphics();
    this.overlay.setAlpha(0);
    this.tweens.add({
      targets: this.overlay,
      alpha: 0.5,
      duration: 1200,
      ease: "Power2",
    });

    this.textBg = this.add.graphics();
    this.textBg.setAlpha(0);
    this.tweens.add({
      targets: this.textBg,
      alpha: 1,
      duration: 800,
      delay: 600,
      ease: "Power1",
    });

    this.lineTop = this.add.graphics();
    this.lineBot = this.add.graphics();
    this.lineTop.setAlpha(0);
    this.lineBot.setAlpha(0);

    this.tweens.add({
      targets: [this.lineTop, this.lineBot],
      alpha: 1,
      duration: 800,
      delay: 1000,
      ease: "Power1",
    });

    this.diedText = this.add.text(0, 0, "Y O U   D I E D", {
      fontFamily: "'Times New Roman', 'Georgia', serif",
      fontSize: "80px",
      fontStyle: "400",
      color: "#c41e1e",
      letterSpacing: 12,
    })
      .setOrigin(0.5)
      .setAlpha(0);

    if (this.diedText.postFX) {
      this.diedText.postFX.addGlow(0x8b0000, 8, 0, false, 0.1, 16);
    }

    this.tweens.add({
      targets: this.diedText,
      alpha: 1,
      duration: 2000,
      delay: 600,
      ease: "Power2",
    });

    const stageIndex = Math.max(0, this.stage - 1);
    const names = ROUTE_STAGE_NAMES[this.route];
    const stageName = names[Math.min(stageIndex, names.length - 1)];

    this.infoText = this.add.text(0, 0, `${stageName}  ─  Score ${this.score}`, {
      fontFamily: "'Times New Roman', 'Georgia', serif",
      fontSize: "22px",
      color: "#aa8866",
      letterSpacing: 4,
    })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: this.infoText,
      alpha: 1,
      duration: 1200,
      delay: 2400,
      ease: "Power1",
    });

    this.returnBtn = styledButton(this, "─  ホームへ戻る  ─", "20px", "#665544", "#ccaa88", 0x665544, 6);
    this.returnBtn.setAlpha(0).on("pointerdown", () => {
      this.scene.stop("GameScene");
      this.scene.start("HomeScreen");
    });

    this.tweens.add({
      targets: this.returnBtn,
      alpha: 1,
      duration: 800,
      delay: 3200,
      ease: "Power1",
    });

    this.layout(this.scale.width, this.scale.height);

    this.resizeHandler = (size: Phaser.Structs.Size) => {
      this.layout(size.width, size.height);
    };
    this.scale.on("resize", this.resizeHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.resizeHandler);
    });
  }

  private layout(width: number, height: number): void {
    this.overlay.clear();
    this.overlay.fillStyle(0x000000, 0.5);
    this.overlay.fillRect(0, 0, width, height);

    const lineY1 = height * 0.42;
    const lineY2 = height * 0.58;
    const lineW = width * 0.6;
    const lineX = (width - lineW) / 2;

    this.lineTop.clear();
    this.lineTop.lineStyle(1, 0x8b0000, 0.6);
    this.lineTop.beginPath();
    this.lineTop.moveTo(lineX, lineY1);
    this.lineTop.lineTo(lineX + lineW, lineY1);
    this.lineTop.strokePath();

    this.lineBot.clear();
    this.lineBot.lineStyle(1, 0x8b0000, 0.6);
    this.lineBot.beginPath();
    this.lineBot.moveTo(lineX, lineY2);
    this.lineBot.lineTo(lineX + lineW, lineY2);
    this.lineBot.strokePath();

    const textBandTop = Math.max(0, lineY1 - 70);
    const textBandBottom = Math.min(height, height * 0.86);
    this.textBg.clear();
    this.textBg.fillStyle(0x000000, 0.85);
    this.textBg.fillRect(0, textBandTop, width, textBandBottom - textBandTop);

    this.diedText.setPosition(width / 2, height * 0.5);
    this.infoText.setPosition(width / 2, height * 0.65);
    this.returnBtn.setPosition(width / 2, height * 0.82);
  }
}
