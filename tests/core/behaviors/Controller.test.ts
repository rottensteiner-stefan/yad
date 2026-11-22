import { describe, expect, it } from "vitest";
import { Controller } from "../../../src/core/behaviors/Controller.js";
import { EnemyBehavior } from "../../../src/core/behaviors/EnemyBehavior.js";
import { HazardGrid } from "../../../src/core/LevelBuilder.js";
import { Events } from "../../../src/Events.js";
import { ObjectTags } from "../../../src/enums/ObjectTags.js";
import {
  Camera,
  Cube,
  EventDispatcherImpl,
  Input,
  Keys,
  Object3D,
  PerspectiveProjection,
  Scene,
} from "@small-world-machine/engine";

describe("Controller", () => {
  it("dispatches Events.WEAPON when number key is pressed", () => {
    const events = new EventDispatcherImpl();
    const input = new Input();
    const scene = new Scene();
    const camera = new Camera(new PerspectiveProjection());

    const controller = new Controller(events, { input, scene });
    camera.addBehavior(controller);

    let weaponIndex = 0;
    events.addEventListener(Events.WEAPON, (e: Record<string, unknown>) => {
      weaponIndex = (e as { index: number }).index;
    });

    // Keys.D2 is 'Digit2'
    (input as unknown as { _keys: Map<string, boolean> })._keys.set(Keys.D2, true);
    controller.update(0.016);

    expect(weaponIndex).toBe(2);
  });

  it("triggers damage via O(1) HazardGrid lookup when player steps on hazard", () => {
    const events = new EventDispatcherImpl();
    const input = new Input();
    const scene = new Scene();
    const hazardGrid = new HazardGrid(2.0);
    hazardGrid.addHazard(4, 4, ObjectTags.LAVA);

    const camera = new Camera(new PerspectiveProjection());
    camera.position.set(4, 0, 4); // Standing right on the hazard

    const controller = new Controller(events, { input, scene, hazardGrid });
    camera.addBehavior(controller);

    let damageAmount = 0;
    events.addEventListener(Events.DAMAGE, (e: Record<string, unknown>) => {
      damageAmount = (e as { amount: number }).amount;
    });

    controller.update(0.016);
    expect(damageAmount).toBe(10);
  });

  it("kills an enemy by delegating to EnemyBehavior.kill() when raycast hits", () => {
    const events = new EventDispatcherImpl();
    const input = new Input();
    const scene = new Scene();

    const camera = new Camera(new PerspectiveProjection());
    camera.position.set(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateViewMatrix();

    const controller = new Controller(events, { input, scene });
    camera.addBehavior(controller);

    // Create an enemy directly in front of the camera (negative Z)
    const enemy = new Object3D("test_enemy");
    enemy.geometry = new Cube({ size: 2 }).getGeometryData();
    enemy.position.set(0, 0, -5);
    enemy.tag = ObjectTags.ENEMY;
    enemy.scale.set(1, 2, 1);
    enemy.updateMatrixWorld();
    enemy.computeBounds();

    const enemyBehavior = new EnemyBehavior({ player: camera, scene });
    enemy.addBehavior(enemyBehavior);
    scene.add(enemy);

    // Simulate spacebar pressed to shoot
    (input as unknown as { _keys: Map<string, boolean> })._keys.set(Keys.SPACE, true);
    controller.update(0.016);

    expect(enemy.tag).toBe(ObjectTags.DEAD_ENEMY);
    expect(enemy.scale.y).toBeCloseTo(0.2);
    expect(enemy.behaviors.length).toBe(0);
  });

  it("unlocks picked-up weapons, toggles Fist/Chainsaw on slot 1, and deals rocket splash damage", () => {
    const events = new EventDispatcherImpl();
    const input = new Input();
    const scene = new Scene();
    const camera = new Camera(new PerspectiveProjection());
    camera.position.set(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateViewMatrix();

    const controller = new Controller(events, { input, scene });
    camera.addBehavior(controller);

    // Slot 3 locked initially; picking up Chainsaw & Rocket unlocks them
    const keys = (input as unknown as { _keys: Map<string, boolean> })._keys;
    keys.set(Keys.D3, true);
    controller.update(0.016);
    expect(controller.activeWeapon).toBe("pistol");
    keys.set(Keys.D3, false);
    controller.update(0.016);

    events.dispatchEvent(Events.PICKUP, { itemType: "weapon", weaponId: "chainsaw", amount: 0 });
    expect(controller.activeWeapon).toBe("chainsaw");

    // Pressing 1 cycles chainsaw -> fist
    keys.set(Keys.D1, true);
    controller.update(0.016);
    expect(controller.activeWeapon).toBe("fist");
    keys.set(Keys.D1, false);
    controller.update(0.016);

    // Pickup rocket launcher + test splash onto bystander enemy
    events.dispatchEvent(Events.PICKUP, { itemType: "weapon", weaponId: "rocket", amount: 4 });
    expect(controller.activeWeapon).toBe("rocket");

    const directEnemy = new Object3D("direct_enemy");
    directEnemy.geometry = new Cube({ size: 2 }).getGeometryData();
    directEnemy.position.set(0, 0, -6);
    directEnemy.tag = ObjectTags.ENEMY;
    directEnemy.scale.set(1, 2, 1);
    directEnemy.updateMatrixWorld();
    directEnemy.computeBounds();
    directEnemy.addBehavior(new EnemyBehavior({ player: camera, scene, maxHealth: 45 }));
    scene.add(directEnemy);

    const sideEnemy = new Object3D("side_enemy");
    sideEnemy.geometry = new Cube({ size: 2 }).getGeometryData();
    sideEnemy.position.set(2.5, 0, -6); // within rocket splashRadius 5.5
    sideEnemy.tag = ObjectTags.ENEMY;
    sideEnemy.scale.set(1, 2, 1);
    sideEnemy.updateMatrixWorld();
    sideEnemy.computeBounds();
    sideEnemy.addBehavior(new EnemyBehavior({ player: camera, scene, maxHealth: 45 }));
    scene.add(sideEnemy);

    keys.set(Keys.SPACE, true);
    controller.update(0.016);

    expect(directEnemy.tag).toBe(ObjectTags.DEAD_ENEMY);
    expect(sideEnemy.tag).toBe(ObjectTags.DEAD_ENEMY);
  });

  it("latches quick digit keydown taps across frames when attached to window", () => {
    const prevWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const listeners = new Map<string, (e: { code: string; key: string; repeat: boolean }) => void>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: (
          type: string,
          fn: (e: { code: string; key: string; repeat: boolean }) => void,
        ): void => {
          listeners.set(type, fn);
        },
        removeEventListener: (type: string): void => {
          listeners.delete(type);
        },
      },
    });

    try {
      const events = new EventDispatcherImpl();
      const input = new Input();
      const scene = new Scene();
      const camera = new Camera(new PerspectiveProjection());
      const controller = new Controller(events, { input, scene });
      camera.addBehavior(controller);

      events.dispatchEvent(Events.PICKUP, { itemType: "weapon", weaponId: "shotgun", amount: 8 });
      events.dispatchEvent(Events.PICKUP, { itemType: "weapon", weaponId: "pistol", amount: 0 });
      expect(controller.activeWeapon).toBe("pistol");

      const keydown = listeners.get("keydown");
      expect(keydown).toBeDefined();
      keydown?.({ code: "Digit3", key: "3", repeat: false });
      controller.update(0.016);
      expect(controller.activeWeapon).toBe("shotgun");

      controller.onDetach();
      expect(listeners.has("keydown")).toBe(false);
    } finally {
      if (prevWindow) Object.defineProperty(globalThis, "window", prevWindow);
      else delete (globalThis as { window?: unknown }).window;
    }
  });
});
