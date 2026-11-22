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
    expect(hud.activeWeapon).toBe("pistol");
  });

  it("tracks separate BULL/SHEL/RCKT/CELL ammo pools across weapon pickups and firing", () => {
    const events = new EventDispatcherImpl();
    const hud = new Hud(events);

    expect(hud.hasWeapon("fist")).toBe(true);
    expect(hud.hasWeapon("pistol")).toBe(true);
    expect(hud.hasWeapon("shotgun")).toBe(false);

    // Pick up Shotgun (+8 shells), auto-switches active weapon
    events.dispatchEvent(Events.PICKUP, {
      itemType: "weapon",
      weaponId: "shotgun",
      ammoType: "shel",
      amount: 8,
    });
    expect(hud.hasWeapon("shotgun")).toBe(true);
    expect(hud.activeWeapon).toBe("shotgun");
    expect(hud.getAmmo("shel")).toBe(8);
    expect(hud.ammo).toBe(8);

    events.dispatchEvent(Events.SHOOT, { weaponId: "shotgun", ammoType: "shel", ammoCost: 1 });
    expect(hud.getAmmo("shel")).toBe(7);
    expect(hud.getAmmo("bull")).toBe(50);

    // Pick up Rocket & Plasma ammo + weapons
    events.dispatchEvent(Events.PICKUP, {
      itemType: "weapon",
      weaponId: "rocket",
      ammoType: "rckt",
      amount: 2,
    });
    events.dispatchEvent(Events.PICKUP, {
      itemType: "ammo",
      ammoType: "rckt",
      amount: 5,
    });
    expect(hud.getAmmo("rckt")).toBe(7);

    events.dispatchEvent(Events.PICKUP, {
      itemType: "weapon",
      weaponId: "plasma",
      ammoType: "cell",
      amount: 40,
    });
    expect(hud.getAmmo("cell")).toBe(40);

    // Melee Fist uses no ammo
    events.dispatchEvent(Events.WEAPON, { index: 1, weaponId: "fist" });
    events.dispatchEvent(Events.SHOOT, { weaponId: "fist", ammoType: null, ammoCost: 0 });
    expect(hud.getAmmo("bull")).toBe(50);
    expect(hud.getAmmo("cell")).toBe(40);
  });

  it("tracks all 6 keycards and skull keys and lets skulls unlock matching color doors", () => {
    const events = new EventDispatcherImpl();
    const hud = new Hud(events);

    expect(hud.hasKeycard("red")).toBe(false);
    events.dispatchEvent(Events.PICKUP, { itemType: "keycard", amount: 1, color: "red_skull" });
    expect(hud.hasKeycard("red_skull")).toBe(true);
    expect(hud.hasKeycard("red")).toBe(true);

    events.dispatchEvent(Events.PICKUP, { itemType: "keycard", amount: 1, color: "yellow_skull" });
    events.dispatchEvent(Events.PICKUP, { itemType: "keycard", amount: 1, color: "blue_skull" });
    events.dispatchEvent(Events.PICKUP, { itemType: "keycard", amount: 1, color: "yellow" });
    expect(hud.keycards).toEqual(["red_skull", "yellow_skull", "blue_skull", "yellow"]);
  });
});
