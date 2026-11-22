import { describe, expect, it } from "vitest";
import { WeaponView } from "../../src/core/WeaponView.js";
import { EventDispatcherImpl } from "@small-world-machine/engine";

describe("WeaponView", () => {
  it("initializes and advances weapon shoot animation state correctly", () => {
    const events = new EventDispatcherImpl();
    const weaponView = new WeaponView({
      parent: undefined as unknown as HTMLElement,
      events,
    });

    expect(weaponView).toBeDefined();
    expect(weaponView.weaponFrame).toBe(0);
    expect(weaponView.isShooting).toBe(false);

    // Trigger shoot
    weaponView.triggerShoot();
    expect(weaponView.weaponFrame).toBe(1);
    expect(weaponView.isShooting).toBe(true);

    // Update timing: after 150ms frame should advance
    weaponView.update(0.15, 0.5);
    expect(weaponView.weaponFrame).toBeGreaterThan(1);

    // After animation completes (400ms total)
    weaponView.update(0.3, 0.5);
    expect(weaponView.weaponFrame).toBe(0);
    expect(weaponView.isShooting).toBe(false);

    // Trigger flash safely in headless environment
    weaponView.triggerFlash("rgba(255, 0, 0, 0.4)");
  });

  it("loads root-relative pistol sprites and redraws idle frame when shoot animation ends", () => {
    const events = new EventDispatcherImpl();
    const drawnSprites: string[] = [];

    const mockCtx = {
      clearRect: (): void => {},
      drawImage: (img: { src: string }): void => {
        drawnSprites.push(img.src);
      },
    };
    const mockParent = {
      appendChild: (): void => {},
    } as unknown as HTMLElement;

    const prevDocument = globalThis.document;
    const prevImage = globalThis.Image;

    class MockImage {
      public src: string = "";
      public complete: boolean = true;
      public naturalWidth: number = 64;
      public width: number = 64;
      public height: number = 64;
      public onload: (() => void) | null = null;
      constructor() {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string): Record<string, unknown> => {
          if (tag === "canvas") {
            return {
              width: 0,
              height: 0,
              style: {},
              getContext: (): typeof mockCtx => mockCtx,
            };
          }
          return { style: {}, offsetWidth: 0 };
        },
      },
    });
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: MockImage,
    });

    try {
      const weaponView = new WeaponView({ parent: mockParent, events });

      // Trigger shoot and advance until animation completes at bobPhase = 0
      weaponView.triggerShoot();
      drawnSprites.length = 0;

      weaponView.update(0.35, 0);
      weaponView.update(0.1, 0);

      expect(weaponView.weaponFrame).toBe(0);
      expect(drawnSprites.at(-1)).toBe("/assets/dungeon_pack/sprites/pisga0.webp");

      // Switch to Shotgun, Chaingun, Rocket, Plasma, Chainsaw and verify idle sprites draw
      events.dispatchEvent("app:yad:weapon", { index: 3, weaponId: "shotgun" });
      expect(weaponView.activeWeapon).toBe("shotgun");
      expect(drawnSprites.at(-1)).toBe("/assets/dungeon_pack/sprites/shtga0.webp");

      events.dispatchEvent("app:yad:pickup", { itemType: "weapon", weaponId: "plasma", amount: 40 });
      expect(weaponView.activeWeapon).toBe("plasma");
      expect(drawnSprites.at(-1)).toBe("/assets/dungeon_pack/sprites/plsga0.webp");

      events.dispatchEvent("app:yad:weapon", { index: 1, weaponId: "chainsaw" });
      expect(weaponView.activeWeapon).toBe("chainsaw");
      expect(drawnSprites.at(-1)).toBe("/assets/dungeon_pack/sprites/sawga0.webp");
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: prevDocument });
      Object.defineProperty(globalThis, "Image", { configurable: true, value: prevImage });
    }
  });
});

