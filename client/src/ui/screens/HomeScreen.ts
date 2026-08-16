import Phaser from "phaser";
import { net } from "../../network/websocket";
import { SharkRoute } from "../../network/protocol";
import { loadDailyDistance } from "../../storage/cp";
import { getSession, logout } from "../../storage/auth";
import { styledButton } from "../styledButton";

const SERIF = "'Times New Roman', 'Georgia', serif";

export class HomeScreen extends Phaser.Scene {
  private playerName = "";
  private selectedRoute: SharkRoute = "attack";
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private cpText!: Phaser.GameObjects.Text;
  private playBtn!: Phaser.GameObjects.Text;
  private cpBtn!: Phaser.GameObjects.Text;
  private guideBtn!: Phaser.GameObjects.Text;
  private logoutBtn!: Phaser.GameObjects.Text;
  private routeButtons: Phaser.GameObjects.Text[] = [];
  private resizeHandler!: (size: Phaser.Structs.Size) => void;

  constructor() {
    super({ key: "HomeScreen" });
  }

  create(): void {
    const session = getSession();
    if (!session) {
      this.scene.start("LoginScreen");
      return;
    }
    this.playerName = session;

    this.cameras.main.setBackgroundColor("#030a14");

    this.titleText = this.add.text(0, 0, "S A M E T H E R . I O", {
      fontFamily: SERIF,
      fontSize: "52px",
      color: "#88ccee",
      letterSpacing: 10,
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(0, 0, `ようこそ、${this.playerName}`, {
      fontFamily: SERIF,
      fontSize: "24px",
      color: "#88aacc",
      letterSpacing: 6,
    }).setOrigin(0.5);

    this.lineGfx = this.add.graphics();

    this.createRouteButtons();

    this.cpText = this.add.text(0, 0, `本日の歩行距離: ${Math.round(loadDailyDistance())}m`, {
      fontFamily: SERIF,
      fontSize: "18px",
      color: "#6688aa",
    }).setOrigin(0.5);

    this.playBtn = styledButton(this,"─  P L A Y  ─", "28px", "#44ff88", "#88ffbb", 0x22aa55, 8);
    this.playBtn.on("pointerdown", () => this.tryStart());

    this.input.keyboard?.on("keydown-ENTER", () => this.tryStart());

    this.cpBtn = styledButton(this,"─  歩 行 記 録  ─", "22px", "#ffaa44", "#ffcc88", 0xaa7722, 6);
    this.cpBtn.on("pointerdown", () => this.scene.start("CPScreen"));

    this.guideBtn = styledButton(this,"─  ガイド  ─", "20px", "#6688aa", "#88bbdd", 0x446688, 6);
    this.guideBtn.on("pointerdown", () => this.scene.start("GuideScreen"));

    this.logoutBtn = styledButton(this,"─  ログアウト  ─", "18px", "#884444", "#ff6666", 0x882222, 4);
    this.logoutBtn.on("pointerdown", () => {
      logout();
      this.scene.start("LoginScreen");
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
    const isMobile = height < 500;
    this.titleText.setFontSize(isMobile ? "32px" : "52px");
    this.titleText.setPosition(width / 2, height * 0.22);
    this.subtitleText.setPosition(width / 2, height * 0.30);

    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineY = height * 0.34;
    this.lineGfx.clear();
    this.lineGfx.lineStyle(1, 0x225588, 0.4);
    this.lineGfx.beginPath();
    this.lineGfx.moveTo(lineX, lineY);
    this.lineGfx.lineTo(lineX + lineW, lineY);
    this.lineGfx.strokePath();

    this.layoutRouteButtons(width / 2, height * 0.48);
    this.cpText.setPosition(width / 2, height * 0.58).setText(`本日の歩行距離: ${Math.round(loadDailyDistance())}m`);
    this.playBtn.setPosition(width / 2, height * 0.65);
    this.cpBtn.setPosition(width / 2, height * 0.73);
    this.guideBtn.setPosition(width / 2, height * 0.81);
    this.logoutBtn.setPosition(width / 2, height * 0.89);
  }

  private createRouteButtons(): void {
    const routes: { id: SharkRoute; label: string; color: string }[] = [
      { id: "attack", label: "攻撃系\n(シュモクザメ)", color: "#ff6666" },
      { id: "non-attack", label: "非攻撃系\n(ドチザメ)", color: "#66ccff" },
      { id: "deep-sea", label: "深海魚系\n(コビトザメ)", color: "#bb66ff" },
      { id: "human", label: "？", color: "#ffcc88" },
    ];

    this.routeButtons = routes.map((route) =>
      this.add.text(0, 0, route.label, {
        fontFamily: SERIF,
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#0a1a2a",
        padding: { x: 12, y: 10 },
        align: "center",
        letterSpacing: 2,
      })
        .setResolution(window.devicePixelRatio || 1)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.selectedRoute = route.id;
          this.updateButtonStyles(this.routeButtons, routes);
        }),
    );

    this.updateButtonStyles(this.routeButtons, routes);
  }

  private layoutRouteButtons(centerX: number, y: number): void {
    const spacing = Math.min(140, this.scale.width * 0.24);
    this.routeButtons.forEach((btn, index) => {
      btn.setPosition(centerX + (index - 1.5) * spacing, y);
    });
  }

  private updateButtonStyles(buttons: Phaser.GameObjects.Text[], routes: { id: SharkRoute; color: string }[]): void {
    buttons.forEach((btn, index) => {
      const isSelected = this.selectedRoute === routes[index].id;
      btn.setStyle({
        backgroundColor: isSelected ? "#152535" : "#0a1a2a",
        color: isSelected ? routes[index].color : "#667788",
      });
      if (isSelected) {
        btn.setStroke(routes[index].color, 1);
      } else {
        btn.setStroke("#000000", 0);
      }
    });
  }

  private async tryStart(): Promise<void> {
    try {
      if (!net.isOpen()) await net.connect();
      net.send({ type: "join", payload: { name: this.playerName, route: this.selectedRoute, dailyDistance: loadDailyDistance() } });
      this.scene.start("GameScene", { name: this.playerName, route: this.selectedRoute });
    } catch (e) {
      console.error("connect failed", e);
    }
  }
}
