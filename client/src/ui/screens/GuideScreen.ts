import Phaser from "phaser";

const SERIF = "'Times New Roman', 'Georgia', serif";

const ROUTES = [
  {
    name: "攻撃系",
    color: "#ff6666",
    glowColor: 0xaa3333,
    sharks: ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
    desc: "高速・高CP消費のリスク＆リワード型。\n通常速度 160 / ダッシュ 300 / CP消費 4.0/sec\n燃費が悪く上位種ほどエサを大量に必要とする。\nメガロドンは「血の知覚」で他サメの方向を常時感知できる。",
  },
  {
    name: "非攻撃系",
    color: "#66ccff",
    glowColor: 0x336699,
    sharks: ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
    desc: "標準速度・CP効率重視の生存特化型。\n通常速度 140 / ダッシュ 220 / CP消費 2.0/sec\n耐久力と燃費に特化した安定プレイスタイル。\nシロワニは1日サバ1匹で満足するほどの超燃費型。",
  },
  {
    name: "深海魚系",
    color: "#bb66ff",
    glowColor: 0x663399,
    sharks: ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
    desc: "低速だが中間的なダッシュ力を持つ重厚感型。\n通常速度 120 / ダッシュ 260 / CP消費 3.0/sec\n序盤は弱いが最上位が非常に強力なロマン型。\nニシオンデンザメはエサ不要で自動成長、探索範囲最大。",
  },
];

const RULES = [
  "鼻（頭の先端）が相手の体節に当たると自分が死亡",
  "上位種でも鼻は弱点 ─ ジャイアントキリングが起こる",
  "死亡するとエサに変換され、マップに散らばる",
  "エサを食べて XP を獲得 → 閾値で進化",
  "ダッシュで CP を消費して一時的に加速",
];

const TOTAL_PAGES = 5;
const SWIPE_THRESHOLD = 50;
const TWEEN_DURATION = 300;

export class GuideScreen extends Phaser.Scene {
  private pages: Phaser.GameObjects.Container[] = [];
  private currentPage = 0;
  private pageIndicator!: Phaser.GameObjects.Text;
  private prevBtn!: Phaser.GameObjects.Text;
  private nextBtn!: Phaser.GameObjects.Text;
  private isTweening = false;
  private swipeStartX = 0;

  constructor() {
    super({ key: "GuideScreen" });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#030a14");
    this.currentPage = 0;
    this.pages = [];
    this.isTweening = false;

    this.buildFixedHeader(width, height);
    this.buildPages(width, height);
    this.buildFixedFooter(width, height);
    this.setupSwipeInput();
    this.refreshNavState();
  }

  private buildFixedHeader(width: number, height: number): void {
    if (height < 500) return;

    const title = this.add
      .text(width / 2, 30, "G U I D E", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: "#88ccee",
        letterSpacing: 10,
      })
      .setOrigin(0.5)
      .setDepth(10);

    if (title.postFX) {
      title.postFX.addGlow(0x225588, 4, 0, false, 0.1, 10);
    }

