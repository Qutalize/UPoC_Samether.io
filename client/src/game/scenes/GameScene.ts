import Phaser from "phaser";
import { net } from "../../network/websocket";
import type {
  ServerMsg,
  StatePayload,
  WelcomePayload,
  DeathPayload,
  LeaderboardPayload,
  SharkRoute,
} from "../../network/protocol";
import { Shark } from "../objects/Shark";
import { Food } from "../objects/Food";
import { OceanBackgroundShader } from "../objects/BackgroundShader";
import { SharkPipeline } from "../objects/SharkShader";
import { InputController } from "../input";
import { RadarRenderer } from "../hud/RadarRenderer";
import { XpBar } from "../hud/XpBar";
import { LeaderboardPanel } from "../hud/LeaderboardPanel";
import { GameState } from "../state/GameState";
import { TerritoryManager } from "../territory/TerritoryManager";
import { SuctionEffect } from "../effects/SuctionEffect";
import { getRouteColor } from "../config/RouteColors";

/* ── constants ─────────────────────────────────────────────── */
const STAGE_ZOOMS = [1.0, 0.92, 0.84, 0.76, 0.68];

const ENABLE_TRAIL_ON_HOLD = true;
const TRAIL_POINT_SPACING = 12;
const TRAIL_MAX_POINTS = 120;

const TAU = Math.PI * 2;

/* seeded hash for ocean floor noise */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

/* ═══════════════════════════════════════════════════════════ */
export class GameScene extends Phaser.Scene {
  /* world */
  private worldW = 4000;
  private worldH = 4000;
  private myId = "";
  private myName = "";
  private myRoute: SharkRoute = "attack";
  private myStage = -1;

  /* entity state manager */
  private gameState!: GameState;

  /* input */
  private isMobile = false;
  private isDead = false;
  private joystickAngle = 0;
  private isDashBtnDown = false;
  private isTerritoryBtnDown = false;
  private joystickPointerId = -1;
  private dashPointerId = -1;
  private territoryPointerId = -1;
  private joystickBase!: Phaser.GameObjects.Graphics;
  private joystickThumb!: Phaser.GameObjects.Graphics;
  private dashMobileBtn!: Phaser.GameObjects.Container;
  private territoryMobileBtn!: Phaser.GameObjects.Container;
  private joystickTouchZone!: Phaser.GameObjects.Zone;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private joystickRadius = 56;
  private input2?: InputController;

  /* layers */
  private bgContainer!: Phaser.GameObjects.Container;
  private worldContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

  /* background layers */
  private worldBorder!: Phaser.GameObjects.Graphics;
  // private oceanFloor!: Phaser.GameObjects.TileSprite;

  /* HUD components */
  private xpBar!: XpBar;
  private leaderboardPanel!: LeaderboardPanel;
  private radarRenderer!: RadarRenderer;

  /* territory system */
  private territoryManager!: TerritoryManager;

  private trailGraphics!: Phaser.GameObjects.Graphics;
  private pointerTrail: Phaser.Math.Vector2[] = [];
  private _radarSharkBuf: { id: string; x: number; y: number }[] = [];
  private _radarFoodBuf: { x: number; y: number }[] = [];


  /* special effects */
  private suctionEffect!: SuctionEffect;
  private isWhaleShark = false; // 自分がジンベエザメか

  /* atmosphere */
  private bgShader!: Phaser.GameObjects.Shader;
  private vignetteOverlay!: Phaser.GameObjects.Image;

