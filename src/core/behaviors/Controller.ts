import { FirstPersonController, Keys, Raycaster, Vector2D, Vector3D } from "@small-world-machine/engine";
import type {
  AudioSystem,
  CameraInterfaceData,
  Collidable,
  EventDispatcherImpl,
  FirstPersonControllerOptions,
  Object3D,
} from "@small-world-machine/engine";
import { Events } from "../../Events.js";
import type { PickupPayload, WeaponPayload } from "../../Events.js";
import { ObjectTags } from "../../enums/ObjectTags.js";
import { EnemyBehavior } from "./EnemyBehavior.js";
import type { HazardGrid } from "../LevelBuilder.js";
import type { WadPhysics } from "../wad/WadPhysics.js";
import { resolveWeaponForSlot, WEAPONS } from "../WeaponConfig.js";
import type { AmmoType, WeaponId } from "../WeaponConfig.js";

export interface ControllerOptions extends FirstPersonControllerOptions {
  /** Audio system for footstep, shot and hurt sounds. */
  audio?: AudioSystem;
  /** Spatial hazard lookup for O(1) lava and slime damage. */
  hazardGrid?: HazardGrid;
  /** Doom WAD BSP height & linedef sliding collision solver. */
  wadPhysics?: WadPhysics;
  /** Optional ammo check callback (e.g., wired to Hud.getAmmo). */
  hasAmmo?: (type: AmmoType) => boolean;
}

/**
 * A retro style controller for forward/backward movement and left/right rotation.
 * It extends FirstPersonController and adds shooting, multi-weapon selection, and damage logic.
 */
export class Controller extends FirstPersonController {
  private _lastShotTime: number = -1000;
  private _lastHurtTime: number = -1000;
  private _lastUseTime: number = -1000;

  private _audio?: AudioSystem | undefined;
  private _hazardGrid?: HazardGrid | undefined;
  private _wadPhysics?: WadPhysics | undefined;
  private _hasAmmo?: ((type: AmmoType) => boolean) | undefined;
  private _raycaster: Raycaster = new Raycaster();
  private _screenCenter: Vector2D = new Vector2D(0, 0);
  private _queryHits: Collidable[] = [];
  private _baseDir: Vector3D = new Vector3D(0, 0, -1);
  private _impactPos: Vector3D = new Vector3D(0, 0, 0);

  private _ownedWeapons: Set<WeaponId> = new Set(["fist", "pistol"]);
  private _activeWeapon: WeaponId = "pistol";
  private _prevDigitPressed: boolean[] = [false, false, false, false, false, false, false];
  private _queuedSlotMask: number = 0;

