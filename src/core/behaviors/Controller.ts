import { FirstPersonController, Keys, Raycaster, Vector2D } from "@small-world-machine/engine";
import type {
  AudioSystem,
  CameraInterfaceData,
  Collidable,
  EventDispatcherImpl,
  FirstPersonControllerOptions,
  Object3D,
} from "@small-world-machine/engine";
import { Events } from "../../Events.js";
import { ObjectTags } from "../../enums/ObjectTags.js";
import { EnemyBehavior } from "./EnemyBehavior.js";
import type { HazardGrid } from "../LevelBuilder.js";

export interface ControllerOptions extends FirstPersonControllerOptions {
  /** Audio system for footstep, shot and hurt sounds. */
  audio?: AudioSystem;
  /** Spatial hazard lookup for O(1) lava and slime damage. */
  hazardGrid?: HazardGrid;
}

/**
 * A retro style controller for forward/backward movement and left/right rotation.
 * It extends FirstPersonController and adds shooting, weapon selection, and damage logic.
 */
export class Controller extends FirstPersonController {
  private _lastShotTime: number = -1000;
  private _lastHurtTime: number = -1000;

  private _audio?: AudioSystem | undefined;
  private _hazardGrid?: HazardGrid | undefined;
  private _raycaster: Raycaster = new Raycaster();
  private _screenCenter: Vector2D = new Vector2D(0, 0);
  private _queryHits: Collidable[] = [];

  /**
   * Creates a new Controller.
   * @param events The event bus
   * @param options The configuration options.
   */
  constructor(
    private events: EventDispatcherImpl,
    options: ControllerOptions = {},
  ) {
    // Force retro tank controls for Dungeon feel
    const { audio, hazardGrid, ...baseOptions } = options;
    super({ ...baseOptions, retroTankControls: true });
    this._audio = audio;
    this._hazardGrid = hazardGrid;
    if (!options.input) throw new Error("Controller requires an 'input' option.");
  }

  public get retroTankControls(): boolean {
    return this._options.retroTankControls;
  }

  public set retroTankControls(value: boolean) {
    this._options.retroTankControls = value;
  }

  public override update(deltaTime: number): void {
    if (!this.enabled || !this.target) {
      return;
    }

    // 1. Let the base FirstPersonController handle movement, rotation, bobbing, and collision
    super.update(deltaTime);

    const isCamera = "updateProjectionMatrix" in this.target;

    // 2. Play Footsteps (base class calculates distanceMoved)
    if (this.distanceMoved > 2.0) {
      // Play footstep every 2 units moved
      if (this._audio) this._audio.play("footstep", false, 0.4);
      this.distanceMoved = 0;
    }

    // 3. Weapon Selection (Keys 1-6)
    for (let i = 1; i <= 6; i++) {
      if (
        this._options.input.isPressed(i.toString() as Keys) ||
        this._options.input.isPressed(`Digit${i}` as Keys)
      ) {
        this.events.dispatchEvent(Events.WEAPON, { index: i });
      }
    }

    // 4. Shoot
    const now = performance.now();
    if (this._options.input.isPressed(Keys.SPACE) && now - this._lastShotTime > 500) {
      this._lastShotTime = now;
      if (this._audio) this._audio.play("shoot", false, 0.6);
      this.events.dispatchEvent(Events.SHOOT);

      // Raycast for Enemies
      if (this._options.scene && isCamera) {
        this._raycaster.setFromCamera(
          this._screenCenter,
          this.target as unknown as CameraInterfaceData,
        );

        const scene = this._options.scene;
        let candidates: readonly Object3D[] = scene.objects;
        if (scene.staticOctree || scene.dynamicOctree || scene.spatialHash) {
          this._queryHits.length = 0;
          if (scene.staticOctree) {
            scene.staticOctree.queryRay(this._raycaster.ray, this._queryHits);
          }
          if (scene.dynamicOctree) {
            scene.dynamicOctree.queryRay(this._raycaster.ray, this._queryHits);
          }
          if (scene.spatialHash) {
            scene.spatialHash.queryRay(this._raycaster.ray, this._queryHits);
          }
          candidates = this._queryHits as Object3D[];
        }

        // intersectObjects sorts by distance closest to furthest by default
        const intersects = this._raycaster.intersectObjects(candidates as Object3D[], true);

        for (const intersect of intersects) {
          const obj = intersect.object;

          if (obj.tag === ObjectTags.ENEMY && obj.isVisible && obj.scale.y > 0.5) {
            // HIT AN ENEMY! Encapsulated death handling without leaking internal node mutations
            const enemyBehavior = obj.behaviors.find((b): b is EnemyBehavior => b instanceof EnemyBehavior);
            if (enemyBehavior) {
              enemyBehavior.kill(this._audio);
            } else {
              obj.tag = ObjectTags.DEAD_ENEMY;
              obj.scale.y = 0.2;
              obj.position.y = 0.2;
              if (this._audio) {
                this._audio.playSpatial("enemy_death", obj.position, false, 0.8, 2.0, 20.0);
              }
            }
            break; // Bullet stops at the enemy
          }

          // If we hit a door first, the bullet stops! (Walls are a single merged
          // InstancedMesh, not individual collidable objects, so they can't be tagged here.)
          if (obj.tag === ObjectTags.DOOR) {
            break;
          }
        }
      }
    }

    // 5. Environment checks: O(1) HazardGrid lookup (Lava / Slime Damage) instead of O(N) scene scans
    if (this._hazardGrid && now - this._lastHurtTime > 1000) {
      const hazard = this._hazardGrid.getHazardAt(this.target.position.x, this.target.position.z);
      if (hazard) {
        this._lastHurtTime = now;
        if (this._audio) this._audio.play("hurt", false, 0.8);

        // Dispatch custom event for HUD
        this.events.dispatchEvent(Events.DAMAGE, { amount: 10 });
      }
    }
  }
}
