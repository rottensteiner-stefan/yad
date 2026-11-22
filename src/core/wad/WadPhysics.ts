import type { AudioSystem, EventDispatcherImpl, Object3D } from "@small-world-machine/engine";
import { Events } from "../../Events.js";
import { LINEDEF_FLAGS } from "./WadParser.js";
import type { WadLinedef, WadMapData, WadSector } from "./WadParser.js";

/** Scale factor converting classic Doom map units into Small World Machine world units (32 Doom units = 1.0 unit). */
export const WAD_SCALE = 1 / 32;
export const DOOM_EYE_HEIGHT = 41;
export const DOOM_PLAYER_HEIGHT = 56;
export const DOOM_PLAYER_RADIUS = 16;
export const DOOM_MAX_STEP_UP = 24;

export interface WadMover {
  sectorIndex: number;
  kind: "door_wait" | "door_stay" | "lift" | "floor_lower";
  baseHeight: number;
  targetHeight: number;
  currentHeight: number;
  speed: number;
  state: "idle" | "moving_to_target" | "waiting" | "returning" | "done";
  waitTimer: number;
  stayOpen: boolean;
  lockedColor?: "blue" | "yellow" | "red";
  node?: Object3D | undefined;
  initialNodeY: number;
}

export interface WadPhysicsOptions {
  map: WadMapData;
  audio?: AudioSystem | undefined;
  events?: EventDispatcherImpl | undefined;
  hasKeycard?: (color: "blue" | "yellow" | "red") => boolean;
  onExit?: () => void;
}

/**
 * Pure Doom BSP sector lookup, 2D linedef circle-sliding collision, doors, lifts, and floor damage.
 * Hot-path methods avoid heap allocations.
 */
export class WadPhysics {
  public readonly map: WadMapData;
  private readonly _audio?: AudioSystem | undefined;
  private readonly _events?: EventDispatcherImpl | undefined;
  private readonly _hasKeycard?: ((color: "blue" | "yellow" | "red") => boolean) | undefined;
  private readonly _onExit?: (() => void) | undefined;

  private readonly _moversBySector: Map<number, WadMover> = new Map();
  private readonly _movers: WadMover[] = [];
  private readonly _triggeredWalkLines: Set<number> = new Set();
  private readonly _triggeredSwitchLines: Set<number> = new Set();

  // Spatial grid for fast zero-GC linedef collision lookups (256 Doom units per cell).
  private readonly _cellSize = 256;
  private readonly _gridMinX: number;
  private readonly _gridMinY: number;
  private readonly _gridCols: number;
  private readonly _gridRows: number;
  private readonly _cellBuckets: number[][];
  private readonly _visitStamp: Uint32Array;
  private _stampGen = 1;

  // Scratch scalar outputs for zero-GC calls.
  private _outX = 0;
  private _outY = 0;
  private _playerEyeY = 0;
  private _playerEyeInitialized = false;
  private _lastHurtTime = -1000;
  private _exitTriggered = false;

  constructor(options: WadPhysicsOptions) {
    this.map = options.map;
    this._audio = options.audio;
    this._events = options.events;
    this._hasKeycard = options.hasKeycard;
    this._onExit = options.onExit;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of this.map.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    this._gridMinX = Number.isFinite(minX) ? minX - this._cellSize : -4096;
    this._gridMinY = Number.isFinite(minY) ? minY - this._cellSize : -4096;
    const spanX = Math.max(1, (Number.isFinite(maxX) ? maxX : 4096) - this._gridMinX + this._cellSize);
    const spanY = Math.max(1, (Number.isFinite(maxY) ? maxY : 4096) - this._gridMinY + this._cellSize);
    this._gridCols = Math.ceil(spanX / this._cellSize);
    this._gridRows = Math.ceil(spanY / this._cellSize);
    const cellCount = this._gridCols * this._gridRows;
    this._cellBuckets = Array.from({ length: cellCount }, () => []);
    this._visitStamp = new Uint32Array(this.map.linedefs.length);

    this._indexLinedefs();
    this._initMovers();
  }

