import {
  BobbingBehavior,
  Color,
  CullMode,
  MathUtils,
  ModelGeometry,
  Object3D,
  PointLight,
  ProximitySensorBehavior,
  Sprite,
  SpriteMaterial,
  StandardMaterial,
  Texture,
  TextureFilter,
  TextureWrap,
  Vector3D,
} from "@small-world-machine/engine";
import type {
  AudioSystem,
  CameraInterfaceData,
  EventDispatcherImpl,
  Scene,
} from "@small-world-machine/engine";
import { Events } from "../../Events.js";
import { ObjectTags } from "../../enums/ObjectTags.js";
import { EnemyBehavior } from "../behaviors/EnemyBehavior.js";
import type { AmmoType, KeyId, WeaponId } from "../WeaponConfig.js";
import { LINEDEF_FLAGS } from "./WadParser.js";
import type { WadLinedef, WadMapData, WadSidedef, WadVertex } from "./WadParser.js";
import {
  DOOM_EYE_HEIGHT,
  WAD_SCALE,
  WadPhysics,
} from "./WadPhysics.js";

export interface WadManifest {
  textures: Record<string, [number, number]>;
  flats: Record<string, [number, number]>;
  sprites: Record<string, [number, number]>;
}

export interface WadLevelConfig {
  playerCamera?: CameraInterfaceData;
  audio?: AudioSystem | undefined;
  events?: EventDispatcherImpl | undefined;
  isPaused?: () => boolean;
  hasKeycard?: (color: "blue" | "yellow" | "red") => boolean;
  onExit?: () => void;
}

export interface WadBuildResult {
  playerStart: Vector3D;
  playerTheta: number;
  physics: WadPhysics;
  boundsMin: Vector3D;
  boundsMax: Vector3D;
}

interface GeomBatch {
  vertices: number[];
  uvs: number[];
  normals: number[];
  indices: number[];
}

interface Point2D {
  x: number;
  y: number;
}

function createEmptyBatch(): GeomBatch {
  return { vertices: [], uvs: [], normals: [], indices: [] };
}