  private readonly _onDigitKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || e.repeat) return;
    let slot = 0;
    if (e.code >= "Digit1" && e.code <= "Digit6") {
      slot = e.code.charCodeAt(5) - 48;
    } else if (e.key >= "1" && e.key <= "6") {
      slot = e.key.charCodeAt(0) - 48;
    }
    if (slot >= 1 && slot <= 6) {
      this._queuedSlotMask |= 1 << slot;
    }
  };

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
    const { audio, hazardGrid, wadPhysics, hasAmmo, ...baseOptions } = options;
    super({
      ...baseOptions,
      retroTankControls: options.retroTankControls ?? true,
      ...(wadPhysics ? { enableCollision: false } : {}),
    });
    this._audio = audio;
    this._hazardGrid = hazardGrid;
    this._wadPhysics = wadPhysics;
    this._hasAmmo = hasAmmo;
    if (!options.input) throw new Error("Controller requires an 'input' option.");

    this.events.addEventListener(Events.PICKUP, (e: Record<string, unknown>): void => {
      const payload = e as unknown as PickupPayload;
      const type = payload.itemType ?? (payload.type !== Events.PICKUP ? payload.type : undefined);
      if (type === "weapon" && payload.weaponId) {
        this._ownedWeapons.add(payload.weaponId);
        this._activeWeapon = payload.weaponId;
      }
    });

    this.events.addEventListener(Events.WEAPON, (e: Record<string, unknown>): void => {
      const payload = e as unknown as WeaponPayload;
      if (payload.weaponId) {
        this._ownedWeapons.add(payload.weaponId);
        this._activeWeapon = payload.weaponId;
      }
    });
  }

  public override onAttach(target: Object3D): void {
    super.onAttach(target);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this._onDigitKeyDown);
    }
  }

  public override onDetach(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._onDigitKeyDown);
    }
    super.onDetach();
  }

  public get activeWeapon(): WeaponId {
    return this._activeWeapon;
  }

  public get retroTankControls(): boolean {
    return this._options.retroTankControls;
  }

  public set retroTankControls(value: boolean) {
    this._options.retroTankControls = value;
  }

  private _hasAmmoFor(weaponId: WeaponId): boolean {
    const def = WEAPONS[weaponId];
    if (!def.ammoType) return true;
    return this._hasAmmo ? this._hasAmmo(def.ammoType) : true;
  }

  private _applyDamage(obj: Object3D, damage: number): void {
    const enemyBehavior = obj.behaviors.find((b): b is EnemyBehavior => b instanceof EnemyBehavior);
    if (enemyBehavior) {
      enemyBehavior.takeDamage(damage, this._audio);
      return;
    }
    obj.tag = ObjectTags.DEAD_ENEMY;
    obj.scale.y = 0.2;
    obj.position.y = 0.2;
    if (this._audio) {
      this._audio.playSpatial("enemy_death", obj.position, false, 0.8, 2.0, 20.0);
    }
  }

  private _selectFallbackWeapon(): void {
    const order: readonly WeaponId[] = ["shotgun", "chaingun", "pistol", "chainsaw", "fist"];
    for (const candidate of order) {
      if (this._ownedWeapons.has(candidate) && this._hasAmmoFor(candidate)) {
        this._activeWeapon = candidate;
        this.events.dispatchEvent(Events.WEAPON, {
          index: WEAPONS[candidate].slot,
          weaponId: candidate,
        });
        return;
      }
    }
  }

  public override update(deltaTime: number): void {
    if (!this.enabled || !this.target) {
      return;
    }

    const prevX = this.target.position.x;
    const prevZ = this.target.position.z;

    // 1. Let the base FirstPersonController handle movement, rotation, bobbing, and grid collision
    super.update(deltaTime);

    if (this._wadPhysics) {
      this._wadPhysics.resolvePlayer(this.target, prevX, prevZ, deltaTime);
      this._wadPhysics.updateMovers(deltaTime, this.target.position.x, this.target.position.z);
    }

    const isCamera = "updateProjectionMatrix" in this.target;
    const now = performance.now();

    // 1.5 Use key (E) for WAD doors, switches, lifts, and level exit
    if (this._wadPhysics && this._options.input.isPressed(Keys.E) && now - this._lastUseTime > 250) {
      this._lastUseTime = now;
      this._wadPhysics.triggerUse(this.target.position.x, this.target.position.z);
    }

    // 2. Play Footsteps (base class calculates distanceMoved)
    if (this.distanceMoved > 2.0) {
      if (this._audio) this._audio.play("footstep", false, 0.4);
      this.distanceMoved = 0;
    }

    // 3. Weapon Selection (Keys 1-6, rising-edge + latched tap buffer)
    const queuedMask = this._queuedSlotMask;
    this._queuedSlotMask = 0;
    for (let i = 1; i <= 6; i++) {
      const pressed =
        this._options.input.isPressed(i.toString() as Keys) ||
        this._options.input.isPressed(`Digit${i}` as Keys);
      const latched = (queuedMask & (1 << i)) !== 0;
      if ((pressed && !this._prevDigitPressed[i]) || latched) {
        const chosen = resolveWeaponForSlot(i, this._ownedWeapons, this._activeWeapon);
        if (chosen) {
          this._activeWeapon = chosen;
          if (chosen === "chainsaw" && this._audio) {
            this._audio.play("saw_up", false, 0.55);
          }
          this.events.dispatchEvent(Events.WEAPON, {
            index: WEAPONS[chosen].slot,
            weaponId: chosen,
          });
        }
      }
      this._prevDigitPressed[i] = pressed;
    }

    // 4. Shoot (Spacebar or Pointer-Locked Left Click)
    const firePressed =
      this._options.input.isPressed(Keys.SPACE) ||
      (this._options.input.mouse?.left === true && this._options.input.isPointerLocked);

    let def = WEAPONS[this._activeWeapon];
    if (firePressed && now - this._lastShotTime > def.cooldownMs) {
      if (!this._hasAmmoFor(this._activeWeapon)) {
        this._selectFallbackWeapon();
        def = WEAPONS[this._activeWeapon];
      }

      this._lastShotTime = now;
      if (this._audio) this._audio.play(def.sound, false, 0.6);
      this.events.dispatchEvent(Events.SHOOT, {
        weaponId: def.id,
        ammoType: def.ammoType,
        ammoCost: def.ammoPerShot,
      });

      // Raycast for Enemies across pellets
      if (this._options.scene && isCamera) {
        this._raycaster.setFromCamera(
          this._screenCenter,
          this.target as unknown as CameraInterfaceData,
        );
        this._baseDir.copyFrom(this._raycaster.ray.direction);

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

        let impactDist = Infinity;
        for (let p = 0; p < def.pellets; p++) {
          if (def.spreadRad > 0) {
            const offsetAngle =
              def.pellets > 1
                ? ((p / (def.pellets - 1)) - 0.5) * def.spreadRad + (Math.random() - 0.5) * 0.015
                : (Math.random() - 0.5) * def.spreadRad;
            const c = Math.cos(offsetAngle);
            const s = Math.sin(offsetAngle);
            this._raycaster.ray.direction
              .set(
                this._baseDir.x * c - this._baseDir.z * s,
                this._baseDir.y,
                this._baseDir.x * s + this._baseDir.z * c,
              )
              .normalize();
          } else {
            this._raycaster.ray.direction.copyFrom(this._baseDir);
          }

          const wallDist = this._wadPhysics
            ? this._wadPhysics.raycastWallDistance(
                this._raycaster.ray.origin.x,
                this._raycaster.ray.origin.z,
                this._raycaster.ray.direction.x,
                this._raycaster.ray.direction.z,
              )
            : Infinity;
          const maxDist = Math.min(wallDist, def.range);

          const intersects = this._raycaster.intersectObjects(candidates as Object3D[], true);
          let pelletHitDist = maxDist;

          for (const intersect of intersects) {
            if (intersect.distance > maxDist) break;
            const obj = intersect.object;

            if (obj.tag === ObjectTags.ENEMY && obj.isVisible && obj.scale.y > 0.5) {
              this._applyDamage(obj, def.damage);
              pelletHitDist = intersect.distance;
              break;
            }
            if (obj.tag === ObjectTags.DOOR) {
              pelletHitDist = intersect.distance;
              break;
            }
          }

          if (pelletHitDist < impactDist) {
            impactDist = pelletHitDist;
          }
        }

        // Rocket splash damage around impact point
        if (def.splashRadius > 0 && Number.isFinite(impactDist) && impactDist < def.range) {
          this._impactPos.set(
            this._raycaster.ray.origin.x + this._baseDir.x * impactDist,
            this._raycaster.ray.origin.y + this._baseDir.y * impactDist,
            this._raycaster.ray.origin.z + this._baseDir.z * impactDist,
          );
          if (this._audio) {
            this._audio.playSpatial("explosion", this._impactPos, false, 0.75, 4.0, 45.0);
          }
          const splashSq = def.splashRadius * def.splashRadius;
          for (let k = 0; k < scene.objects.length; k++) {
            const obj = scene.objects[k]!;
            if (obj.tag !== ObjectTags.ENEMY || !obj.isVisible || obj.scale.y <= 0.5) continue;
            const dx = obj.position.x - this._impactPos.x;
            const dz = obj.position.z - this._impactPos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq > 0.01 && dSq <= splashSq) {
              const dist = Math.sqrt(dSq);
              const splashDmg = Math.round(def.damage * (1 - dist / def.splashRadius));
              if (splashDmg > 0) {
                this._applyDamage(obj, splashDmg);
              }
            }
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

        this.events.dispatchEvent(Events.DAMAGE, { amount: 10 });
      }
    }
  }
}