  public get movers(): readonly WadMover[] {
    return this._movers;
  }

  public getMoverForSector(sectorIndex: number): WadMover | undefined {
    return this._moversBySector.get(sectorIndex);
  }

  public attachMoverNode(sectorIndex: number, node: Object3D): void {
    const mover = this._moversBySector.get(sectorIndex);
    if (!mover) return;
    mover.node = node;
    mover.initialNodeY = node.position.y;
  }

  /** Finds the BSP sector index containing Doom coordinates `(doomX, doomY)` in O(log N). */
  public findSectorIndexAtDoom(doomX: number, doomY: number): number {
    const nodes = this.map.nodes;
    if (nodes.length === 0) return 0;

    let id = nodes.length - 1;
    let guard = 0;
    while ((id & 0x8000) === 0 && guard < 1024) {
      const n = nodes[id]!;
      const side = n.dy * (doomX - n.x) - n.dx * (doomY - n.y);
      id = side > 0 ? n.rightChild : n.leftChild;
      guard++;
    }
    const ssIndex = id & 0x7fff;
    const ss = this.map.subsectors[ssIndex];
    if (!ss || ss.numSegs <= 0) return 0;
    const seg = this.map.segs[ss.firstSeg];
    if (!seg) return 0;
    const line = this.map.linedefs[seg.linedef];
    if (!line) return 0;
    const sdIndex = seg.side === 0 ? line.frontSidedef : line.backSidedef;
    const sd = this.map.sidedefs[sdIndex];
    return sd ? sd.sector : 0;
  }

  public findSectorAtWorld(worldX: number, worldZ: number): WadSector | undefined {
    const idx = this.findSectorIndexAtDoom(worldX / WAD_SCALE, -worldZ / WAD_SCALE);
    return this.map.sectors[idx];
  }

  public getFloorHeightWorld(worldX: number, worldZ: number): number {
    const sector = this.findSectorAtWorld(worldX, worldZ);
    return sector ? sector.floorHeight * WAD_SCALE : 0;
  }

  /**
   * Advances active doors/lifts/floors and triggers proximity door openings.
   */
  public updateMovers(deltaTime: number, playerWorldX: number, playerWorldZ: number): void {
    const px = playerWorldX / WAD_SCALE;
    const py = -playerWorldZ / WAD_SCALE;

    // Proximity-activate unlocked DR doors (smooth UX alongside pressing E)
    for (let i = 0; i < this.map.linedefs.length; i++) {
      const line = this.map.linedefs[i]!;
      const sp = line.special;
      if (sp === 1 || sp === 26 || sp === 27 || sp === 28 || sp === 117) {
        if (this._distanceSqToLinedef(px, py, line) <= 72 * 72) {
          this._activateDoorLinedef(line);
        }
      } else if (sp === 2 || sp === 88) {
        // Walkover triggers when crossing or stepping onto the trigger line
        if (this._distanceSqToLinedef(px, py, line) <= 24 * 24) {
          if (sp === 2 && !this._triggeredWalkLines.has(i)) {
            this._triggeredWalkLines.add(i);
            this._activateTaggedMovers(line.tag);
          } else if (sp === 88) {
            this._activateTaggedMovers(line.tag);
          }
        }
      }
    }

    for (let i = 0; i < this._movers.length; i++) {
      const m = this._movers[i]!;
      const sec = this.map.sectors[m.sectorIndex];
      if (!sec || m.state === "idle" || m.state === "done") continue;

      if (m.state === "moving_to_target") {
        const dir = m.targetHeight >= m.currentHeight ? 1 : -1;
        m.currentHeight += dir * m.speed * deltaTime;
        if ((dir > 0 && m.currentHeight >= m.targetHeight) || (dir < 0 && m.currentHeight <= m.targetHeight)) {
          m.currentHeight = m.targetHeight;
          m.state = m.stayOpen ? "done" : "waiting";
          m.waitTimer = m.kind === "lift" ? 3.0 : 4.0;
        }
      } else if (m.state === "waiting") {
        m.waitTimer -= deltaTime;
        if (m.waitTimer <= 0) {
          // Don't close a door right on top of the player
          if (m.kind === "door_wait" && this.findSectorIndexAtDoom(px, py) === m.sectorIndex) {
            m.waitTimer = 0.5;
          } else {
            m.state = "returning";
            this._playMoverSound(m, true);
          }
        }
      } else if (m.state === "returning") {
        const dir = m.baseHeight >= m.currentHeight ? 1 : -1;
        m.currentHeight += dir * m.speed * deltaTime;
        if ((dir > 0 && m.currentHeight >= m.baseHeight) || (dir < 0 && m.currentHeight <= m.baseHeight)) {
          m.currentHeight = m.baseHeight;
          m.state = "idle";
        }
      }

      if (m.kind === "door_wait" || m.kind === "door_stay") {
        sec.ceilingHeight = m.currentHeight;
      } else {
        sec.floorHeight = m.currentHeight;
      }

      if (m.node) {
        m.node.position.y = m.initialNodeY + (m.currentHeight - m.baseHeight) * WAD_SCALE;
        m.node.updateMatrixWorld();
      }
    }
  }