function clipPolyHalfPlane(
  poly: Point2D[],
  nx: number,
  ny: number,
  dx: number,
  dy: number,
  keepRight: boolean,
): Point2D[] {
  const sign = keepRight ? 1 : -1;
  const out: Point2D[] = [];
  const count = poly.length;
  for (let i = 0; i < count; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % count]!;
    const da = sign * (dy * (a.x - nx) - dx * (a.y - ny));
    const db = sign * (dy * (b.x - nx) - dx * (b.y - ny));
    if (da >= -1e-4) out.push(a);
    if ((da > 1e-4 && db < -1e-4) || (da < -1e-4 && db > 1e-4)) {
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

function ensureCCW(poly: Point2D[]): Point2D[] {
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area2 += a.x * b.y - b.x * a.y;
  }
  return area2 < 0 ? [...poly].reverse() : poly;
}

/**
 * Reconstructs convex 2D polygons for every Doom BSP subsector by clipping the map bounds
 * down the `NODES` tree and trimming by each subsector's `SEGS`.
 */
export function buildSubsectorPolygons(map: WadMapData): Point2D[][] {
  const out: Point2D[][] = new Array(map.subsectors.length);
  if (map.nodes.length === 0 || map.vertices.length === 0) {
    return out;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of map.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  const rootPoly: Point2D[] = [
    { x: minX - 256, y: minY - 256 },
    { x: maxX + 256, y: minY - 256 },
    { x: maxX + 256, y: maxY + 256 },
    { x: minX - 256, y: maxY + 256 },
  ];

  const walk = (nodeId: number, poly: Point2D[]): void => {
    if (poly.length < 3) return;
    if ((nodeId & 0x8000) !== 0) {
      const ssIdx = nodeId & 0x7fff;
      const ss = map.subsectors[ssIdx];
      if (!ss) return;
      let trimmed = poly;
      for (let j = 0; j < ss.numSegs; j++) {
        const seg = map.segs[ss.firstSeg + j];
        if (!seg) continue;
        const v1 = map.vertices[seg.v1];
        const v2 = map.vertices[seg.v2];
        if (!v1 || !v2) continue;
        trimmed = clipPolyHalfPlane(trimmed, v1.x, v1.y, v2.x - v1.x, v2.y - v1.y, true);
        if (trimmed.length < 3) break;
      }
      if (trimmed.length >= 3) {
        out[ssIdx] = ensureCCW(trimmed);
      }
      return;
    }

    const node = map.nodes[nodeId];
    if (!node) return;
    walk(node.rightChild, clipPolyHalfPlane(poly, node.x, node.y, node.dx, node.dy, true));
    walk(node.leftChild, clipPolyHalfPlane(poly, node.x, node.y, node.dx, node.dy, false));
  };

  walk(map.nodes.length - 1, rootPoly);
  return out;
}

function quantizeLight(lightLevel: number): number {
  const normalized = Math.max(0, Math.min(255, lightLevel)) / 255;
  const bucket = Math.round(normalized * 8) / 8;
  return Number((0.45 + 0.55 * bucket).toFixed(3));
}

function appendFlatFan(
  batch: GeomBatch,
  poly: Point2D[],
  doomHeight: number,
  isCeiling: boolean,
  uvScale: number = 64,
): void {
  if (poly.length < 3) return;
  const baseIdx = batch.vertices.length / 3;
  const yWorld = doomHeight * WAD_SCALE;
  const ny = isCeiling ? -1 : 1;

  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    batch.vertices.push(p.x * WAD_SCALE, yWorld, -p.y * WAD_SCALE);
    batch.uvs.push(p.x / uvScale, p.y / uvScale);
    batch.normals.push(0, ny, 0);
  }

  for (let i = 1; i + 1 < poly.length; i++) {
    if (isCeiling) {
      batch.indices.push(baseIdx, baseIdx + i + 1, baseIdx + i);
    } else {
      batch.indices.push(baseIdx, baseIdx + i, baseIdx + i + 1);
    }
  }
}

function appendWallQuad(
  batch: GeomBatch,
  v1: WadVertex,
  v2: WadVertex,
  botDoom: number,
  topDoom: number,
  xOff: number,
  vTop: number,
  vBot: number,
  texW: number,
  doubleSided: boolean,
): void {
  if (topDoom <= botDoom) return;
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-4) return;

  const nx = dy / length;
  const nz = dx / length;
  const u1 = xOff / texW;
  const u2 = (xOff + length) / texW;

  const x1 = v1.x * WAD_SCALE;
  const z1 = -v1.y * WAD_SCALE;
  const x2 = v2.x * WAD_SCALE;
  const z2 = -v2.y * WAD_SCALE;
  const yBot = botDoom * WAD_SCALE;
  const yTop = topDoom * WAD_SCALE;

  const baseIdx = batch.vertices.length / 3;
  batch.vertices.push(x1, yBot, z1, x2, yBot, z2, x2, yTop, z2, x1, yTop, z1);
  batch.uvs.push(u1, vBot, u2, vBot, u2, vTop, u1, vTop);
  batch.normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
  batch.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);

  if (doubleSided) {
    const backIdx = batch.vertices.length / 3;
    batch.vertices.push(x1, yBot, z1, x2, yBot, z2, x2, yTop, z2, x1, yTop, z1);
    batch.uvs.push(u1, vBot, u2, vBot, u2, vTop, u1, vTop);
    batch.normals.push(-nx, 0, -nz, -nx, 0, -nz, -nx, 0, -nz, -nx, 0, -nz);
    batch.indices.push(backIdx, backIdx + 2, backIdx + 1, backIdx, backIdx + 3, backIdx + 2);
  }
}

interface ThingDescriptor {
  sprite: string;
  scale: number;
  kind: "enemy" | "item" | "prop" | "light";
  itemType?: "health" | "armor" | "weapon" | "ammo" | "keycard";
  amount?: number;
  color?: KeyId;
  weaponId?: WeaponId;
  ammoType?: AmmoType;
  pickupSound?: string;
  maxHealth?: number;
  sightSound?: string;
  painSound?: string;
  activeSound?: string;
  deathSound?: string;
  lightColor?: Color;
  lightIntensity?: number;
}

