import { Events } from "../Events.js";
import type { DamagePayload, PickupPayload, WeaponPayload } from "../Events.js";
import type { EventDispatcherImpl } from "@small-world-machine/engine";
import type { SpriteFontVariant } from "./SpriteAtlas.js";
import { generateSpriteFontChars, sliceFaceSprites } from "./SpriteAtlas.js";
import type { WeaponView } from "./WeaponView.js";

export class Hud {
  private _container?: HTMLDivElement;
  private _healthEl!: HTMLCanvasElement;
  private _armorEl!: HTMLCanvasElement;
  private _ammoEl!: HTMLCanvasElement;
  private _faceCanvas!: HTMLCanvasElement;
  private _faceImages: HTMLCanvasElement[] = [];

  private _fontSmallWhite: Map<string, HTMLCanvasElement> = new Map();
  private _fontSmallYellow: Map<string, HTMLCanvasElement> = new Map();
  private _fontSmallGrey: Map<string, HTMLCanvasElement> = new Map();

  private _keycardSlots: HTMLDivElement[] = [];
  private _keycards: string[] = [];

  private _ammoInfoCanvas?: HTMLCanvasElement;

  private _health: number = 100;
  private _armor: number = 0;
  private _ammo: number = 50;

  public get health(): number {
    return this._health;
  }

  public get armor(): number {
    return this._armor;
  }

  public get ammo(): number {
    return this._ammo;
  }

  public get keycards(): readonly string[] {
    return this._keycards;
  }