  /** Handles player Use key (`E`) for doors, lifts, switches, and level exit. */
  public triggerUse(playerWorldX: number, playerWorldZ: number): void {
    const px = playerWorldX / WAD_SCALE;
    const py = -playerWorldZ / WAD_SCALE;
    const maxDistSq = 84 * 84;

    for (let i = 0; i < this.map.linedefs.length; i++) {
      const line = this.map.linedefs[i]!;
      const sp = line.special;
      if (sp === 0) continue;
      if (this._distanceSqToLinedef(px, py, line) > maxDistSq) continue;

      if (sp === 1 || sp === 26 || sp === 27 || sp === 28 || sp === 117) {
        this._activateDoorLinedef(line, true);
      } else if (sp === 62) {
        this._activateTaggedMovers(line.tag);
      } else if (sp === 23 && !this._triggeredSwitchLines.has(i)) {
        this._triggeredSwitchLines.add(i);
        if (this._audio) this._audio.play("switch", false, 0.75);
        this._activateTaggedMovers(line.tag);
      } else if (sp === 11 && !this._exitTriggered) {
        this._exitTriggered = true;
        if (this._audio) this._audio.play("switch", false, 0.85);
        this._onExit?.();
      }
    }
  }

  /**
   * Resolves player XZ collision against solid/high-step Doom linedefs and updates vertical eye height.
   * Zero heap allocations.
   */
  public resolvePlayer(
    target: { position: { x: number; y: number; z: number } },
    prevWorldX: number,
    prevWorldZ: number,
    deltaTime: number,
  ): void {
    const prevDoomX = prevWorldX / WAD_SCALE;
    const prevDoomY = -prevWorldZ / WAD_SCALE;
    const startSectorIdx = this.findSectorIndexAtDoom(prevDoomX, prevDoomY);
    const startFloor = this.map.sectors[startSectorIdx]?.floorHeight ?? 0;

    let curDoomX = target.position.x / WAD_SCALE;
    let curDoomY = -target.position.z / WAD_SCALE;

    this._resolveCircleDoom(curDoomX, curDoomY, DOOM_PLAYER_RADIUS, startFloor, false);
    curDoomX = this._outX;
    curDoomY = this._outY;

    target.position.x = curDoomX * WAD_SCALE;
    target.position.z = -curDoomY * WAD_SCALE;

    const endSectorIdx = this.findSectorIndexAtDoom(curDoomX, curDoomY);
    const endSector = this.map.sectors[endSectorIdx];
    const targetEyeY = ((endSector ? endSector.floorHeight : startFloor) + DOOM_EYE_HEIGHT) * WAD_SCALE;

    if (!this._playerEyeInitialized) {
      this._playerEyeY = targetEyeY;
      this._playerEyeInitialized = true;
    } else if (this._playerEyeY < targetEyeY) {
      // Crisp step-up for Doom stairs
      const stepDelta = Math.min(targetEyeY - this._playerEyeY, 14.0 * deltaTime);
      this._playerEyeY += stepDelta;
      if (targetEyeY - this._playerEyeY < 0.005) this._playerEyeY = targetEyeY;
    } else if (this._playerEyeY > targetEyeY) {
      // Smooth gravity drop off ledges
      const dropDelta = Math.min(this._playerEyeY - targetEyeY, 18.0 * deltaTime);
      this._playerEyeY -= dropDelta;
      if (this._playerEyeY - targetEyeY < 0.005) this._playerEyeY = targetEyeY;
    }

    target.position.y = this._playerEyeY;

    // Sector damage (Nukage / Slime specials: 4, 5, 7, 16)
    if (endSector && (endSector.special === 4 || endSector.special === 5 || endSector.special === 7 || endSector.special === 16)) {
      const now = performance.now();
      if (now - this._lastHurtTime > 900) {
        this._lastHurtTime = now;
        if (this._audio) this._audio.play("hurt", false, 0.7);
        if (this._events) {
          this._events.dispatchEvent(Events.DAMAGE, {
            amount: endSector.special === 7 ? 5 : 10,
            source: "nukage",
          });
        }
      }
    }
  }

