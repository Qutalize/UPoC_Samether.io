import Phaser from "phaser";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CPNetClient } from "../../network/cp-websocket";
import { loadDailyDistance, addDailyDistance, calcMaxCp } from "../../storage/cp";
import type { ServerMsg } from "../../network/protocol";
import { styledButton } from "../styledButton";

const SERIF = "'Times New Roman', 'Georgia', serif";

/** GPS送信間隔 (ms) — サーバーの5秒間隔フィルタに合わせる */
const UPDATE_INTERVAL_MS = 5_000;

type Phase = "idle" | "connecting" | "measuring" | "done";

export class CPScreen extends Phaser.Scene {
  private instructionText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Text;
  private cpDisplayText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private goalBtn!: Phaser.GameObjects.Text;
  private resizeHandler!: (size: Phaser.Structs.Size) => void;

  private phase: Phase = "idle";
  private watchId: number | null = null;
  private lastSendTime = 0;

  /** Bound handlers for cleanup */
  private msgHandler: ((msg: ServerMsg) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  /** 地図 */
  private map: maplibregl.Map | null = null;
  private trackCoords: [number, number][] = [];
  private userMarker: maplibregl.Marker | null = null;

  /** CP 専用 WebSocket 接続（ゲームとは独立） */
  private cpNet = new CPNetClient();

  /** サーバーから受け取った最新値 */
  private estimatedDist = 0;
  private pointsRecorded = 0;

  constructor() {
    super({ key: "CPScreen" });
  }

  /* ------------------------------------------------------------------ */
  /*  Phaser lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  create(): void {
    this.cameras.main.setBackgroundColor("#030a14");

    this.cpDisplayText = this.add.text(0, 0, `本日の歩行距離: ${Math.round(loadDailyDistance())}m`, {
      fontFamily: SERIF,
      fontSize: "22px",
      color: "#6688aa",
    }).setOrigin(0.5);

    this.instructionText = this.add.text(
      0,
      0,
      "[ スタート ] を押して歩くと MaxCP が上昇します",
      {
        fontFamily: SERIF,
        fontSize: "15px",
        color: "#4a6a8a",
        align: "center",
        letterSpacing: 2,
      },
    ).setOrigin(0.5);

    this.statusText = this.add.text(0, 0, "待機中", {
      fontFamily: SERIF,
      fontSize: "22px",
      color: "#4a6a8a",
    }).setOrigin(0.5);

    this.distText = this.add.text(0, 0, "", {
      fontFamily: SERIF,
      fontSize: "18px",
      color: "#6688aa",
    }).setOrigin(0.5);

    this.startBtn = styledButton(this,"─  スタート  ─", "28px", "#44ff88", "#88ffbb", 0x22aa55, 8);
    this.startBtn.on("pointerdown", () => this.handleStart());

    this.goalBtn = styledButton(this,"─  ストップ  ─", "22px", "#555555", "#88aacc", 0x446688, 4);
    this.goalBtn.on("pointerdown", () => this.handleStop());

    this.backBtn = styledButton(this,"─  ホームへ戻る  ─", "18px", "#6688aa", "#88bbdd", 0x446688, 4);
    this.backBtn.on("pointerdown", () => this.goHome());

    this.layout(this.scale.width, this.scale.height);

    this.resizeHandler = (size: Phaser.Structs.Size) => {
      this.layout(size.width, size.height);
    };
    this.scale.on("resize", this.resizeHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.resizeHandler);
      this.cleanup();
    });

    this.applyPhase();

    /* WebSocket ハンドラを登録（シーン終了時に解除） */
    this.msgHandler = (msg: ServerMsg) => this.handleServerMsg(msg);
    this.closeHandler = () => this.handleDisconnect();
    this.cpNet.onMessage(this.msgHandler);
    this.cpNet.onClose(this.closeHandler);

  }

  private layout(width: number, height: number): void {
    this.instructionText.setPosition(width / 2, height * 0.62);
    this.statusText.setPosition(width / 2, height * 0.68);
    this.distText.setPosition(width / 2, height * 0.74);
    this.cpDisplayText.setPosition(width / 2, height * 0.80);
    this.startBtn.setPosition(width / 2, height * 0.86);
    this.goalBtn.setPosition(width / 2, height * 0.86);
    this.backBtn.setPosition(width / 2, height * 0.93);
  }

  /* ------------------------------------------------------------------ */
  /*  Navigation                                                        */
  /* ------------------------------------------------------------------ */

