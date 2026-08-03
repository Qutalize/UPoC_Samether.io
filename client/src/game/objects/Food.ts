import Phaser from "phaser";

// A Food is a lightweight Sprite instead of a Graphics object.
// This significantly reduces draw calls.
export class Food extends Phaser.GameObjects.Sprite {
  private t0: number;
  public isRed: boolean;
  public isDiver: boolean;
  private lastX: number;

  constructor(scene: Phaser.Scene, x: number, y: number, isRed = false, isDiver = false) {
    const textureKey = isDiver ? "diver" : isRed ? "food_red" : "food_green";
    super(scene, x, y, textureKey);
    this.t0 = scene.time.now;
    this.isRed = isRed;
    this.isDiver = isDiver;
    this.lastX = x;

    if (isDiver) {
      this.setScale(0.06);
      this.setAlpha(0.8);
      this.setTint(0x708898);
      if (this.postFX) {
        this.postFX.addGlow(0xccaa22, 4, 0, false, 0.1, 10);
      }
    }

    scene.add.existing(this);
  }

  tickAnim(now: number): void {
    const phase = ((now - this.t0) / 400) % (Math.PI * 2);

    if (this.isDiver) {
      // Bobbing + wobble for diver
      const bob = Math.sin(phase * 2.5) * 3;
      this.y += bob * 0.02;
      const wobble = Math.sin(phase * 3) * 0.08;
      this.setRotation(this.rotation + wobble * 0.1);
      // Stretch for kicking motion
      const kick = 1.0 + Math.sin(phase * 4) * 0.03;
      this.setScale(0.06 * kick, 0.06);
    } else {
      // Scale pulsates between ~0.8 and 1.2
      const scale = 1.0 + Math.sin(phase) * 0.2;
      this.setScale(scale);
    }
  }

  updatePosition(x: number, y: number): void {
    if (this.isDiver) {
      // Face movement direction
      const dx = x - this.lastX;
      if (Math.abs(dx) > 0.1) {
        const angle = Math.atan2(y - this.y, dx);
        this.setRotation(angle);
        this.setFlipY(dx < 0);
      }
      this.lastX = x;
    }
    this.setPosition(x, y);
  }
}
