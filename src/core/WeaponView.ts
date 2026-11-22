import { Events } from "../Events.js";
import type { EventDispatcherImpl } from "@small-world-machine/engine";

export interface WeaponViewOptions {
  parent: HTMLElement;
  events: EventDispatcherImpl;
}

/**
 * Manages first-person weapon rendering, bobbing, recoil, and screen flashes.
 * Employs zero-GC canvas rendering: bobbing and recoil are applied directly to the
 * 2D canvas drawing context instead of mutating DOM style strings every frame.
 */
export class WeaponView {
  private _weaponCanvas!: HTMLCanvasElement;
  private _flashOverlay!: HTMLElement;
  private _crosshair!: HTMLElement;

  private _shootTimer: number = 0;
  private _pistolSprites: HTMLImageElement[] = [];
  private _pistolFlash!: HTMLImageElement;
  private _weaponFrame: number = 0;

  private _lastBobX: number = 0;
  private _lastBobY: number = 0;

  public get weaponFrame(): number {
    return this._weaponFrame;
  }

  public get isShooting(): boolean {
    return this._shootTimer > 0;
  }

  constructor(options: WeaponViewOptions) {
    if (typeof document !== "undefined" && options.parent) {
      this._createFlashOverlay(options.parent);
      this._createCrosshair(options.parent);
      this._createWeaponCanvas(options.parent);
      this._loadWeaponSprites();
    }
    this._bindEvents(options.events);
  }

  private _createFlashOverlay(parent: HTMLElement): void {
    this._flashOverlay = document.createElement("div");
    Object.assign(this._flashOverlay.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "60",
      transition: "background-color 0.3s ease",
      backgroundColor: "transparent",
    });
    parent.appendChild(this._flashOverlay);
  }

  private _createCrosshair(parent: HTMLElement): void {
    this._crosshair = document.createElement("div");
    Object.assign(this._crosshair.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "4px",
      height: "4px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      pointerEvents: "none",
      zIndex: "40",
      borderRadius: "50%",
    });
    parent.appendChild(this._crosshair);
  }

  private _createWeaponCanvas(parent: HTMLElement): void {
    this._weaponCanvas = document.createElement("canvas");
    this._weaponCanvas.width = 128;
    this._weaponCanvas.height = 128;
    Object.assign(this._weaponCanvas.style, {
      position: "absolute",
      bottom: "32px", // Exactly on top of the 32px HUD bar
      left: "50%",
      transform: "translateX(-50%)",
      width: "128px",
      height: "128px",
      imageRendering: "pixelated",
      pointerEvents: "none",
      zIndex: "50",
    });
    parent.appendChild(this._weaponCanvas);
  }

  private _loadWeaponSprites(): void {
    const frames = ["pisga0", "pisgb0", "pisgc0", "pisgd0", "pisge0"];
    for (const frame of frames) {
      const img = new Image();
      img.src = `./assets/dungeon_pack/sprites/${frame}.webp`;
      img.onload = (): void => this._drawWeapon(this._lastBobX, this._lastBobY);
      this._pistolSprites.push(img);
    }
    this._pistolFlash = new Image();
    this._pistolFlash.src = `./assets/dungeon_pack/sprites/pisfa0.webp`;
  }

  private _bindEvents(events: EventDispatcherImpl): void {
    events.addEventListener(Events.SHOOT, (): void => {
      this.triggerShoot();
    });
  }

  public triggerShoot(): void {
    if (this._weaponFrame > 0) return; // Already in shooting animation
    this._shootTimer = 400; // 400ms total animation
    this._weaponFrame = 1;
    if (this._weaponCanvas) {
      this._drawWeapon(0, 10);
    }
  }

  public triggerFlash(color: string): void {
    if (!this._flashOverlay) return;
    this._flashOverlay.style.transition = "none";
    this._flashOverlay.style.backgroundColor = color;
    void this._flashOverlay.offsetWidth; // Force reflow
    this._flashOverlay.style.transition = "background-color 0.5s ease-out";
    this._flashOverlay.style.backgroundColor = "transparent";
  }

  /**
   * Updates weapon frame timing and applies zero-GC bobbing/recoil directly to canvas rendering.
   */
  public update(deltaTime: number, bobPhase: number): void {
    let offsetX = 0;
    let offsetY = 0;

    if (this._shootTimer > 0) {
      this._shootTimer -= deltaTime * 1000;

      let newFrame = 1;
      if (this._shootTimer < 100) {
        newFrame = 4; // pisge0
      } else if (this._shootTimer < 200) {
        newFrame = 3; // pisgd0
      } else if (this._shootTimer < 300) {
        newFrame = 2; // pisgc0
      }

      if (this._shootTimer <= 0) {
        this._weaponFrame = 0;
      } else {
        this._weaponFrame = newFrame;
      }

      // Recoil drop
      offsetY = 10;
    } else {
      // Bobbing calculation without heap allocations or DOM string manipulation
      offsetX = Math.round(Math.sin(bobPhase * 0.5) * 6);
      offsetY = Math.round(Math.abs(Math.sin(bobPhase)) * 4);
    }

    if (
      this._weaponCanvas &&
      (offsetX !== this._lastBobX || offsetY !== this._lastBobY || this._shootTimer > 0)
    ) {
      this._lastBobX = offsetX;
      this._lastBobY = offsetY;
      this._drawWeapon(offsetX, offsetY);
    }
  }

  private _drawWeapon(offsetX: number, offsetY: number): void {
    const ctx = this._weaponCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, this._weaponCanvas.width, this._weaponCanvas.height);

    const sprite = this._pistolSprites[this._weaponFrame];
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const dx = Math.round((this._weaponCanvas.width - sprite.width) / 2) + offsetX;
      const dy = this._weaponCanvas.height - sprite.height + offsetY;
      ctx.drawImage(sprite, dx, dy);
    }

    // Draw flash if firing frame
    if (
      this._weaponFrame === 1 &&
      this._pistolFlash &&
      this._pistolFlash.complete &&
      this._pistolFlash.naturalWidth > 0
    ) {
      const dx = Math.round((this._weaponCanvas.width - this._pistolFlash.width) / 2 - 10) + offsetX;
      const spriteH = sprite ? sprite.height : 64;
      const dy = this._weaponCanvas.height - spriteH - this._pistolFlash.height + 20 + offsetY;
      ctx.drawImage(this._pistolFlash, dx, dy);
    }
  }
}
