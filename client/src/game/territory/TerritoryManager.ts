/**
 * TerritoryManager.ts
 *
 * Manages territory lifecycle and integrates with WebSocket messages.
 * Handles territory creation, updates, and expiration events.
 */

import Phaser from 'phaser';
import { TerritoryCache, Territory, Point } from './TerritoryCache';
import { TerritoryRenderer } from './TerritoryRenderer';
import type { SharkRoute } from '../../network/protocol';

export interface TerritoryCreatedMessage {
  type: 'territory_created';
  payload: {
    territory: {
      id: string;
      sharkId: string;
      level: number;
      polygon: Point[];
      expiresAt: number;
    };
  };
}

export interface TerritoryUpdatedMessage {
  type: 'territory_updated';
  payload: {
    territoryId: string;
    newLevel: number;
    timestamp: number;
  };
}

export interface TerritoryExpiredMessage {
  type: 'territory_expired';
  payload: {
    territoryIds: string[];
  };
}

export interface MyEvolutionMessage {
  type: 'my_evolution';
  payload: {
    newLevel: number;
    recalculateTerritories: boolean;
  };
}

export class TerritoryManager {
  private cache: TerritoryCache;
  private renderer: TerritoryRenderer;
  private mySharkId: string | null = null;
  private myLevel: number = 1;
  private myRoute: SharkRoute;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, myRoute: SharkRoute) {
    this.scene = scene;
    this.myRoute = myRoute;
    this.cache = new TerritoryCache();
    this.renderer = new TerritoryRenderer(scene, this.cache, myRoute);
  }

  /**
   * Initialize with player info
   */
  init(sharkId: string, level: number): void {
    this.mySharkId = sharkId;
    this.myLevel = level;
    this.cache.setMyShark(sharkId, level);
  }

  /**
   * Update territories (call every frame)
   */
  update(): void {
    this.renderer.update();
  }

  /**
   * Handle WebSocket message
   */
  handleMessage(message: any): void {
    switch (message.type) {
      case 'territory_created':
        this.onTerritoryCreated(message as TerritoryCreatedMessage);
        break;

      case 'territory_updated':
        this.onTerritoryUpdated(message as TerritoryUpdatedMessage);
        break;

      case 'territory_expired':
        this.onTerritoryExpired(message as TerritoryExpiredMessage);
        break;

      case 'my_evolution':
        this.onMyEvolution(message as MyEvolutionMessage);
        break;
    }
  }

  /**
   * Handle territory_created message
   */
  private onTerritoryCreated(message: TerritoryCreatedMessage): void {
    const territory: Territory = {
      id: message.payload.territory.id,
      sharkId: message.payload.territory.sharkId,
      level: message.payload.territory.level,
      polygon: message.payload.territory.polygon,
      expiresAt: message.payload.territory.expiresAt,
    };

    console.log('[Territory] Created:', territory.id, 'Level:', territory.level);

    // Add to cache (will be filtered if not relevant)
    this.cache.add(territory);

    // Show warning if it's a dangerous territory
    if (territory.sharkId !== this.mySharkId && territory.level > this.myLevel) {
      this.showWarning('危険な領域が出現しました！', territory);
    }

    // Show success message for own territory
    if (territory.sharkId === this.mySharkId) {
      this.showSuccess('領域を確立しました！');
    }
  }

  /**
   * Handle territory_updated message
   */
  private onTerritoryUpdated(message: TerritoryUpdatedMessage): void {
    const territory = this.cache.get(message.payload.territoryId);
    if (!territory) return;

    const oldLevel = territory.level;
    const newLevel = message.payload.newLevel;

    console.log('[Territory] Updated:', message.payload.territoryId, `Lv${oldLevel} → Lv${newLevel}`);

    this.cache.updateLevel(message.payload.territoryId, newLevel);

    // Check if danger level changed
    if (territory.sharkId !== this.mySharkId) {
      const wasDangerous = oldLevel > this.myLevel;
      const isDangerous = newLevel > this.myLevel;

      if (!wasDangerous && isDangerous) {
        this.showWarning(`領域 ${message.payload.territoryId.substring(0, 8)} が危険になりました！`);
      } else if (wasDangerous && !isDangerous) {
        this.showSuccess(`領域 ${message.payload.territoryId.substring(0, 8)} が安全になりました`);
      }
    }
  }

  /**
   * Handle territory_expired message
   */
  private onTerritoryExpired(message: TerritoryExpiredMessage): void {
    console.log('[Territory] Expired:', message.payload.territoryIds);
    this.cache.remove(message.payload.territoryIds);
  }

  /**
   * Handle my_evolution message
   */
  private onMyEvolution(message: MyEvolutionMessage): void {
    const oldLevel = this.myLevel;
    const newLevel = message.payload.newLevel;

    console.log('[Territory] Evolution:', `Lv${oldLevel} → Lv${newLevel}`);

    this.myLevel = newLevel;
    this.cache.setMyLevel(newLevel);

    // 進化通知は無効化（2個表示されるバグ #65 未解決のため）

    // Recalculate is automatically handled by TerritoryCache
  }

  private lastDangerTerritoryId: string | null = null;

  /**
   * Check if current position is in a dangerous territory
   */
  checkDanger(x: number, y: number): Territory | null {
    const dangerTerritory = this.cache.isPointInDanger(x, y);

    if (dangerTerritory) {
      if (this.lastDangerTerritoryId !== dangerTerritory.id) {
        this.renderer.showDangerAlert(dangerTerritory);
        this.lastDangerTerritoryId = dangerTerritory.id;
      }
    } else {
      this.lastDangerTerritoryId = null;
    }

    return dangerTerritory;
  }

  /**
   * Show warning message to the player
   */
  private showWarning(message: string, territory?: Territory): void {
    // Create warning UI
    const warningText = this.scene.add.text(
      this.scene.cameras.main.centerX,
      100,
      `⚠ ${message}`,
      {
        fontSize: '24px',
        color: '#ff6600',
        backgroundColor: '#000000',
        padding: { x: 16, y: 8 },
        stroke: '#ffffff',
        strokeThickness: 2,
      }
    )
      .setOrigin(0.5)
      .setDepth(100)
      .setScrollFactor(0); // Fix to camera

    // Fade out after 3 seconds
    this.scene.tweens.add({
      targets: warningText,
      alpha: { from: 1, to: 0 },
      duration: 500,
      delay: 2500,
      onComplete: () => warningText.destroy(),
    });

    // Optional: Play warning sound
    // this.scene.sound.play('warning');

    // Show visual effect if territory provided
    if (territory) {
      this.renderer.showDangerAlert(territory);
    }
  }

  /**
   * Show success message to the player
   */
  private showSuccess(message: string): void {
    const successText = this.scene.add.text(
      this.scene.cameras.main.centerX,
      100,
      `✓ ${message}`,
      {
        fontSize: '24px',
        color: '#00ff00',
        backgroundColor: '#000000',
        padding: { x: 16, y: 8 },
      }
    )
      .setOrigin(0.5)
      .setDepth(100)
      .setScrollFactor(0);

    this.scene.tweens.add({
      targets: successText,
      alpha: { from: 1, to: 0 },
      duration: 500,
      delay: 2000,
      onComplete: () => successText.destroy(),
    });

    // Optional: Play success sound
    // this.scene.sound.play('success');
  }

  /**
   * Get cache for external use
   */
  getCache(): TerritoryCache {
    return this.cache;
  }

  /**
   * Get renderer for external use
   */
  getRenderer(): TerritoryRenderer {
    return this.renderer;
  }

  /**
   * Enable debug mode
   */
  enableDebug(): void {
    this.renderer.debugDraw();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.lastDangerTerritoryId = null;
    this.renderer.destroy();
    this.cache.clear();
  }
}
