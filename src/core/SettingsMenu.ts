import {
  CROSSHAIR_OPTIONS,
  DEFAULT_GAME_SETTINGS,
  FOV_OPTIONS,
  LEVEL_OPTIONS,
  RESOLUTION_OPTIONS,
  loadGameSettings,
  saveGameSettings,
} from "./GameSettings.js";
import type {
  CrosshairMode,
  GameSettingsData,
  LevelId,
  RenderResolution,
} from "./GameSettings.js";

export type MenuSoundKind = "open" | "close" | "move";

export interface SettingsMenuOptions {
  parent: HTMLElement;
  initialSettings?: GameSettingsData;
  onChange: (settings: GameSettingsData) => void;
  onOpenChange?: (isOpen: boolean) => void;
  onSound?: (kind: MenuSoundKind) => void;
  onRestartLevel?: () => void;
}

type SettingKey = keyof GameSettingsData;

interface RowVisual {
  key: SettingKey;
  label: string;
  rowEl: HTMLDivElement;
  skullEl: HTMLDivElement;
  updateVisual: () => void;
  step: (delta: number) => void;
  activate?: () => void;
}

const SETTINGS_STYLE_ID = "yad-settings-style";
const FONT_STYLE_ID = "dungeon-font-style";

function ensureFontsAndStyles(): void {
  if (!document.getElementById(FONT_STYLE_ID)) {
    const fontStyle = document.createElement("style");
    fontStyle.id = FONT_STYLE_ID;
    fontStyle.textContent = `
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
    document.head.appendChild(fontStyle);
  }

  if (!document.getElementById(SETTINGS_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SETTINGS_STYLE_ID;
    style.textContent = `
      .yad-settings-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 640px;
        height: 400px;
        transform: scale(0.5);
        transform-origin: top left;
        z-index: 200;
        pointer-events: none;
        user-select: none;
        font-family: 'Dungeon', 'Impact', sans-serif;
        image-rendering: pixelated;
      }
      .yad-settings-trigger {
        position: absolute;
        top: 8px;
        right: 10px;
        pointer-events: auto;
        cursor: pointer;
        background: rgba(12, 12, 14, 0.78);
        border: 1px solid #6b7076;
        box-shadow: inset 1px 1px 0 #9aa0a6, 0 2px 0 #000;
        color: #cccccc;
        font-family: 'VT323', monospace;
        font-size: 13px;
        letter-spacing: 0.6px;
        padding: 2px 7px;
        opacity: 0.7;
        transition: opacity 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .yad-settings-trigger:hover {
        opacity: 1;
        color: #f0b800;
        border-color: #f0b800;
      }
      .yad-settings-backdrop {
        position: absolute;
        inset: 0;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding-top: 8px;
        background: rgba(0, 0, 0, 0.45);
        pointer-events: auto;
      }
      .yad-settings-backdrop.is-open {
        display: flex;
      }
      .yad-settings-title {
        margin: 0 0 6px 0;
        font-size: 25px;
        line-height: 1;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #d81414;
        text-shadow: 0 -1px 0 #ff5a3c, 0 2px 0 #4d0000, 2px 3px 0 #000000;
      }
      /* Freedoom 9-slice border frame (brdr_tl/t/tr/l/r/bl/b/br scaled 3x -> 9px edge) */
      .yad-settings-frame {
        display: grid;
        grid-template-columns: 9px 514px 9px;
        grid-template-rows: 9px auto 9px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.88);
        image-rendering: pixelated;
      }
      .yad-brdr-tl {
        background: url('/assets/dungeon_pack/ui/brdr_tl.webp') no-repeat;
        background-size: 9px 9px;
      }
      .yad-brdr-t {
        background: url('/assets/dungeon_pack/ui/brdr_t.webp') repeat-x;
        background-size: 24px 9px;
      }
      .yad-brdr-tr {
        background: url('/assets/dungeon_pack/ui/brdr_tr.webp') no-repeat;
        background-size: 9px 9px;
      }
      .yad-brdr-l {
        background: url('/assets/dungeon_pack/ui/brdr_l.webp') repeat-y;
        background-size: 9px 24px;
      }
      .yad-brdr-r {
        background: url('/assets/dungeon_pack/ui/brdr_r.webp') repeat-y;
        background-size: 9px 24px;
      }
      .yad-brdr-bl {
        background: url('/assets/dungeon_pack/ui/brdr_bl.webp') no-repeat;
        background-size: 9px 9px;
      }
      .yad-brdr-b {
        background: url('/assets/dungeon_pack/ui/brdr_b.webp') repeat-x;
        background-size: 24px 9px;
      }
      .yad-brdr-br {
        background: url('/assets/dungeon_pack/ui/brdr_br.webp') no-repeat;
        background-size: 9px 9px;
      }
      .yad-settings-panel {
        position: relative;
        padding: 8px 14px 7px 10px;
        background-color: #141416;
        background-image:
          linear-gradient(rgba(10, 10, 12, 0.74), rgba(8, 8, 10, 0.80)),
          url('/assets/dungeon_pack/textures/ceil3_5.webp');
        background-size: 64px 64px;
      }
      .yad-settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 20px;
        padding: 0 4px 0 0;
        cursor: pointer;
      }
      .yad-row-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .yad-skull-cursor {
        width: 20px;
        height: 19px;
        background-repeat: no-repeat;
        background-position: center;
        background-size: 20px 19px;
        image-rendering: pixelated;
        visibility: hidden;
        flex-shrink: 0;
      }
      .yad-settings-row.is-active .yad-skull-cursor {
        visibility: visible;
      }
      .yad-settings-label {
        font-size: 13px;
        letter-spacing: 0.5px;
        color: #b81414;
        text-shadow: 1px 1px 0 #000000;
      }
      .yad-settings-row.is-active .yad-settings-label {
        color: #ff2828;
      }
      .yad-settings-control {
        width: 176px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .yad-selector {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .yad-arrow-btn {
        background: none;
        border: none;
        padding: 2px 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .yad-arrow-icon {
        width: 0;
        height: 0;
        border-top: 5px solid transparent;
        border-bottom: 5px solid transparent;
      }
      .yad-arrow-icon.left {
        border-right: 7px solid #7e8389;
      }
      .yad-arrow-icon.right {
        border-left: 7px solid #7e8389;
      }
      .yad-settings-row.is-active .yad-arrow-icon.left,
      .yad-arrow-btn:hover .yad-arrow-icon.left {
        border-right-color: #f0b800;
      }
      .yad-settings-row.is-active .yad-arrow-icon.right,
      .yad-arrow-btn:hover .yad-arrow-icon.right {
        border-left-color: #f0b800;
      }
      /* Freedoom m_lsleft / m_lscntr / m_lsrght selector box (8x14 scaled 1.5x -> 12x21) */
      .yad-ls-box {
        display: flex;
        align-items: center;
        height: 21px;
        image-rendering: pixelated;
      }
      .yad-ls-left {
        width: 12px;
        height: 21px;
        background: url('/assets/dungeon_pack/ui/m_lsleft.webp') no-repeat;
        background-size: 12px 21px;
        flex-shrink: 0;
      }
      .yad-ls-center {
        height: 21px;
        min-width: 92px;
        padding: 0 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: url('/assets/dungeon_pack/ui/m_lscntr.webp') repeat-x;
        background-size: 12px 21px;
        font-size: 11px;
        color: #df1818;
        text-shadow: 1px 1px 0 #000000;
      }
      .yad-ls-center.is-toggle {
        min-width: 48px;
      }
      .yad-ls-center.is-on {
        color: #ff3030;
      }
      .yad-ls-center.is-off {
        color: #7c8086;
      }
      .yad-ls-right {
        width: 12px;
        height: 21px;
        background: url('/assets/dungeon_pack/ui/m_lsrght.webp') no-repeat;
        background-size: 12px 21px;
        flex-shrink: 0;
      }
      .yad-settings-row.is-active .yad-ls-box {
        filter: drop-shadow(0 0 2px rgba(240, 184, 0, 0.7));
      }
      /* Freedoom m_therml / m_thermm / m_thermr / m_thermo slider (scaled 1.5x -> 20px tall) */
      .yad-therm-slider {
        position: relative;
        display: flex;
        align-items: center;
        width: 158px;
        height: 20px;
        cursor: ew-resize;
        image-rendering: pixelated;
      }
      .yad-therm-left {
        width: 9px;
        height: 20px;
        background: url('/assets/dungeon_pack/ui/m_therml.webp') no-repeat;
        background-size: 9px 20px;
        flex-shrink: 0;
      }
      .yad-therm-mid {
        position: relative;
        width: 140px;
        height: 20px;
        background: url('/assets/dungeon_pack/ui/m_thermm.webp') repeat-x;
        background-size: 14px 20px;
        flex-shrink: 0;
      }
      .yad-therm-right {
        width: 9px;
        height: 20px;
        background: url('/assets/dungeon_pack/ui/m_thermr.webp') no-repeat;
        background-size: 9px 20px;
        flex-shrink: 0;
      }
      .yad-therm-knob {
        position: absolute;
        top: 2px;
        width: 8px;
        height: 17px;
        transform: translateX(-50%);
        background: url('/assets/dungeon_pack/ui/m_thermo.webp') no-repeat;
        background-size: 8px 17px;
        pointer-events: none;
      }
      .yad-settings-row.is-active .yad-therm-slider {
        filter: drop-shadow(0 0 2px rgba(240, 184, 0, 0.75));
      }
      .yad-settings-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 6px;
        padding-top: 5px;
        border-top: 1px solid rgba(255, 255, 255, 0.14);
        font-family: 'VT323', monospace;
        font-size: 13px;
      }
      .yad-settings-readout {
        color: #c2c6cc;
        text-shadow: 1px 1px 0 #000000;
        letter-spacing: 0.5px;
      }
      .yad-settings-actions {
        display: flex;
        gap: 8px;
      }
      .yad-settings-action-btn {
        background: #222427;
        border: 1px solid #6b7076;
        box-shadow: inset 1px 1px 0 #8d9399, 0 1px 0 #000000;
        color: #d41c1c;
        font-family: 'VT323', monospace;
        font-size: 13px;
        padding: 1px 7px;
        cursor: pointer;
      }
      .yad-settings-action-btn:hover {
        color: #f0b800;
        border-color: #f0b800;
      }
    `;
    document.head.appendChild(style);
  }
}

export class SettingsMenu {
  private _settings: GameSettingsData;
  private _onChange: (settings: GameSettingsData) => void;
  private _onOpenChange?: ((isOpen: boolean) => void) | undefined;
  private _onSound?: ((kind: MenuSoundKind) => void) | undefined;
  private _onRestartLevel?: (() => void) | undefined;
  private _isOpen: boolean = false;
  private _activeIndex: number = 0;
  private _rows: RowVisual[] = [];
  private _skullFrame: 1 | 2 = 1;
  private _skullTimer: ReturnType<typeof setInterval> | null = null;

  private _layerEl?: HTMLDivElement;
  private _triggerBtn?: HTMLButtonElement;
  private _backdropEl?: HTMLDivElement;
  private _readoutEl?: HTMLSpanElement;

  private _activeSliderCleanup: (() => void) | null = null;
  private readonly _onKeyDownBound: (e: KeyboardEvent) => void;

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public get settings(): Readonly<GameSettingsData> {
    return this._settings;
  }

  constructor(options: SettingsMenuOptions) {
    this._settings = options.initialSettings
      ? { ...options.initialSettings }
      : loadGameSettings();
    this._onChange = options.onChange;
    this._onOpenChange = options.onOpenChange;
    this._onSound = options.onSound;
    this._onRestartLevel = options.onRestartLevel;
    this._onKeyDownBound = (e: KeyboardEvent): void => this._handleKeyDown(e);

    if (typeof document !== "undefined" && options.parent) {
      ensureFontsAndStyles();
      this._buildDom(options.parent);
      window.addEventListener("keydown", this._onKeyDownBound);
      this._refreshAllRows();
    }
  }

  public open(): void {
    if (this._isOpen) {
      return;
    }
    this._isOpen = true;
    if (this._backdropEl) {
      this._backdropEl.classList.add("is-open");
    }
    if (this._triggerBtn) {
      this._triggerBtn.style.display = "none";
    }
    this._startSkullAnimation();
    this._setActiveRow(this._activeIndex);
    this._onSound?.("open");
    this._onOpenChange?.(true);
  }

  public close(): void {
    if (!this._isOpen) {
      return;
    }
    this._isOpen = false;
    this._stopSkullAnimation();
    this._activeSliderCleanup?.();
    this._activeSliderCleanup = null;
    if (this._backdropEl) {
      this._backdropEl.classList.remove("is-open");
    }
    if (this._triggerBtn) {
      this._triggerBtn.style.display = "";
    }
    this._onSound?.("close");
    this._onOpenChange?.(false);
  }

  public toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public resetToDefaults(): void {
    this._settings = { ...DEFAULT_GAME_SETTINGS };
    this._onSound?.("move");
    this._commitChanges();
  }

  public destroy(): void {
    this._stopSkullAnimation();
    this._activeSliderCleanup?.();
    this._activeSliderCleanup = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._onKeyDownBound);
    }
    if (this._layerEl) {
      this._layerEl.remove();
    }
  }

  private _startSkullAnimation(): void {
    this._stopSkullAnimation();
    this._skullFrame = 1;
    this._applySkullFrame();
    if (typeof setInterval !== "undefined") {
      this._skullTimer = setInterval((): void => {
        this._skullFrame = this._skullFrame === 1 ? 2 : 1;
        this._applySkullFrame();
      }, 280);
    }
  }

  private _stopSkullAnimation(): void {
    if (this._skullTimer !== null) {
      clearInterval(this._skullTimer);
      this._skullTimer = null;
    }
  }

  private _applySkullFrame(): void {
    const url = `url('/assets/dungeon_pack/ui/m_skull${this._skullFrame}.webp')`;
    for (let i = 0; i < this._rows.length; i++) {
      this._rows[i]!.skullEl.style.backgroundImage = url;
    }
  }

  private _buildDom(parent: HTMLElement): void {
    this._layerEl = document.createElement("div");
    this._layerEl.id = "yad-settings-layer";
    this._layerEl.className = "yad-settings-layer";

    this._triggerBtn = document.createElement("button");
    this._triggerBtn.type = "button";
    this._triggerBtn.className = "yad-settings-trigger";
    this._triggerBtn.textContent = "[ESC] SETTINGS";
    this._triggerBtn.addEventListener("click", (e: MouseEvent): void => {
      e.stopPropagation();
      this.open();
    });
    this._layerEl.appendChild(this._triggerBtn);

    this._backdropEl = document.createElement("div");
    this._backdropEl.id = "yad-settings-overlay";
    this._backdropEl.className = "yad-settings-backdrop";
    this._backdropEl.addEventListener("click", (e: MouseEvent): void => {
      if (e.target === this._backdropEl) {
        this.close();
      }
    });

    const title = document.createElement("h2");
    title.className = "yad-settings-title";
    title.textContent = "Game Settings";
    this._backdropEl.appendChild(title);

    const frame = document.createElement("div");
    frame.className = "yad-settings-frame";
    frame.addEventListener("click", (e: MouseEvent): void => {
      e.stopPropagation();
    });

    const appendCell = (cls: string): HTMLDivElement => {
      const cell = document.createElement("div");
      cell.className = cls;
      frame.appendChild(cell);
      return cell;
    };

    appendCell("yad-brdr-tl");
    appendCell("yad-brdr-t");
    appendCell("yad-brdr-tr");
    appendCell("yad-brdr-l");

    const panel = appendCell("yad-settings-panel");

    this._addSelectorRow<RenderResolution>(
      panel,
      "resolution",
      "Resolution",
      RESOLUTION_OPTIONS,
      (v: RenderResolution): string => v.toUpperCase(),
    );
    this._addSelectorRow<number>(panel, "fov", "Field of View", FOV_OPTIONS, (v: number): string => {
      return `${v} DEG`;
    });
    this._addSelectorRow<CrosshairMode>(
      panel,
      "crosshair",
      "Crosshair",
      CROSSHAIR_OPTIONS,
      (v: CrosshairMode): string => v.toUpperCase(),
    );
    this._addToggleRow(panel, "retroQuantize", "Retro Quantize");
    this._addToggleRow(panel, "tankControls", "Tank Controls");
    this._addToggleRow(panel, "viewBobbing", "View Bobbing");
    this._addSliderRow(panel, "overallBrightness", "Overall Brightness", 0.5, 2.0, 0.05);
    this._addSliderRow(panel, "levelBrightness", "Level Brightness", 0.5, 2.0, 0.05);
    this._addSliderRow(panel, "masterVolume", "Master Volume", 0.0, 1.0, 0.05);
    this._addSliderRow(panel, "sfxVolume", "SFX Volume", 0.0, 1.0, 0.05);
    this._addSliderRow(panel, "musicVolume", "Music Volume", 0.0, 1.0, 0.05);
    this._addSliderRow(panel, "reverbLevel", "Reverb Level", 0.0, 1.0, 0.05);
    this._addSelectorRow<LevelId>(
      panel,
      "level",
      "Level",
      LEVEL_OPTIONS,
      (v: LevelId): string => (v === "e1m1" ? "DOOM E1M1" : "YAD GRID"),
    );

    const footer = document.createElement("div");
    footer.className = "yad-settings-footer";

    this._readoutEl = document.createElement("span");
    this._readoutEl.className = "yad-settings-readout";
    footer.appendChild(this._readoutEl);

    const actions = document.createElement("div");
    actions.className = "yad-settings-actions";

    if (this._onRestartLevel) {
      const restartBtn = document.createElement("button");
      restartBtn.type = "button";
      restartBtn.className = "yad-settings-action-btn";
      restartBtn.textContent = "RESTART";
      restartBtn.addEventListener("click", (): void => {
        this._onSound?.("open");
        this._onRestartLevel?.();
      });
      actions.appendChild(restartBtn);
    }

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "yad-settings-action-btn";
    resetBtn.textContent = "RESET";
    resetBtn.addEventListener("click", (): void => this.resetToDefaults());
    actions.appendChild(resetBtn);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "yad-settings-action-btn";
    closeBtn.textContent = "BACK (ESC)";
    closeBtn.addEventListener("click", (): void => this.close());
    actions.appendChild(closeBtn);

    footer.appendChild(actions);
    panel.appendChild(footer);

    appendCell("yad-brdr-r");
    appendCell("yad-brdr-bl");
    appendCell("yad-brdr-b");
    appendCell("yad-brdr-br");

    this._backdropEl.appendChild(frame);
    this._layerEl.appendChild(this._backdropEl);
    parent.appendChild(this._layerEl);
    this._applySkullFrame();
  }

  private _createRowShell(
    panel: HTMLElement,
    key: SettingKey,
    label: string,
  ): {
    rowEl: HTMLDivElement;
    skullEl: HTMLDivElement;
    controlEl: HTMLDivElement;
    index: number;
  } {
    const index = this._rows.length;
    const rowEl = document.createElement("div");
    rowEl.className = "yad-settings-row";
    rowEl.dataset["setting"] = key;

    const leftEl = document.createElement("div");
    leftEl.className = "yad-row-left";

    const skullEl = document.createElement("div");
    skullEl.className = "yad-skull-cursor";

    const labelEl = document.createElement("span");
    labelEl.className = "yad-settings-label";
    labelEl.textContent = label;

    leftEl.appendChild(skullEl);
    leftEl.appendChild(labelEl);

    const controlEl = document.createElement("div");
    controlEl.className = "yad-settings-control";

    rowEl.appendChild(leftEl);
    rowEl.appendChild(controlEl);
    rowEl.addEventListener("mouseenter", (): void => {
      if (this._activeIndex !== index) {
        this._setActiveRow(index);
      }
    });
    panel.appendChild(rowEl);

    return { rowEl, skullEl, controlEl, index };
  }

  private _createLsBox(isToggle: boolean): { box: HTMLDivElement; center: HTMLDivElement } {
    const box = document.createElement("div");
    box.className = "yad-ls-box";

    const left = document.createElement("div");
    left.className = "yad-ls-left";
    const center = document.createElement("div");
    center.className = isToggle ? "yad-ls-center is-toggle" : "yad-ls-center";
    const right = document.createElement("div");
    right.className = "yad-ls-right";

    box.appendChild(left);
    box.appendChild(center);
    box.appendChild(right);
    return { box, center };
  }

  private _addSelectorRow<
    T extends
      | GameSettingsData["resolution"]
      | GameSettingsData["fov"]
      | GameSettingsData["crosshair"]
      | GameSettingsData["level"],
  >(
    panel: HTMLElement,
    key: "resolution" | "fov" | "crosshair" | "level",
    label: string,
    choices: readonly T[],
    format: (value: T) => string,
  ): void {
    const { rowEl, skullEl, controlEl, index } = this._createRowShell(panel, key, label);

    const wrapper = document.createElement("div");
    wrapper.className = "yad-selector";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "yad-arrow-btn";
    prevBtn.setAttribute("aria-label", `Previous ${label}`);
    const prevIcon = document.createElement("span");
    prevIcon.className = "yad-arrow-icon left";
    prevBtn.appendChild(prevIcon);

    const { box, center } = this._createLsBox(false);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "yad-arrow-btn";
    nextBtn.setAttribute("aria-label", `Next ${label}`);
    const nextIcon = document.createElement("span");
    nextIcon.className = "yad-arrow-icon right";
    nextBtn.appendChild(nextIcon);

    const cycle = (delta: number): void => {
      this._setActiveRow(index);
      const current = this._settings[key] as T;
      const curIdx = choices.indexOf(current);
      const baseIdx = curIdx === -1 ? 0 : curIdx;
      const nextIdx = (baseIdx + (delta >= 0 ? 1 : -1) + choices.length) % choices.length;
      const nextVal = choices[nextIdx]!;
      if (key === "resolution") {
        this._settings.resolution = nextVal as RenderResolution;
      } else if (key === "fov") {
        this._settings.fov = nextVal as number;
      } else if (key === "crosshair") {
        this._settings.crosshair = nextVal as CrosshairMode;
      } else {
        this._settings.level = nextVal as LevelId;
      }
      this._onSound?.("move");
      this._commitChanges();
    };

    prevBtn.addEventListener("click", (e: MouseEvent): void => {
      e.stopPropagation();
      cycle(-1);
    });
    nextBtn.addEventListener("click", (e: MouseEvent): void => {
      e.stopPropagation();
      cycle(1);
    });
    box.addEventListener("click", (): void => cycle(1));

    wrapper.appendChild(prevBtn);
    wrapper.appendChild(box);
    wrapper.appendChild(nextBtn);
    controlEl.appendChild(wrapper);

    this._rows.push({
      key,
      label,
      rowEl,
      skullEl,
      updateVisual: (): void => {
        center.textContent = format(this._settings[key] as T);
      },
      step: cycle,
      activate: (): void => cycle(1),
    });
  }

  private _addToggleRow(
    panel: HTMLElement,
    key: "retroQuantize" | "tankControls" | "viewBobbing",
    label: string,
  ): void {
    const { rowEl, skullEl, controlEl, index } = this._createRowShell(panel, key, label);

    const { box, center } = this._createLsBox(true);
    box.setAttribute("role", "switch");
    controlEl.appendChild(box);

    const toggleValue = (): void => {
      this._setActiveRow(index);
      this._settings[key] = !this._settings[key];
      this._onSound?.("move");
      this._commitChanges();
    };

    rowEl.addEventListener("click", (): void => toggleValue());

    this._rows.push({
      key,
      label,
      rowEl,
      skullEl,
      updateVisual: (): void => {
        const checked = this._settings[key];
        center.textContent = checked ? "ON" : "OFF";
        center.classList.toggle("is-on", checked);
        center.classList.toggle("is-off", !checked);
        box.setAttribute("aria-checked", checked ? "true" : "false");
      },
      step: (): void => toggleValue(),
      activate: toggleValue,
    });
  }

  private _addSliderRow(
    panel: HTMLElement,
    key:
      | "overallBrightness"
      | "levelBrightness"
      | "masterVolume"
      | "sfxVolume"
      | "musicVolume"
      | "reverbLevel",
    label: string,
    min: number,
    max: number,
    stepAmount: number,
  ): void {
    const { rowEl, skullEl, controlEl, index } = this._createRowShell(panel, key, label);

    const slider = document.createElement("div");
    slider.className = "yad-therm-slider";

    const leftCap = document.createElement("div");
    leftCap.className = "yad-therm-left";
    const midTrack = document.createElement("div");
    midTrack.className = "yad-therm-mid";
    const rightCap = document.createElement("div");
    rightCap.className = "yad-therm-right";
    const knob = document.createElement("div");
    knob.className = "yad-therm-knob";

    midTrack.appendChild(knob);
    slider.appendChild(leftCap);
    slider.appendChild(midTrack);
    slider.appendChild(rightCap);
    controlEl.appendChild(slider);

    const setFromRatio = (ratio: number): void => {
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      const rawValue = min + clampedRatio * (max - min);
      const snapped = Math.round(rawValue / stepAmount) * stepAmount;
      const finalValue = Number(Math.min(max, Math.max(min, snapped)).toFixed(2));
      if (this._settings[key] !== finalValue) {
        this._settings[key] = finalValue;
        this._commitChanges();
      }
    };

    const updateFromClientX = (clientX: number): void => {
      const rect = midTrack.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      setFromRatio((clientX - rect.left) / rect.width);
    };

    slider.addEventListener("pointerdown", (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      this._setActiveRow(index);
      updateFromClientX(e.clientX);

      const onMove = (moveEvt: PointerEvent): void => {
        updateFromClientX(moveEvt.clientX);
      };
      const cleanup = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        this._activeSliderCleanup = null;
        this._onSound?.("move");
      };

      this._activeSliderCleanup?.();
      this._activeSliderCleanup = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    });

    this._rows.push({
      key,
      label,
      rowEl,
      skullEl,
      updateVisual: (): void => {
        const val = this._settings[key];
        const pct = ((val - min) / (max - min)) * 100;
        knob.style.left = `${Math.min(100, Math.max(0, pct))}%`;
        slider.title = this._formatValue(key);
      },
      step: (delta: number): void => {
        const cur = this._settings[key];
        const next = Number(
          Math.min(max, Math.max(min, cur + (delta >= 0 ? stepAmount : -stepAmount))).toFixed(2),
        );
        if (next !== cur) {
          this._settings[key] = next;
          this._onSound?.("move");
          this._commitChanges();
        }
      },
    });
  }

  private _setActiveRow(index: number): void {
    if (this._rows.length === 0) {
      return;
    }
    const normalized = ((index % this._rows.length) + this._rows.length) % this._rows.length;
    this._activeIndex = normalized;
    for (let i = 0; i < this._rows.length; i++) {
      this._rows[i]!.rowEl.classList.toggle("is-active", i === normalized);
    }
    this._updateReadout();
  }

  private _formatValue(key: SettingKey): string {
    switch (key) {
      case "resolution": {
        const res = this._settings.resolution;
        const scale =
          res === "320x200"
            ? "1X DOS"
            : res === "640x400"
              ? "2X CRISPY"
              : res === "960x600"
                ? "3X"
                : "4X";
        return `${res.toUpperCase()} (${scale})`;
      }
      case "fov":
        return `${this._settings.fov} DEG`;
      case "crosshair":
        return this._settings.crosshair.toUpperCase();
      case "retroQuantize":
        return this._settings.retroQuantize ? "ON (8-STEP)" : "OFF";
      case "tankControls":
        return this._settings.tankControls ? "ON (A/D TURN)" : "OFF (STRAFE)";
      case "viewBobbing":
        return this._settings.viewBobbing ? "ON" : "OFF";
      case "overallBrightness":
        return `${Math.round(this._settings.overallBrightness * 100)}%`;
      case "levelBrightness":
        return `${Math.round(this._settings.levelBrightness * 100)}%`;
      case "masterVolume":
        return `${Math.round(this._settings.masterVolume * 100)}%`;
      case "sfxVolume":
        return `${Math.round(this._settings.sfxVolume * 100)}%`;
      case "musicVolume":
        return `${Math.round(this._settings.musicVolume * 100)}%`;
      case "reverbLevel":
        return `${Math.round(this._settings.reverbLevel * 100)}%`;
      case "level":
        return this._settings.level === "e1m1" ? "DOOM E1M1" : "YAD GRID";
    }
  }

  private _updateReadout(): void {
    if (!this._readoutEl || this._rows.length === 0) {
      return;
    }
    const row = this._rows[this._activeIndex]!;
    this._readoutEl.textContent = `${row.label.toUpperCase()}: ${this._formatValue(row.key)}`;
  }

  private _refreshAllRows(): void {
    for (let i = 0; i < this._rows.length; i++) {
      this._rows[i]!.updateVisual();
    }
    this._updateReadout();
  }

  private _commitChanges(): void {
    saveGameSettings(this._settings);
    this._refreshAllRows();
    this._onChange({ ...this._settings });
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
      return;
    }

    if (!this._isOpen || this._rows.length === 0) {
      return;
    }

    const row = this._rows[this._activeIndex]!;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      e.stopPropagation();
      this._setActiveRow(this._activeIndex - 1);
      this._onSound?.("move");
    } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      e.stopPropagation();
      this._setActiveRow(this._activeIndex + 1);
      this._onSound?.("move");
    } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      e.preventDefault();
      e.stopPropagation();
      row.step(-1);
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      e.preventDefault();
      e.stopPropagation();
      row.step(1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (row.activate) {
        row.activate();
      }
    }
  }
}