  private goHome(): void {
    this.cleanup();
    this.scene.start("HomeScreen");
  }

  /* ------------------------------------------------------------------ */
  /*  Server message handler                                            */
  /* ------------------------------------------------------------------ */

  private handleServerMsg(msg: ServerMsg): void {
    switch (msg.type) {
      case "cp_started":
        this.phase = "measuring";
        this.applyPhase();
        this.setStatus("計測中... 歩いてください", "#44ff88");
        this.startWatching();
        break;

      case "cp_progress": {
        const p = msg.payload;
        this.estimatedDist = p.estimatedDist;
        this.pointsRecorded = p.pointsRecorded;
        this.distText.setText(
          `距離: ${Math.round(this.estimatedDist)} m  (${this.pointsRecorded} 点記録)`,
        );
        break;
      }

      case "cp_result": {
        const r = msg.payload;
        this.phase = "done";
        this.applyPhase();
        this.stopWatching();
        const newTotal = addDailyDistance(r.distance);
        const newMaxCp = calcMaxCp(newTotal);
        this.setStatus(
          `歩行距離: ${Math.round(r.distance)}m → MaxCP: ${newMaxCp} に上昇`,
          "#44ff88",
        );
        this.distText.setText("");
        this.cpDisplayText.setText(`本日の歩行距離: ${Math.round(newTotal)}m`);
        if (r.positions && r.positions.length > 0) {
          this.trackCoords = r.positions.map((p) => [p.lon, p.lat] as [number, number]);
          this.drawTrack();
        }
        break;
      }

      case "cp_error": {
        const e = msg.payload;
        this.setStatus(`エラー: ${e.message}`, "#ff6666");
        if (this.phase === "connecting") {
          this.phase = "idle";
          this.applyPhase();
        }
        break;
      }

    }
  }

  /* ------------------------------------------------------------------ */
  /*  Start / Stop                                                      */
  /* ------------------------------------------------------------------ */

  private async handleStart(): Promise<void> {
    if (this.phase !== "idle" && this.phase !== "done") return;
    if (!navigator.geolocation) {
      this.setStatus("位置情報が利用できません", "#ff6666");
      return;
    }

    this.phase = "connecting";
    this.applyPhase();
    this.setStatus("接続中...", "#ffdd44");
    this.estimatedDist = 0;
    this.pointsRecorded = 0;
    this.trackCoords = [];
    this.distText.setText("");

    try {
      // CP 専用の独立した WebSocket 接続を開く（ゲーム接続とは別）
      await this.cpNet.connect();
      const welcomePromise = this.cpNet.waitFor("welcome", 10_000);
      this.cpNet.send({ type: "join", payload: { name: "__cp__walker", route: "attack" } });
      await welcomePromise;
      this.cpNet.send({ type: "cp_start", payload: {} });
    } catch {
      this.phase = "idle";
      this.applyPhase();
      this.setStatus("サーバー接続に失敗しました", "#ff6666");
    }
  }

  private handleStop(): void {
    if (this.phase !== "measuring") return;
    this.setStatus("結果を計算中...", "#ffdd44");
    this.stopWatching();
    this.cpNet.send({ type: "cp_stop", payload: {} });
  }

  /* ------------------------------------------------------------------ */
  /*  GPS watch                                                         */
  /* ------------------------------------------------------------------ */

  private startWatching(): void {
    this.stopWatching();
    this.lastSendTime = 0;
    this.initMap().catch(() => { /* map init failure is non-fatal */ });

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.setStatus(`GPS エラー: ${err.message}`, "#ff6666"),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }

  private stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private onPosition(pos: GeolocationPosition): void {
    const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;

    // 地図の現在地マーカーを更新
    this.updateMapPosition(lon, lat);

    // スロットル: UPDATE_INTERVAL_MS 以内なら送信しない
    const now = Date.now();
    if (now - this.lastSendTime < UPDATE_INTERVAL_MS) return;
    this.lastSendTime = now;

    // サーバーに送信（精度フィルタはサーバー側で行う）
    this.cpNet.send({ type: "cp_update", payload: { lat, lon, acc } });

    // 軌跡にローカルでも追加（リアルタイム描画用）
    this.trackCoords.push([lon, lat]);
    this.drawTrack();
  }

  /* ------------------------------------------------------------------ */
  /*  Map (MapLibre GL JS)                                              */
  /* ------------------------------------------------------------------ */

