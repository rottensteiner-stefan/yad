import {
  Behavior,
  BoundingSphere,
  BoundingType,
  Collision,
  MathPool,
} from "@small-world-machine/engine";
import type {
  AudioSystem,
  BoundingBox,
  CameraInterfaceData,
  Collidable,
  Object3D,
  Scene,
} from "@small-world-machine/engine";
import { ObjectTags } from "../../enums/ObjectTags.js";
import type { WadPhysics } from "../wad/WadPhysics.js";

export interface EnemyBehaviorOptions {
  player: CameraInterfaceData;
  scene: Scene;
  audio?: AudioSystem | undefined;
  speed?: number;
  detectionRange?: number;
  maxHealth?: number;
  isPaused?: () => boolean;
  wadPhysics?: WadPhysics | undefined;
  sightSound?: string;
  painSound?: string;
  activeSound?: string;
  deathSound?: string;
}

export class EnemyBehavior extends Behavior {
  private _player: CameraInterfaceData;
  private _scene: Scene;
  private _speed: number;
  private _detectionRange: number;
  private _health: number;
  private _collider?: BoundingSphere;
  private _potentialHits: Collidable[] = [];
  private _audio?: AudioSystem | undefined;
  private _gruntTimer: number = 0;
  private _isPaused?: (() => boolean) | undefined;
  private _wadPhysics?: WadPhysics | undefined;
  private _awakened = false;
  private _sightSound?: string | undefined;
  private _painSound: string;
  private _activeSound: string;
  private _deathSound: string;

  constructor(options: EnemyBehaviorOptions) {
    super();
    this._player = options.player;
    this._scene = options.scene;
    this._audio = options.audio;
    this._speed = options.speed ?? 3.0;
    this._detectionRange = options.detectionRange ?? 20.0;
    this._health = options.maxHealth ?? 10;
    this._isPaused = options.isPaused;
    this._wadPhysics = options.wadPhysics;
    this._sightSound = options.sightSound;
    this._painSound = options.painSound ?? "enemy_grunt";
    this._activeSound = options.activeSound ?? "enemy_grunt";
    this._deathSound = options.deathSound ?? "enemy_death";
  }

  public get health(): number {
    return this._health;
  }

  public override onAttach(target: Object3D): void {
    super.onAttach(target);
    this._collider = new BoundingSphere(target.position.clone(), 0.5);
  }

  public takeDamage(amount: number, audio?: AudioSystem): boolean {
    if (!this.target) return false;
    const targetObj = this.target as Object3D;
    if (targetObj.tag === ObjectTags.DEAD_ENEMY) return false;

    this._health -= amount;
    this._awakened = true;
    if (this._health <= 0) {
      this._health = 0;
      this.kill(audio);
      return true;
    }

    const audioToUse = audio ?? this._audio;
    if (audioToUse) {
      audioToUse.playSpatial(this._painSound, targetObj.position, false, 0.7, 2.0, 25.0);
    }
    return false;
  }

  public kill(audio?: AudioSystem): void {
    if (!this.target) return;
    const targetObj = this.target as Object3D;
    if (targetObj.tag === ObjectTags.DEAD_ENEMY) return;

    const floorY = this._wadPhysics
      ? this._wadPhysics.getFloorHeightWorld(targetObj.position.x, targetObj.position.z)
      : 0;

    targetObj.tag = ObjectTags.DEAD_ENEMY;
    targetObj.scale.y = 0.2; // squash to "dead"
    targetObj.position.y = floorY + 0.2; // drop to sector floor

    const audioToUse = audio ?? this._audio;
    if (audioToUse) {
      audioToUse.playSpatial(this._deathSound, targetObj.position, false, 0.8, 2.0, 20.0);
    }

    // Stop and detach all behaviors from target
    const behaviors = [...targetObj.behaviors];
    for (const b of behaviors) {
      targetObj.removeBehavior(b);
    }
  }

  public override update(deltaTime: number): void {
    if (this._isPaused?.()) return;
    if (!this.target || (this.target as Object3D).tag === ObjectTags.DEAD_ENEMY) return;

    const dx = this._player.position.x - this.target.position.x;
    const dz = this._player.position.z - this.target.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > this._detectionRange || distance < 1.5) {
      return; // Too far away or already close enough to attack
    }

    const nx = dx / distance;
    const nz = dz / distance;

    if (!this._awakened) {
      if (this._wadPhysics) {
        const wallDist = this._wadPhysics.raycastWallDistance(
          this.target.position.x,
          this.target.position.z,
          nx,
          nz,
        );
        if (wallDist < distance) {
          return; // Player not yet in line of sight
        }
      }
      this._awakened = true;
      if (this._audio && this._sightSound) {
        this._audio.playSpatial(this._sightSound, this.target.position, false, 0.65, 2.5, 28.0);
        this._gruntTimer = 3.0 + Math.random() * 4.0;
      }
    }

    // Play random active sound spatially
    this._gruntTimer -= deltaTime;
    if (this._gruntTimer <= 0) {
      if (this._audio)
        this._audio.playSpatial(this._activeSound, this.target.position, false, 0.5, 2.0, 25.0);
      this._gruntTimer = 3.0 + Math.random() * 5.0; // Grunt every 3-8 seconds
    }

    this.target.position.x += nx * this._speed * deltaTime;
    this.target.position.z += nz * this._speed * deltaTime;

    if (this._wadPhysics) {
      const floorY = this._wadPhysics.resolveEnemy(this.target.position, 0.55);
      this.target.position.y = floorY + (this.target as Object3D).scale.y * 0.5;
      return;
    }

    // Resolve collisions
    this._resolveCollisions();
  }

  private _resolveCollisions(): void {
    if (!this.target || !this._collider) return;
    this._collider.center.copyFrom(this.target.position);
    this._collider.center.y += 0.5; // Offset slightly up

    this._potentialHits.length = 0;
    if (this._scene.staticOctree)
      this._scene.staticOctree.queryVolume(this._collider, this._potentialHits);
    if (this._scene.spatialHash) this._scene.spatialHash.query(this._collider, this._potentialHits);

    const correction = MathPool.acquireVector().set(0, 0, 0);
    const hitCorrection = MathPool.acquireVector();

    for (const obj of this._potentialHits) {
      if (!obj.bounds || obj === this.target) continue;
      let resolved: boolean;
      if (BoundingType.SPHERE === obj.bounds.type) {
        resolved = Collision.resolveSphereSphere(
          this._collider,
          obj.bounds as BoundingSphere,
          hitCorrection,
        );
      } else {
        resolved = Collision.resolveSphereBox(
          this._collider,
          obj.bounds as BoundingBox,
          hitCorrection,
        );
      }

      if (resolved) {
        correction.add(hitCorrection);
        this._collider.center.add(hitCorrection); // update sphere center iteratively
      }
    }

    this.target.position.add(correction);
    MathPool.releaseVector(correction);
    MathPool.releaseVector(hitCorrection);
  }
}