  /* audio */
  private bgm?: Phaser.Sound.BaseSound;
  private prevXp = 0;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private serverMessageHandler = (m: ServerMsg) => this.handleServer(m);
  private resizeHandler?: (size: Phaser.Structs.Size) => void;
  private addedPointers = false;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { name: string; route: SharkRoute }): void {
    this.isDead = false;
    this.joystickPointerId = -1;
    this.dashPointerId = -1;
    this.territoryPointerId = -1;
    this.isDashBtnDown = false;
    this.isTerritoryBtnDown = false;
    this.joystickAngle = 0;
    this.myId = "";
    this.myStage = -1;
    this.isWhaleShark = false;
    this.prevXp = 0;
    this.pointerTrail = [];
    this.spaceKey = undefined;
    this.myName = data.name;
    this.myRoute = data.route;
  }

  private isTouchDevice(): boolean {
    const nav = globalThis.navigator;
    return !this.sys.game.device.os.desktop || (nav?.maxTouchPoints ?? 0) > 0;
  }

  preload(): void {
    this.load.image("shark",           "images/shark.png");
    this.load.image("shark_mako",      "images/shark_mako.png");
    this.load.image("shark_sandtiger", "images/shark_sandtiger.png");
    this.load.image("shark_frilled",   "images/shark_frilled.png");
    this.load.image("shark_megalodon", "images/shark_megalodon.png");
    this.load.image("shark_whale",     "images/shark_whale.png");
    this.load.image("shark_greenland", "images/shark_greenland.png");
    this.load.image("diver",           "images/diver.png");
    this.load.audio("bgm", "audio/bgm.mp3");
    this.load.audio("sfx_xp_gain", "audio/sfx_xp_gain.mp3");
    this.load.audio("sfx_levelup", "audio/sfx_levelup.mp3");
    this.load.audio("human_scream", "audio/human_scream.mp3");
    if (!this.cache.shader.has("OceanBackground")) {
      this.cache.shader.add("OceanBackground", OceanBackgroundShader);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  /*  CREATE                                                  */
  /* ════════════════════════════════════════════════════════ */
  create(): void {
    this.isMobile = !this.sys.game.device.os.desktop && this.isTouchDevice();

    // ★マルチタッチを明示的に有効化（デフォルト2本 + 追加2本 = 最大4本）
    if (!this.addedPointers) {
      this.input.addPointer(2);
      this.addedPointers = true;
    }

    // Register custom shader pipeline for Phaser 3.80
    const renderer = this.renderer as any;
    if (renderer.pipelines && !renderer.pipelines.get("SharkShader")) {
      const pipelineInstance = new SharkPipeline(this.game);
      renderer.pipelines.add("SharkShader", pipelineInstance);
    }

    this.cameras.main.setBackgroundColor("#001b44");
    this.ensureTextures();
    this.createSharkTexture();

    /* Layers setup */
    this.bgContainer = this.add.container(0, 0).setDepth(-1000);
    this.worldContainer = this.add.container(0, 0);
    this.uiContainer = this.add.container(0, 0).setDepth(1000);
    this.worldContainer.setVisible(false);

    /* Background Shader */
    this.bgShader = this.add.shader("OceanBackground", this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height);
    this.bgShader.setScrollFactor(0);
    this.bgShader.setUniform('uScroll.value', { x: 0, y: 0 });
    this.bgContainer.add(this.bgShader);

    /* world boundary */
    this.worldBorder = this.add.graphics().setDepth(0);
    this.drawWorldBorder();
    this.worldContainer.add(this.worldBorder);

    this.trailGraphics = this.add.graphics().setDepth(-1);
    this.worldContainer.add(this.trailGraphics);


    /* special effects */
    this.suctionEffect = new SuctionEffect(this);

    /* Vignette overlay – added first so it renders behind all UI elements */
    const vignetteKey = this.myRoute === "deep-sea" ? "vignette_deepsea" : "vignette_default";
    this.vignetteOverlay = this.add.image(this.scale.width / 2, this.scale.height / 2, vignetteKey);
    const maxDim = Math.max(this.scale.width, this.scale.height);
    this.vignetteOverlay.setDisplaySize(maxDim * 1.5, maxDim * 1.5);
    this.uiContainer.add(this.vignetteOverlay);

    /* input controller */
    if (this.isMobile) {
      this.createMobileUI();
    } else {
      this.input2 = new InputController(this);
      this.uiContainer.add(this.input2.getContainer());
    }

    /* ── HUD ────────────────── */
    this.xpBar = new XpBar(this, this.uiContainer, this.myRoute);
    this.leaderboardPanel = new LeaderboardPanel(this, this.uiContainer);
    this.radarRenderer = new RadarRenderer(this, this.uiContainer);

    /* ── Territory System ────────────────── */
    this.territoryManager = new TerritoryManager(this, this.myRoute);
    // Will be initialized with player ID and level in onWelcome

    /* Camera setup: Main camera ignores UI, UI camera ignores World */
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.cameras.main.ignore(this.uiContainer);
    this.uiCamera.ignore(this.worldContainer);
    this.uiCamera.ignore(this.bgContainer);

    /* resize */
    this.resizeHandler = (sz: Phaser.Structs.Size) => {
      this.uiCamera.setSize(sz.width, sz.height);
      if (this.bgShader) {
        this.bgShader.setSize(sz.width, sz.height);
        this.bgShader.setPosition(sz.width / 2, sz.height / 2);
      }
      if (this.vignetteOverlay) {
        this.vignetteOverlay.setPosition(sz.width / 2, sz.height / 2);
        const md = Math.max(sz.width, sz.height);
        this.vignetteOverlay.setDisplaySize(md * 1.5, md * 1.5);
      }
      if (this.isMobile) {
        this.layoutMobileUI(sz.width, sz.height);
      }
    };
    this.scale.on("resize", this.resizeHandler);

    /* entity state manager – wires new Phaser objects into worldContainer */
    this.gameState = new GameState(
      this,
      this.myId,
      this.myRoute,
      (shark: Shark) => this.worldContainer.add(shark),
      (food: Food) => this.worldContainer.add(food),
    );

    /* network */
    net.onMessage(this.serverMessageHandler);
    if (!this.spaceKey) {
      this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => this.sendInput(),
    });

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    /* audio */
    if (this.sound && this.cache.audio.exists("bgm")) {
      this.bgm = this.sound.add("bgm", { loop: true, volume: 1.0 });
      if (this.bgm) {
        this.bgm.play();
      }
    }
  }

  /* ════════════════════════════════════════════════════════ */
  /*  UPDATE (every frame)                                    */
  /* ════════════════════════════════════════════════════════ */
  update(time: number, delta: number): void {
    if (this.bgShader) {
      const cam = this.cameras.main;
      this.bgShader.setScale(1 / cam.zoom);
      const centerX = cam.scrollX + (cam.width / 2) / cam.zoom;
      const centerY = cam.scrollY + (cam.height / 2) / cam.zoom;
      this.bgShader.setUniform('uScroll.value.x', centerX * 0.0005);
      this.bgShader.setUniform('uScroll.value.y', centerY * 0.0005);
    }

    /* animate food glow (only visible foods) */
    const cam = this.cameras.main;
    const cullL = cam.scrollX - 50;
    const cullR = cam.scrollX + cam.width / cam.zoom + 50;
    const cullT = cam.scrollY - 50;
    const cullB = cam.scrollY + cam.height / cam.zoom + 50;
    for (const f of this.gameState.getFoods().values()) {
      if (f.x >= cullL && f.x <= cullR && f.y >= cullT && f.y <= cullB) {
        f.tickAnim(time);
      }
    }


    /* radar sweep rotation */
    this.radarRenderer.tick(delta);

    if (this.input2) {
      this.input2.update(delta);
    }

    /* update territory rendering */
    if (this.territoryManager) {
      this.territoryManager.update();

      // Check if player is in danger
      const self = this.gameState.getSharks().get(this.myId);
      if (self) {
        this.territoryManager.checkDanger(self.x, self.y);
      }
    }

    this.updateTrail();
  }

  /* ════════════════════════════════════════════════════════ */
  /*  PROCEDURAL TEXTURES                                     */
  /* ════════════════════════════════════════════════════════ */
  private ensureTextures(): void {
    if (!this.textures.exists("ocean_floor")) this.genOceanFloor();
    this.createFoodTextures();
    this.createVignetteTexture("vignette_default", 0.05, 0.25);
    this.createVignetteTexture("vignette_deepsea", 0.15, 0.45);
  }

  private createVignetteTexture(key: string, innerRatio: number, outerRatio: number): void {
    if (this.textures.exists(key)) return;
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, size * innerRatio, cx, cy, size * outerRatio);
    grad.addColorStop(0, "rgba(0, 0, 0, 0)");
    grad.addColorStop(0.5, "rgba(0, 5, 15, 0.95)");
    grad.addColorStop(1, "rgba(0, 2, 5, 1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    this.textures.addCanvas(key, canvas);
  }

  /**
   * 視界の広さを変更するメソッド。
   * 例: this.setVisionRange(0.15, 0.4, "vignette_deepsea")
   */
  public setVisionRange(innerRatio: number, outerRatio: number, textureKey = "vignette_default"): void {
    this.createVignetteTexture(textureKey, innerRatio, outerRatio);
    if (this.vignetteOverlay?.active) {
      this.vignetteOverlay.setTexture(textureKey);
    }
  }

  /**
   * Stop background music.
   * Called by DeathScreen when player dies.
   */
  public stopBgm(): void {
    if (this.bgm && this.bgm.isPlaying) {
      this.bgm.stop();
    }
  }

  private createFoodTextures(): void {
    if (this.textures.exists("food_green")) return;

    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(85, 255, 170, 0.25)";
    ctx.beginPath(); ctx.arc(8, 8, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(85, 255, 170, 0.9)";
    ctx.beginPath(); ctx.arc(8, 8, 4, 0, Math.PI * 2); ctx.fill();
    this.textures.addCanvas("food_green", canvas);

    const canvasRed = document.createElement("canvas");
    canvasRed.width = size;
    canvasRed.height = size;
    const ctxRed = canvasRed.getContext("2d")!;
    ctxRed.clearRect(0, 0, size, size);
    ctxRed.fillStyle = "rgba(255, 85, 85, 0.25)";
    ctxRed.beginPath(); ctxRed.arc(8, 8, 8, 0, Math.PI * 2); ctxRed.fill();
    ctxRed.fillStyle = "rgba(255, 85, 85, 0.9)";
    ctxRed.beginPath(); ctxRed.arc(8, 8, 4, 0, Math.PI * 2); ctxRed.fill();
    this.textures.addCanvas("food_red", canvasRed);
  }

  private createSharkTexture(): void {
    const SHARK_DEFS: Array<{ srcKey: string; outKey: string }> = [
      { srcKey: "shark",           outKey: "shark_stage01" },
      { srcKey: "shark_mako",      outKey: "shark_stage2_attack" },
      { srcKey: "shark_sandtiger", outKey: "shark_stage2_nonatk" },
      { srcKey: "shark_frilled",   outKey: "shark_stage2_deep" },
      { srcKey: "shark_megalodon", outKey: "shark_stage4_attack" },
      { srcKey: "shark_whale",     outKey: "shark_stage4_nonatk" },
      { srcKey: "shark_greenland", outKey: "shark_stage4_deep" },
    ];

    for (const { srcKey, outKey } of SHARK_DEFS) {
      if (this.textures.exists(outKey)) continue;
      const srcFrame = this.textures.get(srcKey).get();
      const srcWidth = srcFrame.width;
      const srcHeight = srcFrame.height;
      if (!srcWidth || !srcHeight) continue;

      const canvas = document.createElement("canvas");
      canvas.width = 130;
      canvas.height = 71;
      const ctx = canvas.getContext("2d")!;
      
      // Calculate aspect-fit scaling to normalize different image sizes into 130x71
      const scale = Math.min(130 / srcWidth, 71 / srcHeight);
      const dw = srcWidth * scale;
      const dh = srcHeight * scale;
      const dx = (130 - dw) / 2;
      const dy = (71 - dh) / 2;

      ctx.drawImage(srcFrame.source.image as HTMLImageElement, dx, dy, dw, dh);
      const imgData = ctx.getImageData(0, 0, 130, 71);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      this.textures.addCanvas(outKey, canvas);
    }
  }

  /** Subtle dark ocean floor with low-frequency noise */
  private genOceanFloor(): void {
    const S = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(S, S);
    const d = img.data;

    const f = (n: number) => (n * TAU) / S;

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n =
          Math.sin(x * f(2)) * Math.cos(y * f(3)) * 0.3 +
          Math.sin(x * f(1) + y * f(2)) * 0.2 +
          hash(x * 137 + y * 311) * 0.12;
        const base = 16 + n * 8;

        const i = (y * S + x) * 4;
        d[i] = base * 0.2;
        d[i + 1] = base * 0.5;
        d[i + 2] = base;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas("ocean_floor", canvas);
  }

  /* ════════════════════════════════════════════════════════ */
  /*  TRAIL                                                   */
  /* ════════════════════════════════════════════════════════ */
  private updateTrail(): void {
    const isDrawing = this.isMobile ? this.isTerritoryBtnDown : this.input.activePointer.isDown;
    if (!ENABLE_TRAIL_ON_HOLD || !isDrawing) {
      this.clearTrail();
      return;
    }

    const self = this.gameState.getSharks().get(this.myId);
    if (!self) {
      this.clearTrail();
      return;
    }

    const position = new Phaser.Math.Vector2(self.x, self.y);
    const last = this.pointerTrail[this.pointerTrail.length - 1];
    if (!last || Phaser.Math.Distance.BetweenPoints(last, position) >= TRAIL_POINT_SPACING) {
      this.pointerTrail.push(position.clone());
      if (this.pointerTrail.length > TRAIL_MAX_POINTS) {
        this.pointerTrail.shift();
      }
    }

    this.renderTrail(self);
  }

  private renderTrail(self: Shark): void {
    this.trailGraphics.clear();
    if (this.pointerTrail.length < 2) {
      return;
    }

    const routeColor = getRouteColor(this.myRoute);

    this.trailGraphics.lineStyle(4, routeColor, 0.6);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(this.pointerTrail[0].x, this.pointerTrail[0].y);
    for (let i = 1; i < this.pointerTrail.length; i++) {
      this.trailGraphics.lineTo(this.pointerTrail[i].x, this.pointerTrail[i].y);
    }
    this.trailGraphics.strokePath();
  }

  private clearTrail(): void {
    if (this.pointerTrail.length === 0) {
      return;
    }
    this.pointerTrail.length = 0;
    this.trailGraphics.clear();
  }

  /* ════════════════════════════════════════════════════════ */
  /*  WORLD BORDER                                            */
  /* ════════════════════════════════════════════════════════ */

  private drawWorldBorder(): void {
    this.worldBorder.clear();
    this.worldBorder.lineStyle(8, 0xff0000, 1.0);
    this.worldBorder.strokeRect(0, 0, this.worldW, this.worldH);
    this.worldBorder.lineStyle(2, 0xff5555, 0.5);
    this.worldBorder.strokeRect(4, 4, this.worldW - 8, this.worldH - 8);
  }

  /* ════════════════════════════════════════════════════════ */
  /*  NETWORK                                                 */
  /* ════════════════════════════════════════════════════════ */
  private sendInput(): void {
    if (!net.isOpen()) return;

    let angle = 0;
    let dash = false;
    let draw = false;
    let move = true;

    if (this.isMobile) {
      // モバイル用の操作（ジョイスティックと専用ボタン）
      move = this.joystickPointerId !== -1;
      angle = move ? this.joystickAngle : 0;
      dash = this.isDashBtnDown;
      draw = this.isTerritoryBtnDown;
    } else {
      // PC用の操作（カーソル方向、スペースキー、マウスクリック長押し）
      angle = this.input2 ? this.input2.pointerAngle() : 0;

      dash = this.spaceKey ? this.spaceKey.isDown : false;

      draw = this.input.activePointer.isDown;
      move = true;
    }

    net.send({ type: "input", payload: { angle, dash, draw, move } });
  }

  private getPointerId(pointer: Phaser.Input.Pointer): number {
    const anyPointer = pointer as Phaser.Input.Pointer & { id?: number; pointerId?: number };
    return anyPointer.id ?? anyPointer.pointerId ?? -1;
  }

  private handleServer(m: ServerMsg): void {
    if (this.isDead) return;

    switch (m.type) {
      case "welcome":
        this.onWelcome(m.payload);
        break;
      case "state":
        this.onState(m.payload);
        break;
      case "death":
        this.onDeath(m.payload);
        break;
      case "leaderboard":
        this.onLeaderboard(m.payload);
        break;
      default:
        // Forward territory-related messages to TerritoryManager
        if (this.territoryManager) {
          this.territoryManager.handleMessage(m);
        }
        break;
    }
  }

  private onWelcome(m: WelcomePayload): void {
    this.myId = m.playerId;
    this.gameState.setMyId(m.playerId);
    this.worldW = m.worldW;
    this.worldH = m.worldH;
    this.drawWorldBorder();
    // this.oceanFloor.setSize(this.worldW, this.worldH);

    // Initialize territory manager with player info
    if (this.territoryManager) {
      this.territoryManager.init(m.playerId, 0); // Level 0 at start, will be updated
    }
  }

  private onState(m: StatePayload): void {
    if (this.worldContainer && !this.worldContainer.visible) {
      this.worldContainer.setVisible(true);
    }

    if (m.you && m.you.id) {
      this.myId = m.you.id;
      this.gameState.setMyId(m.you.id);
    }

    // Stage 4 Non-Attack になったらジンベエザメフラグを立てる
    if (m.you) {
      const newIsWhaleShark = m.you.stage === 4 && this.myRoute === "non-attack";
      const becameWhaleShark = !this.isWhaleShark && newIsWhaleShark;
      this.isWhaleShark = newIsWhaleShark;

      // ジンベエザメになった場合、餌消失を検出してエフェクト表示
      if (this.isWhaleShark && m.foods) {
        this.updateFoodWithEffect(m.foods);
      }
    }

    if (m.full) {
      this.gameState.applyFullState(m);
    } else {
      this.gameState.applyStateDelta(m);
    }

    if (m.you) {
      const previousStage = this.myStage;

      if (previousStage !== -1 && m.you.stage > previousStage) {
        if (this.sound && this.cache.audio.exists("sfx_levelup")) {
          this.sound.play("sfx_levelup", { volume: 1.0 });
        }
        this.cameras.main.flash(350, 255, 255, 255, false);
        const mySv = this.gameState.getSharks().get(this.myId);
        mySv?.playEvolutionPulse();
      }

      this.cameras.main.centerOn(m.you.x, m.you.y);
      const zoom = STAGE_ZOOMS[m.you.stage] ?? 1;
      if (this.cameras.main.zoom !== zoom) {
        this.cameras.main.setZoom(zoom);
      }

      /* update radar blips */
      const sharks = this.gameState.getSharks();

      // Find self in server data for angle
      let myAngle = 0;
      const allSharks = m.full ? m.sharks : m.updatedSharks;
      const mySelf = allSharks?.find(s => s.id === this.myId);
      if (mySelf) {
        myAngle = mySelf.angle;
      }

      this.radarRenderer.setBlips(
        this.myId,
        m.you.x,
        m.you.y,
        myAngle,
        this.myRoute,
        this.myRoute === "attack"
          ? Array.from(sharks.entries()).map(([id, sv]) => ({ id, x: sv.x, y: sv.y }))
          : [],
        Array.from(this.gameState.getFoods().values()).map((fv) => ({ x: fv.x, y: fv.y, isRed: fv.isRed })),
      );

      /* XP bar */
      if (m.you.xp > this.prevXp) {
        if (this.sound && this.cache.audio.exists("sfx_xp_gain")) {
          this.sound.play("sfx_xp_gain", { volume: 1.0 });
        }
        this.prevXp = m.you.xp;
      }
      this.xpBar.update(m.you.xp, m.you.stage, this.myRoute, m.you.cp ?? 0, m.you.maxCp ?? 100);

      /* Update territory manager and GameState when level changes */
      if (m.you.stage !== previousStage) {
        const newTerritoryLevel = m.you.stage + 1; // territory levels are 1-based (stage+1)
        if (this.territoryManager) {
          this.territoryManager.handleMessage({
            type: 'my_evolution',
            payload: {
              newLevel: newTerritoryLevel,
              recalculateTerritories: previousStage !== -1,
            },
          });
        }
        this.gameState.setMyLevel(m.you.stage);
        this.myStage = m.you.stage;
      }
    }
  }

  private createMobileUI(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.joystickTouchZone = this.add.zone(width * 0.5, 0, width * 0.5, height).setOrigin(0, 0);
    this.joystickTouchZone.setScrollFactor(0);
    this.joystickTouchZone.setDepth(1001);
    this.joystickTouchZone.setInteractive();

    this.joystickTouchZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.joystickPointerId = this.getPointerId(pointer);
      this.updateJoystickFromPointer(pointer.x, pointer.y);
    });
    this.joystickTouchZone.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.getPointerId(pointer) === this.joystickPointerId) {
        this.updateJoystickFromPointer(pointer.x, pointer.y);
      }
    });
    this.joystickTouchZone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.getPointerId(pointer) !== this.joystickPointerId) {
        return;
      }
      this.joystickPointerId = -1;
      this.joystickAngle = 0;
      this.drawJoystickThumb();
    });
    this.joystickTouchZone.on("pointerout", (pointer: Phaser.Input.Pointer) => {
      if (this.getPointerId(pointer) !== this.joystickPointerId) {
        return;
      }
      this.joystickPointerId = -1;
      this.joystickAngle = 0;
      this.drawJoystickThumb();
    });

    const buttonStyle = {
      fill: 0x0c1a24,
      fillAlpha: 0.86,
      stroke: 0x88bbcc,
      strokeAlpha: 0.65,
      textColor: "#dceeff",
    };

    const sizeScale = Phaser.Math.Clamp(Math.min(width, height) / 900, 0.8, 1.0);
    const mobileBtnRadius = Math.round(56 * 0.8 * sizeScale);
    this.dashMobileBtn = this.createMobileCircleButton(0, 0, mobileBtnRadius, "DASH", buttonStyle);
    this.dashMobileBtn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.dashPointerId = this.getPointerId(pointer);
      this.isDashBtnDown = true;
    });
    const resetDash = (pointer: Phaser.Input.Pointer) => {
      if (this.getPointerId(pointer) !== this.dashPointerId) {
        return;
      }
      this.dashPointerId = -1;
      this.isDashBtnDown = false;
    };
    this.dashMobileBtn.on("pointerup", resetDash);
    this.dashMobileBtn.on("pointerout", resetDash);

    this.territoryMobileBtn = this.createMobileCircleButton(0, 0, mobileBtnRadius, "TRAIL", buttonStyle);
    this.territoryMobileBtn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.territoryPointerId = this.getPointerId(pointer);
      this.isTerritoryBtnDown = true;
    });
    const resetTerritory = (pointer: Phaser.Input.Pointer) => {
      if (this.getPointerId(pointer) !== this.territoryPointerId) {
        return;
      }
      this.territoryPointerId = -1;
      this.isTerritoryBtnDown = false;
    };
    this.territoryMobileBtn.on("pointerup", resetTerritory);
    this.territoryMobileBtn.on("pointerout", resetTerritory);

    this.joystickBase = this.add.graphics();
    this.joystickThumb = this.add.graphics();

    this.uiContainer.add([this.dashMobileBtn, this.territoryMobileBtn, this.joystickBase, this.joystickThumb]);
    this.layoutMobileUI(width, height);
  }

  private createMobileCircleButton(
    x: number,
    y: number,
    radius: number,
    label: string,
    style: { fill: number; fillAlpha: number; stroke: number; strokeAlpha: number; textColor: string },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    container.setScrollFactor(0);
    container.setDepth(1001);

    const outerRadius = radius + 6;
    // ★ コンテナ内での正しい中心座標（幅と高さの半分）
    const cx = outerRadius;
    const cy = outerRadius;

    // 各描画オブジェクトの中心を cx, cy に配置
    const outer = this.add.circle(cx, cy, outerRadius, style.fill, 0.12).setOrigin(0.5);
    const circle = this.add.circle(cx, cy, radius, style.fill, style.fillAlpha).setOrigin(0.5);
    circle.setStrokeStyle(3, style.stroke, style.strokeAlpha);
    const text = this.add.text(cx, cy, label, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: style.textColor,
      align: "center",
    }).setOrigin(0.5);

    container.add([outer, circle, text]);
    // Container size matches outer circle bounds
    container.setSize(outerRadius * 2, outerRadius * 2);

    // Increase touch sensitivity by enlarging hit radius slightly beyond visible outer radius
    const hitRadius = Math.round(outerRadius * 1.2);
    // ヒットエリアの中心もコンテナ中央 (cx, cy) に合わせる
    
    const offsetx = 45;
    const offsety = 0;

    container.setInteractive({
      hitArea: new Phaser.Geom.Circle(cx + offsetx, cy + offsety, outerRadius),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });

    return container;
  }

  private layoutMobileUI(width: number, height: number): void {
    const buttonScale = Phaser.Math.Clamp(Math.min(width, height) / 900, 0.8, 1.0);
    // Increase left inset slightly so buttons don't appear to stick out on small screens
    const leftMargin = Math.max(64, Math.round(width * 0.06));
    // default positions: both on left, territory above dash
    let dashX = leftMargin;
    let territoryX = leftMargin;
    const territoryY = Math.round(height * 0.72);
    const dashY = Math.round(height * 0.88)-100;
    const joystickX = width - Math.round(118 * buttonScale);
    const joystickY = height - Math.round(118 * buttonScale);

    // Determine actual button rendered diameter (container width)
    const dashBtnW = this.dashMobileBtn?.width ?? Math.round((56 * 0.8 * buttonScale + 6) * 2);
    const territoryBtnW = this.territoryMobileBtn?.width ?? dashBtnW;
    const btnDiameter = Math.max(dashBtnW, territoryBtnW);

    // Ensure vertical gap between buttons; if insufficient, place territory to the right of dash
    const desiredGap = btnDiameter + 12;
    if (dashY - territoryY < desiredGap) {
      // place territory to right of dash
      const tentativeX = leftMargin + btnDiameter + 12;
      const rightLimit = Math.max(leftMargin + btnDiameter + 12, joystickX - 20);
      territoryX = tentativeX;
      if (territoryX + btnDiameter > rightLimit) {
        // fallback: clamp so it doesn't overlap joystick
        territoryX = Math.max(leftMargin, rightLimit - btnDiameter);
      }
    }

    this.territoryMobileBtn?.setPosition(territoryX, territoryY);
    this.dashMobileBtn?.setPosition(dashX, dashY);

    this.joystickCenterX = joystickX;
    this.joystickCenterY = joystickY;
    this.joystickRadius = Math.round(56 * 0.8 * buttonScale);

    if (this.joystickTouchZone) {
      this.joystickTouchZone.setPosition(width * 0.5, 0);
      this.joystickTouchZone.setSize(width * 0.5, height);
    }

    if (this.joystickBase) {
      this.joystickBase.clear();
      this.joystickBase.fillStyle(0x09141d, 0.72);
      this.joystickBase.fillCircle(joystickX, joystickY, this.joystickRadius + 18);
      this.joystickBase.lineStyle(3, 0x6cbad0, 0.7);
      this.joystickBase.strokeCircle(joystickX, joystickY, this.joystickRadius + 10);
      this.joystickBase.lineStyle(1, 0x244456, 0.55);
      this.joystickBase.strokeCircle(joystickX, joystickY, this.joystickRadius - 4);
    }

    this.drawJoystickThumb();
  }

  private drawJoystickThumb(pointerX?: number, pointerY?: number): void {
    if (!this.joystickThumb) return;

    let thumbX = this.joystickCenterX;
    let thumbY = this.joystickCenterY;

    if (typeof pointerX === "number" && typeof pointerY === "number") {
      thumbX = pointerX;
      thumbY = pointerY;
    }

    this.joystickThumb.clear();
    this.joystickThumb.fillStyle(0x88e7ff, 0.6);
    this.joystickThumb.fillCircle(thumbX, thumbY, 18);
    this.joystickThumb.lineStyle(2, 0xe5fbff, 0.8);
    this.joystickThumb.strokeCircle(thumbX, thumbY, 18);
  }

  private updateJoystickFromPointer(pointerX: number, pointerY: number): void {
    const dx = pointerX - this.joystickCenterX;
    const dy = pointerY - this.joystickCenterY;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    const maxDistance = this.joystickRadius;
    const scale = distance > maxDistance && distance > 0 ? maxDistance / distance : 1;

    this.joystickAngle = Math.atan2(dy, dx);

    const clampedX = this.joystickCenterX + dx * scale;
    const clampedY = this.joystickCenterY + dy * scale;

    this.drawJoystickThumb(clampedX, clampedY);
  }

  // 餌の更新時にエフェクトを表示（ジンベエザメ専用）
  private updateFoodWithEffect(foods: Array<{ id: string; x: number; y: number; isRed?: boolean }>): void {
    const newFoodIds = new Set(foods.map((f) => f.id));
    const prevFoodIds = new Set(this.gameState.getFoods().keys());

    // 消えた餌のIDを検出
    const removedIds = [...prevFoodIds].filter((id) => !newFoodIds.has(id));

    // 消えた餌に対してエフェクトを表示
    for (const id of removedIds) {
      const food = this.gameState.getFoods().get(id);
      if (food) {
        const myShark = this.gameState.getSharks().get(this.myId);
        if (myShark) {
          this.suctionEffect.playAt(food.x, food.y, myShark.x, myShark.y);
        }
      }
    }
  }

  private onDeath(m: DeathPayload): void {
    this.isDead = true;

    // Play scream sound for human mode
    if (this.myRoute === "human") {
      this.sound.play("human_scream", { volume: 0.8 });
    }
    this.scene.pause();
    this.scene.launch("DeathScreen", { score: m.score, stage: m.stage, route: this.myRoute });
  }

  private onLeaderboard(m: LeaderboardPayload): void {
    this.leaderboardPanel.setLeader(m.topName, m.topScore);
  }

  private handleShutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    net.offMessage(this.serverMessageHandler);
    if (this.resizeHandler) {
      this.scale.off("resize", this.resizeHandler);
      this.resizeHandler = undefined;
    }
    this.spaceKey = undefined;
    this.input2 = undefined;
    this.bgm?.destroy();
    this.bgm = undefined;
  }
}
