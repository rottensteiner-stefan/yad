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
});
