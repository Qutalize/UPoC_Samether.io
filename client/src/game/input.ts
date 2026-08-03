import Phaser from "phaser";
 
export class InputController {
  private scene: Phaser.Scene;
  private dashBtn!: Phaser.GameObjects.Container;
  private dashPressed = false;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private bgCircle!: Phaser.GameObjects.Arc;
  private outerRing!: Phaser.GameObjects.Arc;
  private labelText!: Phaser.GameObjects.Text;

  /* CP (stamina) constants */
  private static readonly CP_MAX = 100;
  private static readonly CP_RECOVER_RATE = 10; // units per second
  private static readonly CP_CONSUME_RATE = 50; // units per second

  /* タップダッシュ定数 */
  private static readonly TAP_THRESHOLD_MS = 200;    // この時間以内の入力をタップと判定
  private static readonly TAP_DASH_DURATION_MS = 300; // タップ後にダッシュを維持する時間

  /* CP state */
  private cp = InputController.CP_MAX;
  private isCpEmpty = false;
  private isExhausted = false;

  /* タップダッシュ状態 */
  /** ポインターが押下された時刻（ミリ秒）。タップ判定に使用。 */
  private pointerDownTime = 0;
  /** タップダッシュが有効な期限タイムスタンプ（ミリ秒）。この時刻までダッシュを維持する。 */
  private tapDashUntil = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (this.scene.input.keyboard) {
      this.spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }
    this.buildDashButton();
  }

  private buildDashButton(): void {
    const { width, height } = this.scene.scale;
    const c = this.scene.add.container(width - 76, height - 76);
    c.setScrollFactor(0);
    c.setDepth(1000);

    /* outer glow ring */
    const glow = this.scene.add.circle(0, 0, 58, 0x1a3848, 0.12);

    /* thick outer ring (metallic) */
    this.outerRing = this.scene.add.circle(0, 0, 54, 0x15242e, 0.55);
    this.outerRing.setStrokeStyle(5, 0x8aaaba, 0.85);

    /* inner circle */
    this.bgCircle = this.scene.add.circle(0, 0, 44, 0x0c1a24, 0.85);
    this.bgCircle.setStrokeStyle(1.5, 0x3a5868, 0.45);

    /* text label */
    this.labelText = this.scene.add.text(0, 0, "DASH\n[SPACE]", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#99bbcc",
      align: "center",
    });
    this.labelText.setOrigin(0.5);

    c.add([glow, this.outerRing, this.bgCircle, this.labelText]);
    c.setSize(104, 104);
    c.setInteractive(
      new Phaser.Geom.Circle(0, 0, 54),
      Phaser.Geom.Circle.Contains,
    );

    c.on("pointerdown", () => {
      this.pointerDownTime = Date.now();
      this.dashPressed = true;
      this.updateVisualState();
    });
    const resetStyle = () => {
      const heldMs = Date.now() - this.pointerDownTime;
      this.pointerDownTime = 0;
      if (heldMs < InputController.TAP_THRESHOLD_MS) {
        // タップ（短い押下）と判定 → ダッシュをTAP_DASH_DURATION_MS継続
        this.tapDashUntil = Date.now() + InputController.TAP_DASH_DURATION_MS;
      }
      this.dashPressed = false;
      this.updateVisualState();
    };
    c.on("pointerup", resetStyle);
    c.on("pointerout", resetStyle);

    this.scene.scale.on("resize", (size: Phaser.Structs.Size) => {
      c.setPosition(size.width - 76, size.height - 76);
    });

    this.dashBtn = c;
  }

  private updateVisualState(): void {
    const inputActive = this.isDashInputActive();
    const active = inputActive && !this.isExhausted && !this.isCpEmpty;

    if (active) {
      this.bgCircle.setFillStyle(0x1a3848, 0.95);
      this.outerRing.setStrokeStyle(5, 0x88bbcc, 1);
      this.labelText.setColor("#cceeff");
    } else if (this.isCpEmpty || this.isExhausted) {
      this.bgCircle.setFillStyle(0x050a0e, 0.85);
      this.outerRing.setStrokeStyle(5, 0x4a5a6a, 0.85);
      this.labelText.setColor("#556677");
    } else {
      this.bgCircle.setFillStyle(0x0c1a24, 0.85);
      this.outerRing.setStrokeStyle(5, 0x8aaaba, 0.85);
      this.labelText.setColor("#99bbcc");
    }
  }

  private isDashInputActive(): boolean {
    const tapActive = Date.now() < this.tapDashUntil;
    return this.dashPressed || tapActive || (this.spaceKey && this.spaceKey.isDown);
  }

  /** Returns the visual dash button container so it can be added to the UI layer */
  getContainer(): Phaser.GameObjects.Container {
    return this.dashBtn;
  }

  /** Angle (radians) from screen centre to pointer. */
  pointerAngle(): number {
    const p = this.scene.input.activePointer;
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    return Math.atan2(p.y - cy, p.x - cx);
  }

  /** Returns true if dash is requested and CP is available. */
  isDashDown(): boolean {
    return this.isDashInputActive() && !this.isExhausted && !this.isCpEmpty;
  }

  /**
   * Advance CP (stamina) state for one frame.
   * Must be called once per frame from GameScene.update().
   */
  update(delta: number): void {
    const inputActive = this.isDashInputActive();

    // Derive isCpEmpty from the current cp value before state transitions
    this.isCpEmpty = this.cp <= 0;

    // Clear exhausted state as soon as the input is released
    if (!inputActive) {
      this.isExhausted = false;
    }

    // Latch exhausted when CP runs completely empty
    if (this.isCpEmpty) {
      this.isExhausted = true;
    }

    const effectivelyDashing = this.isDashDown();

    if (effectivelyDashing) {
      this.cp = Math.max(0, this.cp - InputController.CP_CONSUME_RATE * (delta / 1000));
    } else {
      this.cp = Math.min(InputController.CP_MAX, this.cp + InputController.CP_RECOVER_RATE * (delta / 1000));
    }

    this.updateVisualState();
  }
}

