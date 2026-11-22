import { describe, expect, it } from "vitest";
import { Hud } from "../../src/core/Hud.js";
import { Events } from "../../src/Events.js";
import { EventDispatcherImpl } from "@small-world-machine/engine";

describe("Hud", () => {
  it("initializes hud container and responds to damage and pickup events", () => {
    const events = new EventDispatcherImpl();
    const hud = new Hud(events);

    expect(hud).toBeDefined();
    expect(hud.health).toBe(100);
    expect(hud.armor).toBe(0);
    expect(hud.ammo).toBe(50);

    // Dispatch damage event (no armor -> health takes 20 damage)
    events.dispatchEvent(Events.DAMAGE, { amount: 20 });
    expect(hud.health).toBe(80);

    // Dispatch pickup events
    events.dispatchEvent(Events.PICKUP, { itemType: "armor", amount: 50 });
    expect(hud.armor).toBe(50);

    events.dispatchEvent(Events.PICKUP, { itemType: "health", amount: 10 });
    expect(hud.health).toBe(90);

    events.dispatchEvent(Events.PICKUP, { itemType: "ammo", amount: 10 });
    expect(hud.ammo).toBe(60);

    events.dispatchEvent(Events.PICKUP, { itemType: "keycard", amount: 1, color: "blue" });
    expect(hud.keycards).toContain("blue");

    // Dispatch shoot event (decrements ammo)
    events.dispatchEvent(Events.SHOOT);
    expect(hud.ammo).toBe(59);

    // Dispatch weapon select event
    events.dispatchEvent(Events.WEAPON, { index: 2 });
  });
});