const THING_TABLE: Record<number, ThingDescriptor> = {
  // Enemies
  3004: {
    sprite: "possa1",
    scale: 2.0,
    kind: "enemy",
    maxHealth: 15,
    sightSound: "pos_sight",
    painSound: "pos_pain",
    activeSound: "enemy_grunt",
    deathSound: "enemy_death",
  },
  9: {
    sprite: "sposa1",
    scale: 2.0,
    kind: "enemy",
    maxHealth: 25,
    sightSound: "spos_sight",
    painSound: "pos_pain",
    activeSound: "enemy_grunt",
    deathSound: "spos_death",
  },
  3001: {
    sprite: "trooa1",
    scale: 2.1,
    kind: "enemy",
    maxHealth: 45,
    sightSound: "imp_sight",
    painSound: "pos_pain",
    activeSound: "imp_active",
    deathSound: "imp_death",
  },
  3002: {
    sprite: "sarga1",
    scale: 2.2,
    kind: "enemy",
    maxHealth: 90,
    sightSound: "demon_sight",
    painSound: "demon_pain",
    activeSound: "demon_active",
    deathSound: "demon_death",
  },
  // Keycards & Skull Keys
  5: { sprite: "bkeya0", scale: 0.75, kind: "item", itemType: "keycard", color: "blue", amount: 1 },
  6: { sprite: "ykeya0", scale: 0.75, kind: "item", itemType: "keycard", color: "yellow", amount: 1 },
  13: { sprite: "rkeya0", scale: 0.75, kind: "item", itemType: "keycard", color: "red", amount: 1 },
  40: { sprite: "bskua0", scale: 0.75, kind: "item", itemType: "keycard", color: "blue_skull", amount: 1 },
  39: { sprite: "yskua0", scale: 0.75, kind: "item", itemType: "keycard", color: "yellow_skull", amount: 1 },
  38: { sprite: "rskua0", scale: 0.75, kind: "item", itemType: "keycard", color: "red_skull", amount: 1 },
  // Weapons
  2005: { sprite: "csawa0", scale: 1.0, kind: "item", itemType: "weapon", weaponId: "chainsaw", amount: 0, pickupSound: "weapon_pickup" },
  2001: { sprite: "shota0", scale: 1.0, kind: "item", itemType: "weapon", weaponId: "shotgun", ammoType: "shel", amount: 8, pickupSound: "weapon_pickup" },
  2002: { sprite: "mguna0", scale: 1.0, kind: "item", itemType: "weapon", weaponId: "chaingun", ammoType: "bull", amount: 20, pickupSound: "weapon_pickup" },
  2003: { sprite: "launa0", scale: 1.0, kind: "item", itemType: "weapon", weaponId: "rocket", ammoType: "rckt", amount: 2, pickupSound: "weapon_pickup" },
  2004: { sprite: "plasa0", scale: 1.0, kind: "item", itemType: "weapon", weaponId: "plasma", ammoType: "cell", amount: 40, pickupSound: "weapon_pickup" },
  // Ammo
  2007: { sprite: "clipa0", scale: 0.7, kind: "item", itemType: "ammo", ammoType: "bull", amount: 10 },
  2048: { sprite: "ammoa0", scale: 0.85, kind: "item", itemType: "ammo", ammoType: "bull", amount: 50 },
  2008: { sprite: "shela0", scale: 0.7, kind: "item", itemType: "ammo", ammoType: "shel", amount: 4 },
  2049: { sprite: "sboxa0", scale: 0.85, kind: "item", itemType: "ammo", ammoType: "shel", amount: 20 },
  2010: { sprite: "rocka0", scale: 0.8, kind: "item", itemType: "ammo", ammoType: "rckt", amount: 1 },
  2046: { sprite: "broka0", scale: 0.9, kind: "item", itemType: "ammo", ammoType: "rckt", amount: 5 },
  2047: { sprite: "cella0", scale: 0.75, kind: "item", itemType: "ammo", ammoType: "cell", amount: 20 },
  17: { sprite: "celpa0", scale: 0.9, kind: "item", itemType: "ammo", ammoType: "cell", amount: 100 },
  // Health & Armor
  2011: { sprite: "stima0", scale: 0.8, kind: "item", itemType: "health", amount: 10 },
  2012: { sprite: "media0", scale: 0.9, kind: "item", itemType: "health", amount: 25 },
  2013: { sprite: "soula0", scale: 1.1, kind: "item", itemType: "health", amount: 100 },
  2014: { sprite: "bon1a0", scale: 0.7, kind: "item", itemType: "health", amount: 2 },
  2015: { sprite: "bon2a0", scale: 0.7, kind: "item", itemType: "armor", amount: 2 },
  2018: { sprite: "arm1a0", scale: 0.95, kind: "item", itemType: "armor", amount: 100 },
  2019: { sprite: "arm2a0", scale: 0.95, kind: "item", itemType: "armor", amount: 200 },
  // Props & Lights
  2035: { sprite: "bar1a0", scale: 1.25, kind: "prop" },
  2028: {
    sprite: "colua0",
    scale: 1.4,
    kind: "light",
    lightColor: new Color(1.0, 0.92, 0.78),
    lightIntensity: 3.5,
  },
  48: { sprite: "eleca0", scale: 2.2, kind: "prop" },
  10: { sprite: "pol5a0", scale: 0.65, kind: "prop" },
  12: { sprite: "pol5a0", scale: 0.65, kind: "prop" },
  15: { sprite: "playn0", scale: 0.8, kind: "prop" },
  18: { sprite: "possa1", scale: 0.6, kind: "prop" },
  19: { sprite: "sposa1", scale: 0.6, kind: "prop" },
  20: { sprite: "trooa1", scale: 0.6, kind: "prop" },
  21: { sprite: "sarga1", scale: 0.6, kind: "prop" },
  24: { sprite: "pob1a0", scale: 0.65, kind: "prop" },
};