    this.add
      .graphics()
      .lineStyle(1, 0x225588, 0.4)
      .lineBetween(40, 58, width - 40, 58)
      .setDepth(10);
  }

  private buildPages(width: number, height: number): void {
    const pageWidth = width;
    const contentY = height < 500 ? 10 : 70;
    const contentHeight = height - contentY - 60;
    const scale = Math.min(1.0, contentHeight / 280);

    const pageBuilders = [
      () => this.buildRulesPage(pageWidth, contentY, contentHeight, scale),
      () => this.buildRoutePage(ROUTES[0], pageWidth, contentY, contentHeight, scale),
      () => this.buildRoutePage(ROUTES[1], pageWidth, contentY, contentHeight, scale),
      () => this.buildRoutePage(ROUTES[2], pageWidth, contentY, contentHeight, scale),
      () => this.buildCpPage(pageWidth, contentY, contentHeight, scale),
    ];

    pageBuilders.forEach((build, i) => {
      const container = this.add.container(i * pageWidth, 0);
      build().forEach((obj) => container.add(obj));
      this.pages.push(container);
    });
  }

  private buildRulesPage(
    width: number,
    startY: number,
    _height: number,
    scale: number
  ): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [];
    let y = startY + 30;

    const heading = this.add
      .text(width / 2, y, "─  ル ー ル  ─", {
        fontFamily: SERIF,
        fontSize: `${Math.round(22 * scale)}px`,
        color: "#aa8866",
        letterSpacing: 6,
      })
      .setOrigin(0.5);
    objs.push(heading);
    y += Math.round(50 * scale);

    for (const rule of RULES) {
      const t = this.add
        .text(width / 2, y, `◆  ${rule}`, {
          fontFamily: SERIF,
          fontSize: `${Math.round(17 * scale)}px`,
          color: "#bbccdd",
          letterSpacing: 2,
          wordWrap: { width: width - 80 },
          align: "center",
        })
        .setOrigin(0.5, 0);
      objs.push(t);
      y += t.height + Math.round(18 * scale);
    }

    return objs;
  }

  private buildRoutePage(
    route: (typeof ROUTES)[0],
    width: number,
    startY: number,
    height: number,
    scale: number
  ): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const isMobile = height < 500;

    if (!isMobile) {
      /* PC: original single-column layout */
      let y = startY + 30;

      const sectionLabel = this.add
        .text(width / 2, y, "─  進 化 系 統  ─", {
          fontFamily: SERIF,
          fontSize: "20px",
          color: "#aa8866",
          letterSpacing: 6,
        })
        .setOrigin(0.5);
      objs.push(sectionLabel);
      y += 46;

      const header = this.add
        .text(width / 2, y, route.name, {
          fontFamily: SERIF,
          fontSize: "28px",
          color: route.color,
          letterSpacing: 6,
        })
        .setOrigin(0.5);
      if (header.postFX) {
        header.postFX.addGlow(route.glowColor, 5, 0, false, 0.1, 10);
      }
      objs.push(header);
      y += 46;

      for (let i = 0; i < route.sharks.length; i++) {
        const shark = this.add
          .text(width / 2, y, route.sharks[i], {
            fontFamily: SERIF,
            fontSize: "19px",
            color: "#ddeeff",
            letterSpacing: 2,
          })
          .setOrigin(0.5);
        objs.push(shark);
        y += 28;

        if (i < route.sharks.length - 1) {
          const arrow = this.add
            .text(width / 2, y, "↓", {
              fontFamily: SERIF,
              fontSize: "16px",
              color: "#556677",
            })
            .setOrigin(0.5);
          objs.push(arrow);
          y += 24;
        }
      }

      y += 20;

      const desc = this.add
        .text(width / 2, y, route.desc, {
          fontFamily: SERIF,
          fontSize: "16px",
          color: "#bbccdd",
          align: "center",
          lineSpacing: 8,
          wordWrap: { width: width - 80 },
        })
        .setOrigin(0.5, 0);
      objs.push(desc);

    } else {
      /* Mobile: 2-column layout */
      let y = startY + Math.round(20 * scale);

      const header = this.add
        .text(width / 2, y, route.name, {
          fontFamily: SERIF,
          fontSize: `${Math.round(28 * scale)}px`,
          color: route.color,
          letterSpacing: 6,
        })
        .setOrigin(0.5);
      if (header.postFX) {
        header.postFX.addGlow(route.glowColor, 5, 0, false, 0.1, 10);
      }
      objs.push(header);
      y += Math.round(40 * scale);

      const leftCenterX = width * 0.22;
      const rightStartX = width * 0.46;
      const rightWrapWidth = width - rightStartX - 20;

      const dividerX = width * 0.42;
      objs.push(
        this.add
          .graphics()
          .lineStyle(1, 0x225588, 0.3)
          .lineBetween(dividerX, y, dividerX, y + Math.round(180 * scale))
      );

      let chainY = y;
      for (let i = 0; i < route.sharks.length; i++) {
        const shark = this.add
          .text(leftCenterX, chainY, route.sharks[i], {
            fontFamily: SERIF,
            fontSize: `${Math.round(17 * scale)}px`,
            color: "#ddeeff",
            letterSpacing: 2,
          })
          .setOrigin(0.5);
        objs.push(shark);
        chainY += Math.round(24 * scale);

        if (i < route.sharks.length - 1) {
          const arrow = this.add
            .text(leftCenterX, chainY, "↓", {
              fontFamily: SERIF,
              fontSize: `${Math.round(14 * scale)}px`,
              color: "#556677",
            })
            .setOrigin(0.5);
          objs.push(arrow);
          chainY += Math.round(18 * scale);
        }
      }

      const desc = this.add
        .text(rightStartX, y, route.desc, {
          fontFamily: SERIF,
          fontSize: `${Math.round(15 * scale)}px`,
          color: "#bbccdd",
          lineSpacing: Math.round(8 * scale),
          wordWrap: { width: rightWrapWidth },
        })
        .setOrigin(0, 0);
      objs.push(desc);
    }

    return objs;
  }

  private buildCpPage(
    width: number,
    startY: number,
    height: number,
    scale: number
  ): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const isMobile = height < 500;
    const s = scale;
    let y = startY + Math.round((isMobile ? 16 : 30) * s);

    const addText = (
      text: string,
      size: number,
      color: string,
      gap: number,
      opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}
    ) => {
      const t = this.add
        .text(width / 2, y, text, {
          fontFamily: SERIF,
          fontSize: `${Math.round(size * s)}px`,
          color,
          wordWrap: { width: width - 60 },
          align: "center",
          ...opts,
        })
        .setOrigin(0.5, 0);
      objs.push(t);
      y += t.height + Math.round(gap * s);
      return t;
    };

    const heading = addText("─  C P  に つ い て  ─", 22, "#88ccee", isMobile ? 24 : 40, { letterSpacing: 6 });
    if (heading.postFX) heading.postFX.addGlow(0x225588, 4, 0, false, 0.1, 10);

    if (isMobile) {
      addText("ダッシュで消費する資源。尽きるとダッシュ不能になる。\n現実世界を歩いた距離がゲーム開始時の MaxCP を決定する。", 13, "#7799bb", 16);
    } else {
      addText("ダッシュで消費する資源。CP が尽きるとダッシュ不能になる。", 15, "#7799bb", 6);
      addText("現実世界を歩いた距離がゲーム開始時の MaxCP を決定する。", 15, "#7799bb", 28);
    }

    addText("◆  ダッシュ消費量", isMobile ? 15 : 17, "#aabbcc", isMobile ? 8 : 14, { letterSpacing: 2 });
    if (isMobile) {
      addText("攻撃系 4.0/秒  ／  深海魚系 3.0/秒  ／  非攻撃系 2.0/秒", 12, "#7799bb", isMobile ? 16 : 28);
    } else {
      addText("攻撃系  4.0 / 秒    深海魚系  3.0 / 秒    非攻撃系  2.0 / 秒", 15, "#7799bb", 28);
    }

    addText("◆  本日の歩行距離と MaxCP", isMobile ? 15 : 17, "#aabbcc", isMobile ? 8 : 14, { letterSpacing: 2 });
    const tiers = [
      "0 〜 200m   → MaxCP  10",
      "201 〜 500m → MaxCP  20",
      "501 〜 999m → MaxCP  30",
      "1km 〜      → MaxCP  50",
      "2km 〜      → MaxCP  80",
      "3km 以上    → MaxCP 100",
    ];
    for (const tier of tiers) {
      addText(tier, isMobile ? 12 : 14, "#7799bb", isMobile ? 4 : 8);
    }

    return objs;
  }

  private buildFixedFooter(width: number, height: number): void {
    const y = height - 30;

    this.prevBtn = this.add
      .text(width / 2 - 80, y, "◀", {
        fontFamily: SERIF,
        fontSize: "26px",
        color: "#6688aa",
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    this.prevBtn.on("pointerover", () => this.prevBtn.setColor("#88bbdd"));
    this.prevBtn.on("pointerout", () => this.prevBtn.setColor("#6688aa"));
    this.prevBtn.on("pointerdown", () => this.goToPage(this.currentPage - 1));

    this.pageIndicator = this.add
      .text(width / 2, y, `1 / ${TOTAL_PAGES}`, {
        fontFamily: SERIF,
        fontSize: "18px",
        color: "#88aabb",
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.nextBtn = this.add
      .text(width / 2 + 80, y, "▶", {
        fontFamily: SERIF,
        fontSize: "26px",
        color: "#6688aa",
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    this.nextBtn.on("pointerover", () => this.nextBtn.setColor("#88bbdd"));
    this.nextBtn.on("pointerout", () => this.nextBtn.setColor("#6688aa"));
    this.nextBtn.on("pointerdown", () => this.goToPage(this.currentPage + 1));

    const homeBtn = this.add
      .text(16, y, "ホームへ", {
        fontFamily: SERIF,
        fontSize: "16px",
        color: "#6688aa",
      })
      .setOrigin(0, 0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    homeBtn.on("pointerover", () => {
      homeBtn.setColor("#88bbdd");
      if (homeBtn.postFX) homeBtn.postFX.addGlow(0x225588, 6, 0, false, 0.2, 12);
    });
    homeBtn.on("pointerout", () => {
      homeBtn.setColor("#6688aa");
      if (homeBtn.postFX) homeBtn.postFX.clear();
    });
    homeBtn.on("pointerdown", () => this.scene.start("HomeScreen"));

    /* footer separator */
    this.add
      .graphics()
      .lineStyle(1, 0x225588, 0.4)
      .lineBetween(40, height - 52, width - 40, height - 52)
      .setDepth(10);
  }

  private setupSwipeInput(): void {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.swipeStartX = p.x;
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const dx = this.swipeStartX - p.x;
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        this.goToPage(this.currentPage + (dx > 0 ? 1 : -1));
      }
    });
  }

  private goToPage(target: number): void {
    if (this.isTweening || target < 0 || target >= TOTAL_PAGES) return;
    if (target === this.currentPage) return;

    this.isTweening = true;
    const { width } = this.scale;
    const direction = target > this.currentPage ? -1 : 1;

    /* slide all pages together */
    const targetX = target * -width;
    this.pages.forEach((page, i) => {
      this.tweens.add({
        targets: page,
        x: i * width + targetX,
        duration: TWEEN_DURATION,
        ease: "Cubic.easeInOut",
        onComplete: () => {
          if (i === 0) {
            this.isTweening = false;
          }
        },
      });
    });

    void direction;
    this.currentPage = target;
    this.refreshNavState();
  }

  private refreshNavState(): void {
    this.pageIndicator.setText(`${this.currentPage + 1} / ${TOTAL_PAGES}`);

    const dimColor = "#334455";
    const activeColor = "#6688aa";
    this.prevBtn.setColor(this.currentPage === 0 ? dimColor : activeColor);
    this.nextBtn.setColor(this.currentPage === TOTAL_PAGES - 1 ? dimColor : activeColor);

    if (this.currentPage === 0) {
      this.prevBtn.removeInteractive();
    } else {
      this.prevBtn.setInteractive({ useHandCursor: true });
    }
    if (this.currentPage === TOTAL_PAGES - 1) {
      this.nextBtn.removeInteractive();
    } else {
      this.nextBtn.setInteractive({ useHandCursor: true });
    }
  }
}