  constructor(
    private events: EventDispatcherImpl,
    private _weaponView?: WeaponView,
  ) {
    if (typeof document !== "undefined") {
      // Load local game fonts (Dungeon, VT323; no network fonts)
      if (!document.getElementById("dungeon-font-style")) {
        const style = document.createElement("style");
        style.id = "dungeon-font-style";
        style.innerHTML = `
          @font-face {
            font-family: 'Dungeon';
            src: url('/assets/fonts/Dungeon.woff2') format('woff2');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'VT323';
            src: url('/assets/fonts/VT323-Regular.woff2') format('woff2');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }

      this._container = document.createElement("div");
      this._container.id = "yad-hud";
      Object.assign(this._container.style, {
        position: "absolute",
        bottom: "0",
        left: "0",
        width: "100%",
        height: "32px", // 32px is exactly 16% of the 200px screen, authentic Dungeon scale
        display: "flex",
        flexDirection: "row",
        backgroundImage: "url('/assets/dungeon_pack/textures/graywide.webp')",
        backgroundRepeat: "repeat",
        backgroundSize: "64px 64px", // Scale down the background texture appropriately
        fontFamily: "'VT323', monospace", // Webfont for all standard text
        color: "white",
        userSelect: "none",
        zIndex: "100",
      });

      this._createSegments();

      const retroScreen = document.getElementById("retro-screen");
      if (retroScreen) {
        retroScreen.appendChild(this._container);
      } else {
        document.body.appendChild(this._container);
      }

      this._loadAndSliceFace();

      // Wait for Dungeon font to load before first render
      document.fonts.ready.then((): void => {
        this._generateSpriteFonts();
        this._updateDisplay();
      });
    }

    this._bindEvents();
  }

  private _triggerFlash(color: string): void {
    this._weaponView?.triggerFlash(color);
  }

  private _bindEvents(): void {
    this.events.addEventListener(Events.DAMAGE, (e: Record<string, unknown>) => {
      const payload = e as unknown as DamagePayload;
      const amount = payload.amount || 0;
      if (this._armor > 0) {
        this._armor -= amount;
        if (this._armor < 0) {
          this._health += this._armor;
          this._armor = 0;
        }
      } else {
        this._health -= amount;
      }
      if (this._health < 0) this._health = 0;
      this._updateDisplay();

      this._triggerFlash("rgba(255, 0, 0, 0.4)"); // Red flash
    });

    this.events.addEventListener(Events.PICKUP, (e: Record<string, unknown>) => {
      const payload = e as unknown as PickupPayload;
      const type = payload.itemType ?? (payload.type !== Events.PICKUP ? payload.type : undefined);
      const amount = payload.amount || 0;
      if (type === "armor") {
        this._armor = Math.min(200, this._armor + amount);
        this._triggerFlash("rgba(0, 255, 0, 0.3)"); // Green flash
      } else if (type === "health") {
        this._health = Math.min(200, this._health + amount);
        this._triggerFlash("rgba(0, 0, 255, 0.3)"); // Blue flash
      } else if (type === "weapon") {
        this._triggerFlash("rgba(255, 255, 0, 0.3)"); // Yellow flash
      } else if (type === "ammo") {
        this._ammo = Math.min(200, this._ammo + amount);
        this._triggerFlash("rgba(255, 255, 255, 0.3)"); // White flash
      } else if (type === "keycard" && payload.color) {
        if (!this._keycards.includes(payload.color)) {
          this._keycards.push(payload.color);
        }
      }
      this._updateDisplay();
    });

    this.events.addEventListener(Events.SHOOT, (): void => {
      if (this._ammo > 0) {
        this._ammo -= 1;
        this._updateDisplay();
      }
    });

    this.events.addEventListener(Events.WEAPON, (e: Record<string, unknown>) => {
      const payload = e as unknown as WeaponPayload;
      const { index } = payload;
      if (index) {
        this._updateWeaponDisplay(index);
      }
    });
  }

  private _generateSpriteFonts(): void {
    const variants: SpriteFontVariant[] = [
      { map: this._fontSmallWhite, hex: "#ffffff" },
      { map: this._fontSmallYellow, hex: "#ffff00" },
      { map: this._fontSmallGrey, hex: "#555555" },
    ];

    generateSpriteFontChars(
      "/assets/fonts/font-letters.webp",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ/% ".split(""),
      4,
      5,
      variants,
    ).then((): void => this._updateDisplay());

    generateSpriteFontChars(
      "/assets/fonts/font-numbers.webp",
      Array.from({ length: 10 }, (_, i) => i.toString()),
      3,
      5,
      variants,
    ).then((): void => this._updateDisplay()); // Redraw HUD with new numbers
  }

  private _drawSpriteText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontMap: Map<string, HTMLCanvasElement>,
    align: "left" | "center" = "left",
    charSpacing: number = 5,
  ): void {
    let currentX = align === "center" ? Math.floor(x - (text.length * charSpacing) / 2) : x;

    for (const char of text) {
      if (char !== " ") {
        const sprite = fontMap.get(char);
        if (sprite) {
          ctx.drawImage(sprite, currentX, y);
        }
      }
      currentX += charSpacing;
    }
  }

  private _updateDisplay(): void {
    if (this._healthEl) {
      this._updateMainStatCanvas(this._healthEl, `${this._health}%`, "HEALTH");
    }
    if (this._armorEl) {
      this._updateMainStatCanvas(this._armorEl, `${this._armor}%`, "ARMOR");
    }
    if (this._ammoEl) {
      this._updateMainStatCanvas(this._ammoEl, this._ammo.toString(), "AMMO");
    }

    // Update face
    if (this._faceCanvas && this._faceImages.length > 0) {
      const ctx = this._faceCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, this._faceCanvas.width, this._faceCanvas.height);

        let faceIndex = 0;
        if (this._health <= 0) faceIndex = 5;
        else if (this._health < 20) faceIndex = 4;
        else if (this._health < 40) faceIndex = 3;
        else if (this._health < 60) faceIndex = 2;
        else if (this._health < 80) faceIndex = 1;

        const face = this._faceImages[faceIndex];
        if (face) {
          // Draw the face centered in the face canvas
          const dx = (this._faceCanvas.width - face.width) / 2;
          const dy = (this._faceCanvas.height - face.height) / 2;
          ctx.drawImage(face, dx, dy);
        }
      }
    }

    // Update keycards
    // Grid:
    // [0: Blue Card]   [1: Blue Skull]
    // [2: Yellow Card] [3: Yellow Skull]
    // [4: Red Card]    [5: Red Skull]
    const keyColors = ["blue", "yellow", "red"];
    for (let i = 0; i < 3; i++) {
      const slotIndex = i * 2; // Left column
      if (this._keycardSlots[slotIndex]) {
        if (this._keycards.includes(keyColors[i]!)) {
          const hex =
            keyColors[i] === "blue" ? "#0000ff" : keyColors[i] === "red" ? "#ff0000" : "#ffff00";
          this._keycardSlots[slotIndex]!.style.backgroundColor = hex;
        } else {
          this._keycardSlots[slotIndex]!.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
        }
      }
    }

    // Update ammo list
    this._drawAmmoInfo();
  }

  private _createSegments(): void {
    // Original Dungeon HUD pixel widths (sum = 320)
    // Ammo: 45, Health: 48, Weapons: 45, Face: 32, Armor: 48, Keys: 14, Ammo Info: 88

    // Segment 1 (Ammo)
    const seg1 = this._createSegment(45);
    this._ammoEl = this._addMainStat(seg1, this._ammo.toString(), "AMMO");

    // Segment 2 (Health)
    const seg2 = this._createSegment(48);
    this._healthEl = this._addMainStat(seg2, `${this._health}%`, "HEALTH");

    // Segment 3 (Weapons)
    const seg3 = this._createSegment(45);
    this._createWeaponButtons(seg3);

    // Segment 4 (Face)
    const seg4 = this._createSegment(32);
    this._faceCanvas = document.createElement("canvas");
    // Face canvas needs to fit inside the 32px high HUD, so maybe 24x30 pixels
    this._faceCanvas.width = 24;
    this._faceCanvas.height = 30;
    Object.assign(this._faceCanvas.style, {
      width: "auto",
      height: "90%",
      imageRendering: "pixelated",
    });
    seg4.appendChild(this._faceCanvas);

    // Segment 5 (Armor)
    const seg5 = this._createSegment(48);
    this._armorEl = this._addMainStat(seg5, `${this._armor}%`, "ARMOR");

    // Segment 6 (Keys)
    const seg6 = this._createSegment(14);
    this._createKeycardButtons(seg6);

    // Segment 7 (Ammo Info)
    const seg7 = this._createSegment(88);
    this._createAmmoInfo(seg7);
  }

  private _createSegment(flexValue: number): HTMLDivElement {
    const el = document.createElement("div");
    Object.assign(el.style, {
      flex: flexValue.toString(),
      boxSizing: "border-box",
      borderTop: "1px solid rgba(255, 255, 255, 0.3)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.3)",
      borderBottom: "1px solid rgba(0, 0, 0, 0.6)",
      borderRight: "1px solid rgba(0, 0, 0, 0.6)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    });
    this._container?.appendChild(el);
    return el;
  }

  private _addMainStat(
    container: HTMLDivElement,
    topVal: string,
    bottomLabel: string,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 28;
    Object.assign(canvas.style, {
      width: "100%",
      height: "100%",
      imageRendering: "pixelated",
    });

    container.appendChild(canvas);
    this._updateMainStatCanvas(canvas, topVal, bottomLabel);
    return canvas;
  }

  private _updateMainStatCanvas(
    canvas: HTMLCanvasElement,
    valStr: string,
    bottomLabel: string,
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const x = canvas.width / 2;

    // --- Kleines Label ---
    this._drawSpriteText(ctx, bottomLabel, x, 20, this._fontSmallWhite, "center", 5);

    // --- Große rote Zahlen (behalten ihr weiches Anti-Aliasing für den Custom-Font) ---
    ctx.font = "bold 13px 'Dungeon', 'Impact', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const yBig = 12;

    ctx.fillStyle = "#000000";
    ctx.fillText(valStr, x + 1, yBig + 1);
    ctx.fillStyle = "#cc0000";
    ctx.fillText(valStr, x, yBig);
  }

  private _armsCanvas?: HTMLCanvasElement;

  private _createWeaponButtons(container: HTMLDivElement): void {
    this._armsCanvas = document.createElement("canvas");
    this._armsCanvas.width = 45;
    this._armsCanvas.height = 28;
    Object.assign(this._armsCanvas.style, {
      width: "100%",
      height: "100%",
      imageRendering: "pixelated",
    });
    container.appendChild(this._armsCanvas);

    this._updateWeaponDisplay(1);
  }

  private _updateWeaponDisplay(activeIndex: number): void {
    if (!this._armsCanvas) return;
    const ctx = this._armsCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, this._armsCanvas.width, this._armsCanvas.height);

    const colW = 12;
    const rowH = 5;
    const startX = (this._armsCanvas.width - (colW * 2 + 2)) / 2;
    const startY = 0;

    const weapons = [1, 2, 3, 4, 5, 6];
    for (let i = 0; i < 6; i++) {
      const wpn = weapons[i]!;
      const col = i >= 3 ? 1 : 0;
      const row = i % 3;

      const boxX = startX + col * (colW + 2);
      const boxY = startY + row * (rowH + 1);

      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(boxX, boxY, colW, rowH);

      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(boxX, boxY, colW, 1);
      ctx.fillRect(boxX, boxY, 1, rowH);

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(boxX, boxY + rowH - 1, colW, 1);
      ctx.fillRect(boxX + colW - 1, boxY, 1, rowH);

      const mapToUse = activeIndex === wpn ? this._fontSmallYellow : this._fontSmallGrey;
      this._drawSpriteText(ctx, wpn.toString(), boxX + 3, boxY - 1, mapToUse, "left", 5);
    }

    // Explicit placement to avoid overlap
    this._drawSpriteText(
      ctx,
      "ARMS",
      this._armsCanvas.width / 2,
      20,
      this._fontSmallWhite,
      "center",
      5,
    );
  }

  private _createKeycardButtons(container: HTMLDivElement): void {
    container.style.padding = "2px";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "1fr 1fr";
    container.style.gridTemplateRows = "1fr 1fr 1fr";
    container.style.gap = "2px";

    // Create 6 slots (3 regular cards left, 3 skull keys right)
    for (let i = 0; i < 6; i++) {
      const btn = document.createElement("div");
      Object.assign(btn.style, {
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.2)", // Outset erfordert etwas helleren Hintergrund
        borderTop: "1px solid rgba(255, 255, 255, 0.3)",
        borderLeft: "1px solid rgba(255, 255, 255, 0.3)",
        borderBottom: "1px solid rgba(0, 0, 0, 0.6)",
        borderRight: "1px solid rgba(0, 0, 0, 0.6)",
      });
      container.appendChild(btn);
      this._keycardSlots.push(btn);
    }
  }

  private _createAmmoInfo(container: HTMLDivElement): void {
    this._ammoInfoCanvas = document.createElement("canvas");
    this._ammoInfoCanvas.width = 88;
    this._ammoInfoCanvas.height = 30;
    Object.assign(this._ammoInfoCanvas.style, {
      width: "100%",
      height: "100%",
      imageRendering: "pixelated",
    });
    container.appendChild(this._ammoInfoCanvas);
    this._drawAmmoInfo();
  }

  private _drawAmmoInfo(): void {
    if (!this._ammoInfoCanvas) return;
    const ctx = this._ammoInfoCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, this._ammoInfoCanvas.width, this._ammoInfoCanvas.height);

    const ammos = [
      { name: "BULL", current: this._ammo, max: 200 },
      { name: "SHEL", current: 0, max: 50 },
      { name: "RCKT", current: 0, max: 50 },
      { name: "CELL", current: 0, max: 300 },
    ];

    let y = 1;
    for (const ammo of ammos) {
      this._drawSpriteText(ctx, ammo.name, 3, y, this._fontSmallWhite, "left", 5);

      const curStr = ammo.current.toString().padStart(3, " ");
      const maxStr = ammo.max.toString().padStart(3, " ");
      const valStr = `${curStr} / ${maxStr}`;

      const fixedWidth = 9 * 5; // 9 chars * 5px monospace width
      const startX = this._ammoInfoCanvas.width - fixedWidth - 4;

      this._drawSpriteText(ctx, valStr, startX, y, this._fontSmallYellow, "left", 5);

      y += 7;
    }
  }

  private _loadAndSliceFace(): void {
    sliceFaceSprites({
      atlasUrl: "/assets/dungeon_pack/sprites/dungeonguy.webp",
      faceCount: 6,
      faceHeight: 180,
      maxFaceWidth: 138,
      outputWidth: 24,
      outputHeight: 30,
    })
      .then((faces): void => {
        this._faceImages = faces;
        this._updateDisplay();
      })
      .catch((): void => {
        console.warn("[YadHud] Could not load dungeonguy.webp from assets/dungeon_pack/sprites/");
      });
  }
}
