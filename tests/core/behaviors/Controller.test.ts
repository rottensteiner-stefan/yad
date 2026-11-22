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
});