  /**
   * Resolves enemy XZ collision against Doom linedefs and returns the sector floor height in world units.
   */
  public resolveEnemy(
    position: { x: number; y: number; z: number },
    radiusWorld: number,
  ): number {
    const dx = position.x / WAD_SCALE;
    const dy = -position.z / WAD_SCALE;
    const secIdx = this.findSectorIndexAtDoom(dx, dy);
    const curFloor = this.map.sectors[secIdx]?.floorHeight ?? 0;

    this._resolveCircleDoom(dx, dy, radiusWorld / WAD_SCALE, curFloor, true);
    position.x = this._outX * WAD_SCALE;
    position.z = -this._outY * WAD_SCALE;

    const finalIdx = this.findSectorIndexAtDoom(this._outX, this._outY);
    return (this.map.sectors[finalIdx]?.floorHeight ?? curFloor) * WAD_SCALE;
  }

  /**
   * Returns the distance in world units to the closest blocking Doom wall along a 2D XZ ray,
   * or Infinity if no wall is hit. Used so hitscan shots cannot pass through solid walls.
   */
  public raycastWallDistance(
    originWorldX: number,
    originWorldZ: number,
    dirWorldX: number,
    dirWorldZ: number,
  ): number {
    const ox = originWorldX / WAD_SCALE;
    const oy = -originWorldZ / WAD_SCALE;
    const rdx = dirWorldX;
    const rdy = -dirWorldZ;
    let bestT = Infinity;

    for (let i = 0; i < this.map.linedefs.length; i++) {
      const line = this.map.linedefs[i]!;
      if (!this._isLineSolidForSight(line)) continue;
      const v1 = this.map.vertices[line.v1];
      const v2 = this.map.vertices[line.v2];
      if (!v1 || !v2) continue;

      const sdx = v2.x - v1.x;
      const sdy = v2.y - v1.y;
      const denom = rdx * sdy - rdy * sdx;
      if (Math.abs(denom) < 1e-6) continue;

      const qpx = v1.x - ox;
      const qpy = v1.y - oy;
      const t = (qpx * sdy - qpy * sdx) / denom;
      if (t < 0 || t >= bestT) continue;

      const u = (qpx * rdy - qpy * rdx) / denom;
      if (u >= 0 && u <= 1) {
        bestT = t;
      }
    }

    return bestT * WAD_SCALE;
  }

  private _isLineSolidForSight(line: WadLinedef): boolean {
    if (line.backSidedef === -1 || line.frontSidedef === -1) return true;
    const frontSec = this.map.sectors[this.map.sidedefs[line.frontSidedef]?.sector ?? -1];
    const backSec = this.map.sectors[this.map.sidedefs[line.backSidedef]?.sector ?? -1];
    if (!frontSec || !backSec) return true;
    const lowestCeil = Math.min(frontSec.ceilingHeight, backSec.ceilingHeight);
    const highestFloor = Math.max(frontSec.floorHeight, backSec.floorHeight);
    return lowestCeil <= highestFloor;
  }

