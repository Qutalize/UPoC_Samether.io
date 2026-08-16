import Phaser from "phaser";

export interface HudComponent {
  resize(size: Phaser.Structs.Size): void;
  destroy(): void;
}
