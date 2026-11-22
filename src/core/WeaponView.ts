import { Events } from "../Events.js";
import type { PickupPayload, ShootPayload, WeaponPayload } from "../Events.js";
import type { EventDispatcherImpl } from "@small-world-machine/engine";
import type { CrosshairMode } from "./GameSettings.js";
import { SLOT_DEFAULT_WEAPON, WEAPONS } from "./WeaponConfig.js";
import type { WeaponId } from "./WeaponConfig.js";

export interface WeaponViewOptions {
  parent: HTMLElement;
  events: EventDispatcherImpl;
}

interface LoadedWeaponSprites {
  frames: HTMLImageElement[];
  flashes: HTMLImageElement[];
}

const ALL_WEAPON_IDS: readonly WeaponId[] = [
  "fist",
  "chainsaw",
  "pistol",
  "shotgun",
  "chaingun",
  "rocket",
  "plasma",
];

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
  private _shootDuration: number = 400;
  private _activeWeapon: WeaponId = "pistol";
  private _shootWeapon: WeaponId = "pistol";
  private _weaponSprites: Map<WeaponId, LoadedWeaponSprites> = new Map();
  private _weaponFrame: number = 0;
  private _crosshairMode: CrosshairMode = "dot";
  private _crosshairHidden: boolean = false;

  private _lastBobX: number = 0;
  private _lastBobY: number = 0;

  public viewBobbing: boolean = true;

  public get weaponFrame(): number {
    return this._weaponFrame;
  }

  public get isShooting(): boolean {
    return this._shootTimer > 0;
  }

  public get activeWeapon(): WeaponId {
    return this._activeWeapon;
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
      pointerEvents: "none",
      zIndex: "40",
    });
    parent.appendChild(this._crosshair);
    this._updateCrosshairVisual();
  }

  public setCrosshairMode(mode: CrosshairMode, hidden: boolean = this._crosshairHidden): void {
    this._crosshairMode = mode;
    this._crosshairHidden = hidden;
    this._updateCrosshairVisual();
  }

  private _updateCrosshairVisual(): void {
    if (!this._crosshair) {
      return;
    }
    if (this._crosshairHidden || this._crosshairMode === "off") {
      this._crosshair.style.display = "none";
      return;
    }
    this._crosshair.style.display = "block";
    if (this._crosshairMode === "dot") {
      Object.assign(this._crosshair.style, {
        width: "2px",
        height: "2px",
        backgroundColor: "rgba(255, 255, 255, 0.75)",
        borderRadius: "0",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.65)",
        backgroundImage: "none",
      });
    } else {
      Object.assign(this._crosshair.style, {
        width: "7px",
        height: "7px",
        backgroundColor: "transparent",
        borderRadius: "0",
        boxShadow: "none",
        backgroundImage:
          "linear-gradient(to right, transparent 3px, rgba(255, 255, 255, 0.85) 3px, rgba(255, 255, 255, 0.85) 4px, transparent 4px), linear-gradient(to bottom, transparent 3px, rgba(255, 255, 255, 0.85) 3px, rgba(255, 255, 255, 0.85) 4px, transparent 4px)",
      });
    }
  }

  private _createWeaponCanvas(parent: HTMLElement): void {
    this._weaponCanvas = document.createElement("canvas");
    // Full 320x168 retro viewport above the 32px HUD bar so wide sprites (punch, chainsaw) never clip
    this._weaponCanvas.width = 320;
    this._weaponCanvas.height = 168;
    Object.assign(this._weaponCanvas.style, {
      position: "absolute",
      bottom: "32px",
      left: "0",
      width: "100%",
      height: "168px",
      imageRendering: "pixelated",
      pointerEvents: "none",
      zIndex: "50",
    });
    parent.appendChild(this._weaponCanvas);
  }

  private _loadWeaponSprites(): void {
    for (const id of ALL_WEAPON_IDS) {
      const def = WEAPONS[id];
      const frames: HTMLImageElement[] = [];
      const flashes: HTMLImageElement[] = [];

      for (const frameName of def.frames) {
        const img = new Image();
        img.src = `/assets/dungeon_pack/sprites/${frameName}.webp`;
        img.onload = (): void => {
          if (this._activeWeapon === id) {
            this._drawWeapon(this._lastBobX, this._lastBobY);
          }
        };
        frames.push(img);
      }

      for (const flashName of def.flashFrames) {
        const img = new Image();
        img.src = `/assets/dungeon_pack/sprites/${flashName}.webp`;
        img.onload = (): void => {
          if (this._activeWeapon === id) {
            this._drawWeapon(this._lastBobX, this._lastBobY);
          }
        };
        flashes.push(img);
      }

      this._weaponSprites.set(id, { frames, flashes });
    }
  }

  private _bindEvents(events: EventDispatcherImpl): void {
    events.addEventListener(Events.SHOOT, (e: Record<string, unknown>): void => {
      const payload = e as unknown as ShootPayload;
      this.triggerShoot(payload.weaponId);
    });

    events.addEventListener(Events.WEAPON, (e: Record<string, unknown>): void => {
      const payload = e as unknown as WeaponPayload;
      const nextId = payload.weaponId ?? SLOT_DEFAULT_WEAPON[payload.index];
      if (nextId && nextId !== this._activeWeapon) {
        this.setActiveWeapon(nextId);
      }
    });

    events.addEventListener(Events.PICKUP, (e: Record<string, unknown>): void => {
      const payload = e as unknown as PickupPayload;
      const type = payload.itemType ?? (payload.type !== Events.PICKUP ? payload.type : undefined);
      if (type === "weapon" && payload.weaponId) {
        this.setActiveWeapon(payload.weaponId);
      }
    });
  }

  public setActiveWeapon(weaponId: WeaponId): void {
    this._activeWeapon = weaponId;
    this._shootWeapon = weaponId;
    this._shootTimer = 0;
    this._weaponFrame = 0;
    if (this._weaponCanvas) {
      this._drawWeapon(this._lastBobX, this._lastBobY);
    }
  }

  public triggerShoot(weaponId?: WeaponId): void {
    if (this._weaponFrame > 0 && this._shootTimer > 40) return;
    if (weaponId && weaponId !== this._activeWeapon) {
      this._activeWeapon = weaponId;
    }
    const id = weaponId ?? this._activeWeapon;
    const def = WEAPONS[id];
    this._shootWeapon = id;
    this._shootDuration = def.animDurationMs;
    this._shootTimer = def.animDurationMs;
    this._weaponFrame = def.frames.length > 1 ? 1 : 0;
    if (this._weaponCanvas) {
      this._lastBobX = 0;
      this._lastBobY = 10;
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
    const prevFrame = this._weaponFrame;
    const def = WEAPONS[this._shootWeapon];

    if (this._shootTimer > 0) {
      this._shootTimer -= deltaTime * 1000;

      if (this._shootTimer <= 0) {
        this._shootTimer = 0;
        this._weaponFrame = 0;
        if (this.viewBobbing) {
          offsetX = Math.round(Math.sin(bobPhase * 0.5) * 6);
          offsetY = Math.round(Math.abs(Math.sin(bobPhase)) * 4);
        }
      } else {
        const activeFrames = Math.max(1, def.frames.length - 1);
        const progress = Math.max(0, Math.min(0.9999, 1 - this._shootTimer / this._shootDuration));
        this._weaponFrame = Math.min(def.frames.length - 1, 1 + Math.floor(progress * activeFrames));
        offsetY = def.id === "chaingun" || def.id === "chainsaw" ? 4 : 10;
      }
    } else if (this.viewBobbing) {
      offsetX = Math.round(Math.sin(bobPhase * 0.5) * 6);
      offsetY = Math.round(Math.abs(Math.sin(bobPhase)) * 4);
    }

    if (
      this._weaponCanvas &&
      (offsetX !== this._lastBobX ||
        offsetY !== this._lastBobY ||
        this._weaponFrame !== prevFrame ||
        this._shootTimer > 0)
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

    const activeId = this._shootTimer > 0 ? this._shootWeapon : this._activeWeapon;
    const sprites = this._weaponSprites.get(activeId);
    if (!sprites) return;

    const def = WEAPONS[activeId];
    const sprite = sprites.frames[this._weaponFrame] ?? sprites.frames[0];
    const isFlashActive = this._shootTimer > 0 && this._weaponFrame >= 1 && sprites.flashes.length > 0;
    const flashIdx = isFlashActive ? Math.min(sprites.flashes.length - 1, this._weaponFrame - 1) : -1;
    const flash = flashIdx >= 0 ? sprites.flashes[flashIdx] : undefined;

    if (
      def.flashOverlay &&
      flash &&
      flash.complete &&
      flash.naturalWidth > 0 &&
      this._weaponFrame <= sprites.flashes.length
    ) {
      const fdx = Math.round((this._weaponCanvas.width - flash.width) / 2) + offsetX;
      const fdy = this._weaponCanvas.height - flash.height + offsetY;
      ctx.drawImage(flash, fdx, fdy);
      return;
    }

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const dx = Math.round((this._weaponCanvas.width - sprite.width) / 2) + offsetX;
      const dy = this._weaponCanvas.height - sprite.height + offsetY;
      ctx.drawImage(sprite, dx, dy);
    }

    // Draw muzzle flash on firing frame 1 (or multi-frame rocket/chaingun flashes)
    if (
      flash &&
      flash.complete &&
      flash.naturalWidth > 0 &&
      (this._weaponFrame === 1 ||
        (activeId === "chaingun" && this._weaponFrame <= 2) ||
        (activeId === "rocket" && this._weaponFrame <= sprites.flashes.length))
    ) {
      const fdx = Math.round((this._weaponCanvas.width - flash.width) / 2 + def.flashOffsetX) + offsetX;
      const spriteH = sprite ? sprite.height : 64;
      const fdy = this._weaponCanvas.height - spriteH - flash.height + def.flashOffsetY + offsetY;
      ctx.drawImage(flash, fdx, fdy);
    }
  }
}