  private async initMap(): Promise<void> {
    this.destroyMap();

    const container = document.createElement("div");
    container.id = "cp-map";
    container.style.cssText =
      "position:fixed;top:5%;left:50%;transform:translateX(-50%);width:72%;height:55%;z-index:10;border-radius:8px;border:1px solid #225588;";
    document.body.appendChild(container);

    // まず現在地を1回取得してから地図を初期化する
    const startPos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
      });
    }).catch(() => null);

    const center: [number, number] = startPos
      ? [startPos.coords.longitude, startPos.coords.latitude]
      : [139.7671, 35.6812]; // fallback: 東京駅

    // AWS Location Service Maps API v2 でスタイルを取得、失敗時は OSM フォールバック
    const osmFallback: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    };

    let style: string | maplibregl.StyleSpecification = osmFallback;

    try {
      const res = await fetch("/api/map-key");
      if (res.ok) {
        const data: { region: string; apiKey: string } = await res.json();
        if (data.apiKey && data.region) {
          // Maps API v2: /v2/styles/{StyleName}/descriptor
          const awsUrl = `https://maps.geo.${data.region}.amazonaws.com/v2/styles/Standard/descriptor?color-scheme=Dark&language=ja&key=${data.apiKey}`;
          const check = await fetch(awsUrl);
          if (check.ok) {
            style = awsUrl;
          }
        }
      }
    } catch {
      // fallback to OSM
    }

    this.map = new maplibregl.Map({
      container,
      style,
      center,
      zoom: 16,
      attributionControl: false,
    });

    this.map.addControl(new maplibregl.NavigationControl(), "top-right");

    // 現在地マーカー
    const el = document.createElement("div");
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "50%";
    el.style.background = "#44ff88";
    el.style.border = "3px solid #fff";
    el.style.boxShadow = "0 0 8px rgba(68,255,136,0.6)";
    this.userMarker = new maplibregl.Marker({ element: el })
      .setLngLat(center)
      .addTo(this.map);

    // 地図読み込み後に軌跡ソースを追加
    this.map.on("load", () => {
      if (!this.map) return;
      this.map.addSource("track", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
      });
      this.map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        paint: {
          "line-color": "#44ff88",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      });
    });
  }

  private updateMapPosition(lon: number, lat: number): void {
    if (this.userMarker) {
      this.userMarker.setLngLat([lon, lat]);
    }
    if (this.map) {
      this.map.easeTo({ center: [lon, lat], duration: 500 });
    }
  }

  private drawTrack(): void {
    if (!this.map) return;
    const source = this.map.getSource("track") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: this.trackCoords },
        properties: {},
      });
    }
  }

  private destroyMap(): void {
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    const container = document.getElementById("cp-map");
    if (container) container.remove();
  }

  /* ------------------------------------------------------------------ */
  /*  Disconnect handler                                                */
  /* ------------------------------------------------------------------ */

  private handleDisconnect(): void {
    if (this.phase === "measuring" || this.phase === "connecting") {
      this.phase = "idle";
      this.applyPhase();
      this.stopWatching();
      this.setStatus("サーバーとの接続が切れました", "#ff6666");
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                           */
  /* ------------------------------------------------------------------ */

  private cleanup(): void {
    this.stopWatching();
    this.destroyMap();
    if (this.msgHandler) {
      this.cpNet.offMessage(this.msgHandler);
      this.msgHandler = null;
    }
    if (this.closeHandler) {
      this.cpNet.offClose(this.closeHandler);
      this.closeHandler = null;
    }
    this.cpNet.disconnect();
  }

  /* ------------------------------------------------------------------ */
  /*  UI helpers                                                        */
  /* ------------------------------------------------------------------ */

  private applyPhase(): void {
    const setEnabled = (
      btn: Phaser.GameObjects.Text,
      enabled: boolean,
      activeColor: string,
    ) => {
      if (enabled) {
        btn.setInteractive({ useHandCursor: true }).setColor(activeColor);
      } else {
        btn.disableInteractive().setColor("#555555");
      }
    };

    switch (this.phase) {
      case "idle":
      case "done":
        setEnabled(this.startBtn, true, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        this.startBtn.setVisible(true);
        this.goalBtn.setVisible(false);
        break;
      case "connecting":
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        this.startBtn.setVisible(true);
        this.goalBtn.setVisible(false);
        break;
      case "measuring":
        this.startBtn.setVisible(false);
        this.goalBtn.setVisible(true);
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.goalBtn, true, "#ffaa44");
        break;
    }
  }

  private setStatus(msg: string, color: string): void {
    this.statusText.setText(msg).setColor(color);
  }
}
