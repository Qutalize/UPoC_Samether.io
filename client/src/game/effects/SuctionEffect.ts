import Phaser from "phaser";

export class SuctionEffect {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // 餌が吸い込まれるアニメーションを再生
  playAt(foodX: number, foodY: number, sharkX: number, sharkY: number): void {
    const duration = 250;
    const particleCount = 5; // パーティクル数を増やす

    // 複数のパーティクルを時間差で生成
    for (let i = 0; i < particleCount; i++) {
      this.scene.time.delayedCall(i * 30, () => {
        // より明るい色のパーティクル
        const colors = [0x55ffaa, 0x66ffcc, 0x88ffdd];
        const color = colors[i % colors.length];
        const particle = this.scene.add.circle(foodX, foodY, 5, color, 0.9);
        particle.setDepth(5);

        // 吸い込まれる動き
        this.scene.tweens.add({
          targets: particle,
          x: sharkX,
          y: sharkY,
          scale: 0.3,
          alpha: 0,
          duration: duration - i * 20,
          ease: "Cubic.easeIn", // 加速しながら吸い込まれる
          onComplete: () => particle.destroy(),
        });
      });
    }

    // 軌跡ライン（餌からサメへの流線）
    const graphics = this.scene.add.graphics();
    graphics.setDepth(4);

    const progressObj = { value: 0 };
    this.scene.tweens.add({
      targets: progressObj,
      value: 1,
      duration: duration,
      onUpdate: () => {
        const progress = progressObj.value;
        graphics.clear();

        // グラデーションの流線
        const alpha = 0.4 * (1 - progress);
        graphics.lineStyle(3, 0x66ffcc, alpha);
        graphics.lineBetween(
          foodX,
          foodY,
          foodX + (sharkX - foodX) * progress,
          foodY + (sharkY - foodY) * progress
        );
      },
      onComplete: () => graphics.destroy(),
    });
  }
}
