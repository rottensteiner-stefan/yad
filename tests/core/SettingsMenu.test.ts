import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_STORAGE_KEY,
  loadGameSettings,
  sanitizeGameSettings,
  saveGameSettings,
} from "../../src/core/GameSettings.js";
import type { GameSettingsData } from "../../src/core/GameSettings.js";
import { SettingsMenu } from "../../src/core/SettingsMenu.js";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

interface MockElement {
  id: string;
  className: string;
  type: string;
  textContent: string;
  innerHTML: string;
  title: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  children: MockElement[];
  attributes: Record<string, string>;
  classList: {
    _set: Set<string>;
    add: (cls: string) => void;
    remove: (cls: string) => void;
    toggle: (cls: string, force?: boolean) => void;
    contains: (cls: string) => boolean;
  };
  appendChild: (child: MockElement) => MockElement;
  addEventListener: (type: string, fn: (...args: unknown[]) => void) => void;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | undefined;
  remove: () => void;
}

function createMockElement(): MockElement {
  const classes = new Set<string>();
  const children: MockElement[] = [];
  const attributes: Record<string, string> = {};

  const el: MockElement = {
    id: "",
    className: "",
    type: "",
    textContent: "",
    innerHTML: "",
    title: "",
    style: {},
    dataset: {},
    children,
    attributes,
    classList: {
      _set: classes,
      add: (cls: string): void => {
        classes.add(cls);
      },
      remove: (cls: string): void => {
        classes.delete(cls);
      },
      toggle: (cls: string, force?: boolean): void => {
        if (force === undefined) {
          if (classes.has(cls)) classes.delete(cls);
          else classes.add(cls);
        } else if (force) {
          classes.add(cls);
        } else {
          classes.delete(cls);
        }
      },
      contains: (cls: string): boolean => classes.has(cls),
    },
    appendChild: (child: MockElement): MockElement => {
      children.push(child);
      return child;
    },
    addEventListener: (): void => {},
    setAttribute: (k: string, v: string): void => {
      attributes[k] = v;
    },
    getAttribute: (k: string): string | undefined => attributes[k],
    remove: (): void => {},
  };

  return el;
}

describe("GameSettings", () => {
  const prevStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: createMemoryStorage(),
    });
  });

  afterEach(() => {
    if (prevStorage) {
      Object.defineProperty(globalThis, "localStorage", prevStorage);
    }
  });

  it("sanitizes invalid numbers, bounds, and unknown FOV/crosshair values", () => {
    const cleaned = sanitizeGameSettings({
      fov: 999,
      crosshair: "invalid" as unknown as "dot",
      overallBrightness: 10,
      levelBrightness: -3,
      masterVolume: 2.5,
      sfxVolume: -1,
      musicVolume: Number.NaN,
      reverbLevel: 5,
      retroQuantize: false,
      tankControls: false,
      viewBobbing: false,
    });

    expect(cleaned.fov).toBe(DEFAULT_GAME_SETTINGS.fov);
    expect(cleaned.crosshair).toBe(DEFAULT_GAME_SETTINGS.crosshair);
    expect(cleaned.overallBrightness).toBe(2.0);
    expect(cleaned.levelBrightness).toBe(0.5);
    expect(cleaned.masterVolume).toBe(1.0);
    expect(cleaned.sfxVolume).toBe(0.0);
    expect(cleaned.musicVolume).toBe(DEFAULT_GAME_SETTINGS.musicVolume);
    expect(cleaned.reverbLevel).toBe(1.0);
    expect(cleaned.retroQuantize).toBe(false);
    expect(cleaned.tankControls).toBe(false);
    expect(cleaned.viewBobbing).toBe(false);
  });

  it("persists and loads settings from localStorage and recovers from invalid JSON", () => {
    const custom: GameSettingsData = {
      ...DEFAULT_GAME_SETTINGS,
      fov: 90,
      crosshair: "cross",
      masterVolume: 0.45,
      reverbLevel: 0.65,
      retroQuantize: false,
      viewBobbing: false,
    };
    saveGameSettings(custom);

    expect(loadGameSettings()).toEqual(custom);

    localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, "{broken-json");
    expect(loadGameSettings()).toEqual(DEFAULT_GAME_SETTINGS);
  });
});

describe("SettingsMenu", () => {
  const prevStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const prevDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const prevWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  let keyListeners: Array<(e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => void> = [];

  beforeEach(() => {
    keyListeners = [];
    const head = createMockElement();
    const byId = new Map<string, MockElement>();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        head: {
          appendChild: (el: MockElement): MockElement => {
            if (el.id) byId.set(el.id, el);
            return head.appendChild(el);
          },
        },
        getElementById: (id: string): MockElement | null => byId.get(id) ?? null,
        createElement: (): MockElement => createMockElement(),
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: (
          type: string,
          fn: (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => void,
        ): void => {
          if (type === "keydown") keyListeners.push(fn);
        },
        removeEventListener: (
          type: string,
          fn: (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => void,
        ): void => {
          if (type === "keydown") {
            keyListeners = keyListeners.filter((l) => l !== fn);
          }
        },
      },
    });
  });

  afterEach(() => {
    if (prevStorage) Object.defineProperty(globalThis, "localStorage", prevStorage);
    if (prevDocument) Object.defineProperty(globalThis, "document", prevDocument);
    if (prevWindow) Object.defineProperty(globalThis, "window", prevWindow);
  });

  function pressKey(key: string): void {
    const evt = { key, preventDefault: (): void => {}, stopPropagation: (): void => {} };
    for (const listener of keyListeners) {
      listener(evt);
    }
  }

  it("toggles visibility with Escape and updates settings via keyboard navigation", () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const onSound = vi.fn();
    const parent = createMockElement();

    const menu = new SettingsMenu({
      parent: parent as unknown as HTMLElement,
      onChange,
      onOpenChange,
      onSound,
    });

    expect(menu.isOpen).toBe(false);

    // Open via Escape
    pressKey("Escape");
    expect(menu.isOpen).toBe(true);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(onSound).toHaveBeenLastCalledWith("open");

    // Row 0 is FOV (75 -> 90 on ArrowRight)
    pressKey("ArrowRight");
    expect(menu.settings.fov).toBe(90);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fov: 90 }));

    // Row 1 is Crosshair (dot -> cross on ArrowRight)
    pressKey("ArrowDown");
    pressKey("ArrowRight");
    expect(menu.settings.crosshair).toBe("cross");

    // Row 2 is Retro Quantize (true -> false on Enter)
    pressKey("ArrowDown");
    pressKey("Enter");
    expect(menu.settings.retroQuantize).toBe(false);

    // Row 3 -> 4 -> 5 is Overall Brightness (1.0 -> 1.05 on ArrowRight)
    pressKey("ArrowDown");
    pressKey("ArrowDown");
    pressKey("ArrowDown");
    pressKey("ArrowRight");
    expect(menu.settings.overallBrightness).toBe(1.05);

    // Saved to localStorage
    expect(loadGameSettings().fov).toBe(90);
    expect(loadGameSettings().crosshair).toBe("cross");
    expect(loadGameSettings().retroQuantize).toBe(false);
    expect(loadGameSettings().overallBrightness).toBe(1.05);

    // Reset restores defaults
    menu.resetToDefaults();
    expect(menu.settings).toEqual(DEFAULT_GAME_SETTINGS);

    // Close via Escape
    pressKey("Escape");
    expect(menu.isOpen).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onSound).toHaveBeenLastCalledWith("close");

    menu.destroy();
    expect(keyListeners.length).toBe(0);
  });
});