  private _indexLinedefs(): void {
    for (let i = 0; i < this.map.linedefs.length; i++) {
      const line = this.map.linedefs[i]!;
      const v1 = this.map.vertices[line.v1];
      const v2 = this.map.vertices[line.v2];
      if (!v1 || !v2) continue;

      const minX = Math.min(v1.x, v2.x) - 32;
      const maxX = Math.max(v1.x, v2.x) + 32;
      const minY = Math.min(v1.y, v2.y) - 32;
      const maxY = Math.max(v1.y, v2.y) + 32;

      const c0 = Math.max(0, Math.floor((minX - this._gridMinX) / this._cellSize));
      const c1 = Math.min(this._gridCols - 1, Math.floor((maxX - this._gridMinX) / this._cellSize));
      const r0 = Math.max(0, Math.floor((minY - this._gridMinY) / this._cellSize));
      const r1 = Math.min(this._gridRows - 1, Math.floor((maxY - this._gridMinY) / this._cellSize));

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          this._cellBuckets[r * this._gridCols + c]!.push(i);
        }
      }
    }
  }

  private _initMovers(): void {
    // 1. Direct DR doors (backSidedef sector)
    for (const line of this.map.linedefs) {
      const sp = line.special;
      if ((sp === 1 || sp === 26 || sp === 27 || sp === 28 || sp === 117) && line.backSidedef !== -1) {
        const backSide = this.map.sidedefs[line.backSidedef];
        if (!backSide) continue;
        const secIdx = backSide.sector;
        if (this._moversBySector.has(secIdx)) continue;
        const sec = this.map.sectors[secIdx];
        if (!sec) continue;
        const openCeil = Math.max(sec.floorHeight, this._findLowestAdjacentCeiling(secIdx) - 4);
        const lockedColor =
          sp === 26 ? "blue" : sp === 27 ? "yellow" : sp === 28 ? "red" : undefined;
        const mover: WadMover = {
          sectorIndex: secIdx,
          kind: "door_wait",
          baseHeight: sec.ceilingHeight,
          targetHeight: openCeil,
          currentHeight: sec.ceilingHeight,
          speed: sp === 117 ? 180 : 90,
          state: "idle",
          waitTimer: 0,
          stayOpen: false,
          ...(lockedColor ? { lockedColor } : {}),
          initialNodeY: 0,
        };
        this._moversBySector.set(secIdx, mover);
        this._movers.push(mover);
      }
    }

    // 2. Tagged doors (2), lifts (62, 88), and floor-lower (23)
    const tagTypes = new Map<number, "door_stay" | "lift" | "floor_lower">();
    for (const line of this.map.linedefs) {
      if (line.tag === 0) continue;
      if (line.special === 2) tagTypes.set(line.tag, "door_stay");
      else if (line.special === 62 || line.special === 88) tagTypes.set(line.tag, "lift");
      else if (line.special === 23) tagTypes.set(line.tag, "floor_lower");
    }

    for (let secIdx = 0; secIdx < this.map.sectors.length; secIdx++) {
      const sec = this.map.sectors[secIdx]!;
      if (sec.tag === 0 || this._moversBySector.has(secIdx)) continue;
      const kind = tagTypes.get(sec.tag);
      if (!kind) continue;

      if (kind === "door_stay") {
        const openCeil = Math.max(sec.floorHeight, this._findLowestAdjacentCeiling(secIdx) - 4);
        const mover: WadMover = {
          sectorIndex: secIdx,
          kind: "door_stay",
          baseHeight: sec.ceilingHeight,
          targetHeight: openCeil,
          currentHeight: sec.ceilingHeight,
          speed: 90,
          state: "idle",
          waitTimer: 0,
          stayOpen: true,
          initialNodeY: 0,
        };
        this._moversBySector.set(secIdx, mover);
        this._movers.push(mover);
      } else {
        const lowestFloor = this._findLowestAdjacentFloor(secIdx);
        const mover: WadMover = {
          sectorIndex: secIdx,
          kind,
          baseHeight: sec.floorHeight,
          targetHeight: lowestFloor,
          currentHeight: sec.floorHeight,
          speed: 128,
          state: "idle",
          waitTimer: 0,
          stayOpen: kind === "floor_lower",
          initialNodeY: 0,
        };
        this._moversBySector.set(secIdx, mover);
        this._movers.push(mover);
      }
    }
  }

  private _findLowestAdjacentCeiling(sectorIdx: number): number {
    let lowest = Infinity;
    for (const line of this.map.linedefs) {
      if (line.frontSidedef === -1 || line.backSidedef === -1) continue;
      const s1 = this.map.sidedefs[line.frontSidedef]?.sector;
      const s2 = this.map.sidedefs[line.backSidedef]?.sector;
      if (s1 === sectorIdx && s2 !== undefined && s2 !== sectorIdx) {
        const c = this.map.sectors[s2]?.ceilingHeight ?? Infinity;
        if (c < lowest) lowest = c;
      } else if (s2 === sectorIdx && s1 !== undefined && s1 !== sectorIdx) {
        const c = this.map.sectors[s1]?.ceilingHeight ?? Infinity;
        if (c < lowest) lowest = c;
      }
    }
    return Number.isFinite(lowest) ? lowest : (this.map.sectors[sectorIdx]?.ceilingHeight ?? 128);
  }

  private _findLowestAdjacentFloor(sectorIdx: number): number {
    let lowest = this.map.sectors[sectorIdx]?.floorHeight ?? 0;
    for (const line of this.map.linedefs) {
      if (line.frontSidedef === -1 || line.backSidedef === -1) continue;
      const s1 = this.map.sidedefs[line.frontSidedef]?.sector;
      const s2 = this.map.sidedefs[line.backSidedef]?.sector;
      if (s1 === sectorIdx && s2 !== undefined && s2 !== sectorIdx) {
        const f = this.map.sectors[s2]?.floorHeight ?? lowest;
        if (f < lowest) lowest = f;
      } else if (s2 === sectorIdx && s1 !== undefined && s1 !== sectorIdx) {
        const f = this.map.sectors[s1]?.floorHeight ?? lowest;
        if (f < lowest) lowest = f;
      }
    }
    return lowest;
  }

  private _activateDoorLinedef(line: WadLinedef, fromUse: boolean = false): void {
    if (line.backSidedef === -1) return;
    const secIdx = this.map.sidedefs[line.backSidedef]?.sector;
    if (secIdx === undefined) return;
    const mover = this._moversBySector.get(secIdx);
    if (!mover) return;

    if (mover.lockedColor && this._hasKeycard && !this._hasKeycard(mover.lockedColor)) {
      if (fromUse && this._audio) {
        this._audio.play("locked", false, 0.75);
      }
      return;
    }

    if (mover.state === "idle" || mover.state === "returning") {
      mover.state = "moving_to_target";
      this._playMoverSound(mover, false);
    } else if (mover.state === "waiting") {
      mover.waitTimer = 4.0;
    }
  }

  private _activateTaggedMovers(tag: number): void {
    if (tag === 0) return;
    for (const m of this._movers) {
      const sec = this.map.sectors[m.sectorIndex];
      if (!sec || sec.tag !== tag) continue;
      if (m.state === "idle" || m.state === "returning") {
        m.state = "moving_to_target";
        this._playMoverSound(m, false);
      }
    }
  }

  private _playMoverSound(mover: WadMover, closing: boolean): void {
    if (!this._audio) return;
    const cue =
      mover.kind === "lift" || mover.kind === "floor_lower"
        ? "lift"
        : closing
          ? "door_close"
          : "door";
    if (mover.node) {
      this._audio.playSpatial(cue, mover.node.position, false, 0.75, 4.0, 40.0);
    } else {
      this._audio.play(cue, false, 0.7);
    }
  }

  private _distanceSqToLinedef(px: number, py: number, line: WadLinedef): number {
    const v1 = this.map.vertices[line.v1];
    const v2 = this.map.vertices[line.v2];
    if (!v1 || !v2) return Infinity;
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-6) {
      t = ((px - v1.x) * dx + (py - v1.y) * dy) / lenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const cx = v1.x + t * dx;
    const cy = v1.y + t * dy;
    const ex = px - cx;
    const ey = py - cy;
    return ex * ex + ey * ey;
  }

  private _resolveCircleDoom(
    startX: number,
    startY: number,
    radius: number,
    curFloor: number,
    isMonster: boolean,
  ): void {
    let x = startX;
    let y = startY;
    const rSq = radius * radius;

    for (let iter = 0; iter < 3; iter++) {
      this._stampGen++;
      if (this._stampGen >= 0xffffffff) {
        this._visitStamp.fill(0);
        this._stampGen = 1;
      }
      const stamp = this._stampGen;

      const c0 = Math.max(0, Math.floor((x - radius - this._gridMinX) / this._cellSize));
      const c1 = Math.min(this._gridCols - 1, Math.floor((x + radius - this._gridMinX) / this._cellSize));
      const r0 = Math.max(0, Math.floor((y - radius - this._gridMinY) / this._cellSize));
      const r1 = Math.min(this._gridRows - 1, Math.floor((y + radius - this._gridMinY) / this._cellSize));

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const bucket = this._cellBuckets[r * this._gridCols + c]!;
          for (let k = 0; k < bucket.length; k++) {
            const lineIdx = bucket[k]!;
            if (this._visitStamp[lineIdx] === stamp) continue;
            this._visitStamp[lineIdx] = stamp;

            const line = this.map.linedefs[lineIdx]!;
            if (!this._isLineBlocking(line, curFloor, isMonster)) continue;

            const v1 = this.map.vertices[line.v1];
            const v2 = this.map.vertices[line.v2];
            if (!v1 || !v2) continue;

            const ldx = v2.x - v1.x;
            const ldy = v2.y - v1.y;
            const lenSq = ldx * ldx + ldy * ldy;
            let t = 0;
            if (lenSq > 1e-6) {
              t = ((x - v1.x) * ldx + (y - v1.y) * ldy) / lenSq;
              if (t < 0) t = 0;
              else if (t > 1) t = 1;
            }
            const cx = v1.x + t * ldx;
            const cy = v1.y + t * ldy;
            const ex = x - cx;
            const ey = y - cy;
            const dSq = ex * ex + ey * ey;
            if (dSq >= rSq) continue;

            const d = Math.sqrt(dSq);
            if (d > 1e-5) {
              const push = radius - d;
              x += (ex / d) * push;
              y += (ey / d) * push;
            } else if (lenSq > 1e-6) {
              const lLen = Math.sqrt(lenSq);
              x += (ldy / lLen) * radius;
              y += (-ldx / lLen) * radius;
            }
          }
        }
      }
    }

    this._outX = x;
    this._outY = y;
  }

  private _isLineBlocking(line: WadLinedef, curFloor: number, isMonster: boolean): boolean {
    if (line.backSidedef === -1 || line.frontSidedef === -1) return true;
    if ((line.flags & LINEDEF_FLAGS.BLOCKING) !== 0) return true;
    if (isMonster && (line.flags & LINEDEF_FLAGS.BLOCK_MONSTERS) !== 0) return true;

    const frontSec = this.map.sectors[this.map.sidedefs[line.frontSidedef]?.sector ?? -1];
    const backSec = this.map.sectors[this.map.sidedefs[line.backSidedef]?.sector ?? -1];
    if (!frontSec || !backSec) return true;

    const highestFloor = Math.max(frontSec.floorHeight, backSec.floorHeight);
    const lowestCeil = Math.min(frontSec.ceilingHeight, backSec.ceilingHeight);

    if (lowestCeil - highestFloor < DOOM_PLAYER_HEIGHT) return true;
    if (lowestCeil - curFloor < DOOM_PLAYER_HEIGHT) return true;
    if (highestFloor - curFloor > DOOM_MAX_STEP_UP) return true;
    if (isMonster && curFloor - Math.min(frontSec.floorHeight, backSec.floorHeight) > DOOM_MAX_STEP_UP) {
      return true;
    }

    return false;
  }
}
