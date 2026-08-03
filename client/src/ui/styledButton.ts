import Phaser from "phaser";

const SERIF = "'Times New Roman', 'Georgia', serif";

export function styledButton(
  scene: Phaser.Scene,
  label: string,
  fontSize: string,
  color: string,
  hoverColor: string,
  glowColor: number,
  letterSpacing: number,
): Phaser.GameObjects.Text {
  const btn = scene.add.text(0, 0, label, {
    fontFamily: SERIF,
    fontSize,
    color,
    letterSpacing,
  })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .on("pointerover", () => {
      btn.setColor(hoverColor);
      if (btn.postFX) { btn.postFX.clear(); btn.postFX.addGlow(glowColor, 6, 0, false, 0.1, 12); }
    })
    .on("pointerout", () => {
      btn.setColor(color);
      if (btn.postFX) { btn.postFX.clear(); btn.postFX.addGlow(glowColor, 3, 0, false, 0.1, 8); }
    });

  if (btn.postFX) {
    btn.postFX.addGlow(glowColor, 3, 0, false, 0.1, 8);
  }
  return btn;
}