/**
 * Constructs a playable 3D Small World Machine scene from parsed Doom WAD lumps and baked Freedoom assets.
 */
export class WadLevelBuilder {
  public async build(
    scene: Scene,
    map: WadMapData,
    manifest: WadManifest,
    config: WadLevelConfig,
  ): Promise<WadBuildResult> {
    const physics = new WadPhysics({
      map,
      audio: config.audio,
      events: config.events,
      ...(config.hasKeycard ? { hasKeycard: config.hasKeycard } : {}),
      ...(config.onExit ? { onExit: config.onExit } : {}),
    });

    const texCache = new Map<string, Texture>();
    const loadTex = async (url: string): Promise<Texture | undefined> => {
      const existing = texCache.get(url);
      if (existing) return existing;
      try {
        const tex = await Texture.fromUrl(url, {
          flipY: true,
          addressModeU: TextureWrap.REPEAT,
          addressModeV: TextureWrap.REPEAT,
          minFilter: TextureFilter.NEAREST,
          magFilter: TextureFilter.NEAREST,
          generateMipmaps: false,
        });
        texCache.set(url, tex);
        return tex;
      } catch {
        return undefined;
      }
    };

    // Preload all referenced wall textures, flats, and sprites in parallel batches
    const loadJobs: Promise<unknown>[] = [];
    for (const texName of Object.keys(manifest.textures)) {
      loadJobs.push(loadTex(`/assets/wad/textures/${texName.toLowerCase()}.webp`));
    }
    for (const flatName of Object.keys(manifest.flats)) {
      loadJobs.push(loadTex(`/assets/wad/flats/${flatName.toLowerCase()}.webp`));
    }
    for (const spriteName of Object.keys(manifest.sprites)) {
      loadJobs.push(loadTex(`/assets/wad/sprites/${spriteName.toLowerCase()}.webp`));
    }
    await Promise.all(loadJobs);

    const staticBatches = new Map<string, GeomBatch>();
    const moverBatches = new Map<number, Map<string, GeomBatch>>();

    const getBatch = (
      mapRef: Map<string, GeomBatch>,
      kind: "flat" | "tex" | "sky" | "mid",
      texName: string,
      brightness: number,
    ): GeomBatch => {
      const key = `${kind}:${texName}:${brightness}`;
      let b = mapRef.get(key);
      if (!b) {
        b = createEmptyBatch();
        mapRef.set(key, b);
      }
      return b;
    };

    const getMoverBatch = (
      sectorIdx: number,
      kind: "flat" | "tex" | "sky" | "mid",
      texName: string,
      brightness: number,
    ): GeomBatch => {
      let sectorMap = moverBatches.get(sectorIdx);
      if (!sectorMap) {
        sectorMap = new Map();
        moverBatches.set(sectorIdx, sectorMap);
      }
      return getBatch(sectorMap, kind, texName, brightness);
    };

    // 1. Build Subsector Floors & Ceilings via BSP clipping
    const subsectorPolys = buildSubsectorPolygons(map);
    for (let i = 0; i < map.subsectors.length; i++) {
      const poly = subsectorPolys[i];
      const ss = map.subsectors[i]!;
      if (!poly || ss.numSegs <= 0) continue;
      const seg = map.segs[ss.firstSeg];
      if (!seg) continue;
      const line = map.linedefs[seg.linedef];
      if (!line) continue;
      const sdIdx = seg.side === 0 ? line.frontSidedef : line.backSidedef;
      const sd = map.sidedefs[sdIdx];
      if (!sd) continue;
      const sec = map.sectors[sd.sector];
      if (!sec) continue;

      const brightness = quantizeLight(sec.lightLevel);
      const mover = physics.getMoverForSector(sd.sector);

      // Floor
      if (mover && (mover.kind === "lift" || mover.kind === "floor_lower")) {
        appendFlatFan(
          getMoverBatch(sd.sector, "flat", sec.floorTex, brightness),
          poly,
          sec.floorHeight,
          false,
        );
      } else {
        appendFlatFan(
          getBatch(staticBatches, "flat", sec.floorTex, brightness),
          poly,
          sec.floorHeight,
          false,
        );
      }

      // Ceiling
      if (sec.ceilingTex === "F_SKY1") {
        appendFlatFan(getBatch(staticBatches, "sky", "SKY1", 1.0), poly, sec.ceilingHeight, true, 256);
      } else if (mover && (mover.kind === "door_wait" || mover.kind === "door_stay")) {
        appendFlatFan(
          getMoverBatch(sd.sector, "flat", sec.ceilingTex, brightness),
          poly,
          sec.ceilingHeight,
          true,
        );
      } else {
        appendFlatFan(
          getBatch(staticBatches, "flat", sec.ceilingTex, brightness),
          poly,
          sec.ceilingHeight,
          true,
        );
      }
    }

    // 2. Build Linedef Walls (1-sided + 2-sided upper/lower/middle + movable door/lift skirts)
    const getTexDims = (name: string): [number, number] => manifest.textures[name] ?? [64, 128];

    const emitSideWalls = (
      line: WadLinedef,
      front: WadSidedef,
      frontSecIdx: number,
      back: WadSidedef | undefined,
      backSecIdx: number,
      v1: WadVertex,
      v2: WadVertex,
    ): void => {
      const frontSec = map.sectors[frontSecIdx];
      if (!frontSec) return;
      const brightness = quantizeLight(frontSec.lightLevel);

      if (!back) {
        if (front.middleTex !== "-") {
          const [tw, th] = getTexDims(front.middleTex);
          const h = frontSec.ceilingHeight - frontSec.floorHeight;
          const unpegBottom = (line.flags & LINEDEF_FLAGS.DONT_PEG_BOTTOM) !== 0;
          const vTop = unpegBottom ? -front.yOffset / th + h / th : 1 - front.yOffset / th;
          const vBot = unpegBottom ? -front.yOffset / th : vTop - h / th;
          appendWallQuad(
            getBatch(staticBatches, "tex", front.middleTex, brightness),
            v1,
            v2,
            frontSec.floorHeight,
            frontSec.ceilingHeight,
            front.xOffset,
            vTop,
            vBot,
            tw,
            false,
          );
        }
        return;
      }

      const backSec = map.sectors[backSecIdx];
      if (!backSec) return;
      const backMover = physics.getMoverForSector(backSecIdx);
      const isBackDoor = backMover && (backMover.kind === "door_wait" || backMover.kind === "door_stay");
      const isBackLift = backMover && (backMover.kind === "lift" || backMover.kind === "floor_lower");

      // Upper wall (between frontCeil > backCeil)
      const hideSkyUpper = frontSec.ceilingTex === "F_SKY1" && backSec.ceilingTex === "F_SKY1";
      if (!hideSkyUpper && front.upperTex !== "-") {
        if (isBackDoor) {
          // Door front face spans from closed door ceiling (baseHeight) up to front ceiling
          const doorTop = frontSec.ceilingHeight;
          const doorBot = backMover.baseHeight;
          if (doorTop > doorBot) {
            const [tw, th] = getTexDims(front.upperTex);
            const h = doorTop - doorBot;
            const vBot = -front.yOffset / th;
            const vTop = vBot + h / th;
            appendWallQuad(
              getMoverBatch(backSecIdx, "tex", front.upperTex, brightness),
              v1,
              v2,
              doorBot,
              doorTop,
              front.xOffset,
              vTop,
              vBot,
              tw,
              false,
            );
          }
        } else if (frontSec.ceilingHeight > backSec.ceilingHeight) {
          const [tw, th] = getTexDims(front.upperTex);
          const h = frontSec.ceilingHeight - backSec.ceilingHeight;
          const pegTop = (line.flags & LINEDEF_FLAGS.DONT_PEG_TOP) !== 0;
          const vTop = pegTop ? 1 - front.yOffset / th : -front.yOffset / th + h / th;
          const vBot = pegTop ? vTop - h / th : -front.yOffset / th;
          appendWallQuad(
            getBatch(staticBatches, "tex", front.upperTex, brightness),
            v1,
            v2,
            backSec.ceilingHeight,
            frontSec.ceilingHeight,
            front.xOffset,
            vTop,
            vBot,
            tw,
            false,
          );
        }
      }

      // Lower wall (between frontFloor < backFloor)
      if (front.lowerTex !== "-") {
        if (isBackLift && backMover.baseHeight > frontSec.floorHeight) {
          const [tw, th] = getTexDims(front.lowerTex);
          const h = backMover.baseHeight - frontSec.floorHeight;
          const vTop = 1 - front.yOffset / th;
          const vBot = vTop - h / th;
          appendWallQuad(
            getMoverBatch(backSecIdx, "tex", front.lowerTex, brightness),
            v1,
            v2,
            frontSec.floorHeight,
            backMover.baseHeight,
            front.xOffset,
            vTop,
            vBot,
            tw,
            false,
          );
        } else if (backSec.floorHeight > frontSec.floorHeight) {
          const [tw, th] = getTexDims(front.lowerTex);
          const h = backSec.floorHeight - frontSec.floorHeight;
          const pegBottom = (line.flags & LINEDEF_FLAGS.DONT_PEG_BOTTOM) !== 0;
          const vTop = pegBottom
            ? 1 - (front.yOffset + (frontSec.ceilingHeight - backSec.floorHeight)) / th
            : 1 - front.yOffset / th;
          const vBot = vTop - h / th;
          appendWallQuad(
            getBatch(staticBatches, "tex", front.lowerTex, brightness),
            v1,
            v2,
            frontSec.floorHeight,
            backSec.floorHeight,
            front.xOffset,
            vTop,
            vBot,
            tw,
            false,
          );
        }
      }

      // 2-sided middle texture (grates / translucent dividers)
      if (front.middleTex !== "-") {
        const [tw, th] = getTexDims(front.middleTex);
        const low = Math.max(frontSec.floorHeight, backSec.floorHeight);
        const high = Math.min(frontSec.ceilingHeight, backSec.ceilingHeight);
        const span = Math.min(th, high - low);
        if (span > 0) {
          const pegBottom = (line.flags & LINEDEF_FLAGS.DONT_PEG_BOTTOM) !== 0;
          const bot = pegBottom ? low + front.yOffset : high - span + front.yOffset;
          const top = bot + span;
          appendWallQuad(
            getBatch(staticBatches, "mid", front.middleTex, brightness),
            v1,
            v2,
            bot,
            top,
            front.xOffset,
            1,
            1 - span / th,
            tw,
            false,
          );
        }
      }
    };

    for (const line of map.linedefs) {
      const v1 = map.vertices[line.v1];
      const v2 = map.vertices[line.v2];
      if (!v1 || !v2) continue;

      const front = line.frontSidedef !== -1 ? map.sidedefs[line.frontSidedef] : undefined;
      const back = line.backSidedef !== -1 ? map.sidedefs[line.backSidedef] : undefined;
      if (front) {
        emitSideWalls(line, front, front.sector, back, back ? back.sector : -1, v1, v2);
      }
      if (back && front) {
        emitSideWalls(line, back, back.sector, front, front.sector, v2, v1);
      }
    }

    const materialCache = new Map<string, StandardMaterial>();
    const getMaterial = (kind: string, texName: string, brightness: number): StandardMaterial => {
      const key = `${kind}:${texName}:${brightness}`;
      const existing = materialCache.get(key);
      if (existing) return existing;

      const url =
        kind === "flat"
          ? `/assets/wad/flats/${texName.toLowerCase()}.webp`
          : `/assets/wad/textures/${texName.toLowerCase()}.webp`;
      const tex = texCache.get(url);

      let mat: StandardMaterial;
      if (kind === "sky") {
        mat = new StandardMaterial({
          diffuseMap: tex,
          color: Color.WHITE,
          emissiveColor: Color.WHITE,
          emissiveMap: tex,
          emissiveIntensity: 0.65,
          roughness: 1.0,
        });
      } else if (kind === "mid") {
        mat = new StandardMaterial({
          diffuseMap: tex,
          color: new Color(brightness, brightness, brightness),
          roughness: 0.9,
          transparent: true,
          alphaTest: 0.5,
        });
        mat.cullMode = CullMode.NONE;
      } else {
        mat = new StandardMaterial({
          diffuseMap: tex,
          color: new Color(brightness, brightness, brightness),
          roughness: 0.92,
        });
      }
      materialCache.set(key, mat);
      return mat;
    };

    const emitBatchesToParent = (parent: Object3D | Scene, batches: Map<string, GeomBatch>, isStatic: boolean): void => {
      for (const [key, batch] of batches.entries()) {
        if (batch.indices.length === 0) continue;
        const [kind, texName, bStr] = key.split(":");
        const brightness = Number.parseFloat(bStr ?? "1");
        const geom = new ModelGeometry(batch.vertices, batch.uvs, batch.normals, batch.indices);
        const obj = new Object3D(`WadMesh_${texName}`);
        obj.geometry = geom.getGeometryData();
        obj.material = getMaterial(kind ?? "tex", texName ?? "GRAY1", brightness);
        obj.isStatic = isStatic;
        obj.updateMatrixWorld();
        obj.computeBounds();
        parent.add(obj);
      }
    };

    // Emit static world batches
    emitBatchesToParent(scene, staticBatches, true);

    // Emit movable door & lift nodes
    for (const [secIdx, sectorBatches] of moverBatches.entries()) {
      const mover = physics.getMoverForSector(secIdx);
      const isDoor = mover?.kind === "door_wait" || mover?.kind === "door_stay";
      const node = new Object3D(isDoor ? `WadDoor_${secIdx}` : `WadLift_${secIdx}`);
      if (isDoor) node.tag = ObjectTags.DOOR;
      node.isStatic = false;
      emitBatchesToParent(node, sectorBatches, false);
      node.updateMatrixWorld();
      node.computeBounds();
      scene.add(node);
      physics.attachMoverNode(secIdx, node);
    }

    // 3. Spawn THINGS (Player Start + Enemies + Items + Lights)
    let playerStart = new Vector3D(0, DOOM_EYE_HEIGHT * WAD_SCALE, 0);
    let playerTheta = 0;

    for (let i = 0; i < map.things.length; i++) {
      const thing = map.things[i]!;
      // Skip multiplayer-only things (bit 4 = 0x0010)
      if ((thing.flags & 0x0010) !== 0) continue;

      const worldX = thing.x * WAD_SCALE;
      const worldZ = -thing.y * WAD_SCALE;
      const floorWorldY = physics.getFloorHeightWorld(worldX, worldZ);

      if (thing.type === 1) {
        playerStart = new Vector3D(worldX, floorWorldY + DOOM_EYE_HEIGHT * WAD_SCALE, worldZ);
        playerTheta = MathUtils.degToRad(90 - thing.angle);
        continue;
      }

      // Skill 3 ("Hurt Me Plenty" = bit 1 = 0x0002) filtering
      if ((thing.flags & 0x0002) === 0 && (thing.flags & 0x0007) !== 0) continue;

      const desc = THING_TABLE[thing.type];
      if (!desc) continue;

      const tex = texCache.get(`/assets/wad/sprites/${desc.sprite}.webp`);
      if (!tex) continue;

      const sprite = new Sprite(new SpriteMaterial({ texture: tex }));
      const dims = manifest.sprites[desc.sprite];
      const aspect = dims && dims[1] > 0 ? dims[0] / dims[1] : 1.0;
      const scaleY = desc.scale;
      const scaleX = scaleY * aspect;
      sprite.scale.set(scaleX, scaleY, 1.0);
      sprite.position.set(worldX, floorWorldY + scaleY * 0.5, worldZ);

      if (desc.kind === "enemy") {
        sprite.name = `WadEnemy_${thing.type}_${i}`;
        sprite.tag = ObjectTags.ENEMY;
        if (config.playerCamera) {
          sprite.addBehavior(
            new EnemyBehavior({
              player: config.playerCamera,
              scene,
              audio: config.audio,
              speed: thing.type === 3002 ? 7.5 : 5.0,
              detectionRange: 34.0,
              wadPhysics: physics,
              ...(desc.maxHealth !== undefined ? { maxHealth: desc.maxHealth } : {}),
              ...(desc.sightSound ? { sightSound: desc.sightSound } : {}),
              ...(desc.painSound ? { painSound: desc.painSound } : {}),
              ...(desc.activeSound ? { activeSound: desc.activeSound } : {}),
              ...(desc.deathSound ? { deathSound: desc.deathSound } : {}),
              ...(config.isPaused ? { isPaused: config.isPaused } : {}),
            }),
          );
        }
      } else if (desc.kind === "item") {
        sprite.name = `WadItem_${desc.itemType ?? "item"}_${i}`;
        sprite.tag = ObjectTags.ITEM;
        sprite.addBehavior(new BobbingBehavior(0.06, 2.0));
        if (config.playerCamera) {
          sprite.addBehavior(
            new ProximitySensorBehavior({
              targetObj: config.playerCamera,
              radius: 1.5,
              planar: true,
              onUpdate: (_factor, distance): void => {
                if (distance > 1.5 || !sprite.isVisible) return;
                sprite.isVisible = false;
                if (config.audio) config.audio.play(desc.pickupSound ?? "pickup", false, 0.8);
                if (config.events) {
                  config.events.dispatchEvent(Events.PICKUP, {
                    itemType: desc.itemType ?? "health",
                    type: desc.itemType ?? "health",
                    amount: desc.amount ?? 10,
                    ...(desc.color ? { color: desc.color } : {}),
                    ...(desc.weaponId ? { weaponId: desc.weaponId } : {}),
                    ...(desc.ammoType ? { ammoType: desc.ammoType } : {}),
                  });
                }
              },
            }),
          );
        }
      } else if (desc.kind === "light") {
        sprite.name = `WadLight_${i}`;
        if (desc.lightColor) {
          const light = new PointLight({
            color: desc.lightColor,
            intensity: desc.lightIntensity ?? 3.0,
            distance: 14,
          });
          light.position.set(worldX, floorWorldY + scaleY * 0.9, worldZ);
          scene.add(light);
        }
      } else {
        sprite.name = `WadProp_${thing.type}_${i}`;
      }

      sprite.updateMatrixWorld();
      sprite.computeBounds();
      scene.add(sprite);
    }

    // Compute world bounds for octrees
    let minX = -200;
    let maxX = 200;
    let minZ = -200;
    let maxZ = 200;
    for (const v of map.vertices) {
      const wx = v.x * WAD_SCALE;
      const wz = -v.y * WAD_SCALE;
      if (wx - 16 < minX) minX = wx - 16;
      if (wx + 16 > maxX) maxX = wx + 16;
      if (wz - 16 < minZ) minZ = wz - 16;
      if (wz + 16 > maxZ) maxZ = wz + 16;
    }

    return {
      playerStart,
      playerTheta,
      physics,
      boundsMin: new Vector3D(minX, -40, minZ),
      boundsMax: new Vector3D(maxX, 80, maxZ),
    };
  }
}
