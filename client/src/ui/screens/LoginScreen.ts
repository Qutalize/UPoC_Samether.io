import Phaser from "phaser";
import { login, register, getSession } from "../../storage/auth";
import { styledButton } from "../styledButton";

const SERIF = "'Times New Roman', 'Georgia', serif";

export class LoginScreen extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private errorText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private loginBtn!: Phaser.GameObjects.Text;
  private registerBtn!: Phaser.GameObjects.Text;
  private resizeHandler!: (size: Phaser.Structs.Size) => void;

  constructor() {
    super({ key: "LoginScreen" });
  }

  create(): void {
    const session = getSession();
    if (session) {
      this.scene.start("HomeScreen");
      return;
    }

    this.cameras.main.setBackgroundColor("#030a14");

    this.titleText = this.add.text(0, 0, "S A M E T H E R . I O", {
      fontFamily: SERIF,
      color: "#88ccee",
      letterSpacing: 10,
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(0, 0, "Sign in to dive", {
      fontFamily: SERIF,
      fontSize: "22px",
      color: "#88aacc",
      letterSpacing: 6,
    }).setOrigin(0.5);

    this.lineGfx = this.add.graphics();

    this.nameInput = this.createInput("login-name", "名前", 16, false);
    this.passwordInput = this.createInput("login-password", "パスワード", 32, true);

    this.errorText = this.add.text(0, 0, "", {
      fontFamily: SERIF,
      color: "#ff6666",
      align: "center",
    }).setOrigin(0.5);

    this.loginBtn = styledButton(this,"─  ログイン  ─", "24px", "#44ff88", "#88ffbb", 0x22aa55, 8);
    this.loginBtn.on("pointerdown", () => this.handleLogin());

    this.registerBtn = styledButton(this,"─  新規登録  ─", "18px", "#ffaa44", "#ffcc88", 0xaa7722, 6);
    this.registerBtn.on("pointerdown", () => this.handleRegister());

    this.layout(this.scale.width, this.scale.height);

    this.resizeHandler = (size: Phaser.Structs.Size) => {
      this.layout(size.width, size.height);
    };
    this.scale.on("resize", this.resizeHandler);

    this.nameInput.focus();
    this.passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleLogin();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.resizeHandler);
      this.nameInput.remove();
      this.passwordInput.remove();
    });
  }

  private layout(width: number, height: number): void {
    const s = Math.min(height / 600, 1);

    this.titleText
      .setPosition(width / 2, height * 0.15)
      .setFontSize(Math.round(42 * s));

    this.subtitleText
      .setPosition(width / 2, height * 0.24)
      .setFontSize(Math.round(14 * s));

    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineY = height * 0.30;
    this.lineGfx.clear();
    this.lineGfx.lineStyle(1, 0x225588, 0.4);
    this.lineGfx.beginPath();
    this.lineGfx.moveTo(lineX, lineY);
    this.lineGfx.lineTo(lineX + lineW, lineY);
    this.lineGfx.strokePath();

    this.updateInputLayout(this.nameInput, height * 0.42, s);
    this.updateInputLayout(this.passwordInput, height * 0.57, s);

    this.errorText
      .setPosition(width / 2, height * 0.68)
      .setFontSize(Math.round(13 * s));

    this.loginBtn
      .setPosition(width / 2, height * 0.78)
      .setFontSize(Math.round(24 * s));

    this.registerBtn
      .setPosition(width / 2, height * 0.90)
      .setFontSize(Math.round(18 * s));
  }

  private updateInputLayout(input: HTMLInputElement, topPx: number, scale: number): void {
    const fontSize = Math.round(16 * scale);
    const padding = Math.round(10 * scale);
    const inputW = Math.min(260, window.innerWidth * 0.7);

    Object.assign(input.style, {
      top: `${topPx}px`,
      fontSize: `${fontSize}px`,
      padding: `${padding}px 20px`,
      width: `${inputW}px`,
    } as CSSStyleDeclaration);
  }

  private createInput(
    id: string,
    placeholder: string,
    maxLength: number,
    isPassword = false,
  ): HTMLInputElement {
    const existing = document.getElementById(id) as HTMLInputElement | null;
    if (existing) existing.remove();

    const input = document.createElement("input");
    input.id = id;
    input.type = isPassword ? "password" : "text";
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    Object.assign(input.style, {
      position: "absolute",
      left: "50%",
      transform: "translate(-50%, -50%)",
      fontFamily: SERIF,
      borderRadius: "4px",
      border: "1px solid #225588",
      background: "rgba(3, 10, 20, 0.9)",
      color: "#88ccee",
      outline: "none",
      textAlign: "center",
      boxShadow: "0 0 12px rgba(34, 85, 136, 0.15)",
      transition: "border-color 0.2s, box-shadow 0.2s",
      letterSpacing: "2px",
    } as CSSStyleDeclaration);

    input.addEventListener("focus", () => {
      input.style.borderColor = "#44aaff";
      input.style.boxShadow = "0 0 16px rgba(34, 85, 136, 0.3)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#225588";
      input.style.boxShadow = "0 0 12px rgba(34, 85, 136, 0.15)";
    });

    document.body.appendChild(input);
    return input;
  }

  private async handleLogin(): Promise<void> {
    const name = this.nameInput.value.trim();
    const password = this.passwordInput.value;
    const result = await login(name, password);
    if (result.ok) {
      this.scene.start("HomeScreen");
    } else {
      this.errorText.setText(result.error ?? "ログインに失敗しました");
    }
  }

  private async handleRegister(): Promise<void> {
    const name = this.nameInput.value.trim();
    const password = this.passwordInput.value;
    const result = await register(name, password);
    if (result.ok) {
      this.scene.start("HomeScreen");
    } else {
      this.errorText.setText(result.error ?? "登録に失敗しました");
    }
  }
}
