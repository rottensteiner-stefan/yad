import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AudioSystem } from "@small-world-machine/engine";
import { parseWadMap } from "../../../src/core/wad/WadParser.js";
import type { WadMapData } from "../../../src/core/wad/WadParser.js";
import { buildSubsectorPolygons } from "../../../src/core/wad/WadLevelBuilder.js";
import { DOOM_EYE_HEIGHT, WAD_SCALE, WadPhysics } from "../../../src/core/wad/WadPhysics.js";

function loadE1M1Buffer(): ArrayBuffer {
  const file = readFileSync(resolve(process.cwd(), "public/assets/wad/e1m1.wad"));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

describe("WadParser & WadPhysics (Freedoom E1M1)", () => {
  it("parses all map lumps from Freedoom e1m1.wad", () => {
    const map = parseWadMap(loadE1M1Buffer(), "E1M1");
    expect(map.name).toBe("E1M1");
    expect(map.sectors.length).toBe(182);
    expect(map.linedefs.length).toBe(1175);
    expect(map.subsectors.length).toBe(682);
    expect(map.things.length).toBe(292);

    const playerStart = map.things.find((t) => t.type === 1);
    expect(playerStart).toBeDefined();
  });

  it("rejects invalid WAD buffers cleanly", () => {
    expect(() => parseWadMap(new ArrayBuffer(4))).toThrow(/too small/i);
    const bad = new Uint8Array(16);
    bad.set([66, 65, 68, 33]); // "BAD!"
    expect(() => parseWadMap(bad.buffer)).toThrow(/Invalid WAD signature/);
  });

  it("reconstructs non-empty convex polygons for every BSP subsector", () => {
    const map = parseWadMap(loadE1M1Buffer(), "E1M1");
    const polys = buildSubsectorPolygons(map);
    expect(polys.length).toBe(map.subsectors.length);

    let validCount = 0;
    for (const poly of polys) {
      if (poly && poly.length >= 3) validCount++;
    }
    expect(validCount).toBe(map.subsectors.length);
  });

  it("resolves BSP sector heights, solid wall sliding, and sight occlusion", () => {
    const map = parseWadMap(loadE1M1Buffer(), "E1M1");
    const physics = new WadPhysics({ map });
    const spawn = map.things.find((t) => t.type === 1)!;

    const startWorldX = spawn.x * WAD_SCALE;
    const startWorldZ = -spawn.y * WAD_SCALE;
    const startSector = physics.findSectorAtWorld(startWorldX, startWorldZ);
    expect(startSector).toBeDefined();

    // Verify player eye height snaps cleanly onto sector floor + DOOM_EYE_HEIGHT
    const target = { position: { x: startWorldX, y: 0, z: startWorldZ } };
    physics.resolvePlayer(target, startWorldX, startWorldZ, 0.016);
    expect(target.position.y).toBeCloseTo(
      ((startSector?.floorHeight ?? 0) + DOOM_EYE_HEIGHT) * WAD_SCALE,
      3,
    );

    // Raycast across a 1-sided outer wall should return a finite wall distance
    const distNorth = physics.raycastWallDistance(startWorldX, startWorldZ, 0, -1);
    const distSouth = physics.raycastWallDistance(startWorldX, startWorldZ, 0, 1);
    expect(Math.min(distNorth, distSouth)).toBeLessThan(100);
  });

  it("plays locked, door, door_close, lift, and switch audio cues for WAD movers", () => {
    const map: WadMapData = {
      name: "TEST",
      vertices: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
        { x: 200, y: 0 },
        { x: 264, y: 0 },
      ],
      sectors: [
        { floorHeight: 0, ceilingHeight: 128, floorTex: "F1", ceilingTex: "C1", lightLevel: 160, special: 0, tag: 0 },
        { floorHeight: 0, ceilingHeight: 0, floorTex: "F1", ceilingTex: "C1", lightLevel: 160, special: 0, tag: 0 },
        { floorHeight: 64, ceilingHeight: 128, floorTex: "F1", ceilingTex: "C1", lightLevel: 160, special: 0, tag: 10 },
      ],
      sidedefs: [
        { xOffset: 0, yOffset: 0, upperTex: "-", lowerTex: "-", middleTex: "-", sector: 0 },
        { xOffset: 0, yOffset: 0, upperTex: "-", lowerTex: "-", middleTex: "-", sector: 1 },
        { xOffset: 0, yOffset: 0, upperTex: "-", lowerTex: "-", middleTex: "-", sector: 2 },
      ],
      linedefs: [
        // Locked blue door at x=0..64, y=0
        { v1: 0, v2: 1, flags: 0, special: 26, tag: 0, frontSidedef: 0, backSidedef: 1 },
        // Switch lowering floor (special 23, tag 10) at x=200..264, y=0
        { v1: 2, v2: 3, flags: 0, special: 23, tag: 10, frontSidedef: 0, backSidedef: 2 },
      ],
      segs: [],
      subsectors: [],
      nodes: [],
      things: [],
    };

    const play = vi.fn();
    const playSpatial = vi.fn();
    const audio = { play, playSpatial } as unknown as AudioSystem;
    let hasBlue = false;
    const physics = new WadPhysics({
      map,
      audio,
      hasKeycard: (c): boolean => c === "blue" && hasBlue,
    });

    // Proximity near locked door must not spam "locked"
    physics.updateMovers(0.016, 32 * WAD_SCALE, -10 * WAD_SCALE);
    expect(play).not.toHaveBeenCalledWith("locked", expect.anything(), expect.anything());

    // Pressing Use near locked door without blue key plays "locked"
    physics.triggerUse(32 * WAD_SCALE, -10 * WAD_SCALE);
    expect(play).toHaveBeenCalledWith("locked", false, 0.75);

    // Pressing Use with blue key opens door -> plays "door"
    play.mockClear();
    hasBlue = true;
    physics.triggerUse(32 * WAD_SCALE, -10 * WAD_SCALE);
    expect(play).toHaveBeenCalledWith("door", false, 0.7);

    // Advance door through opening + wait timer while player is far away -> plays "door_close"
    play.mockClear();
    for (let i = 0; i < 12; i++) {
      physics.updateMovers(0.5, 500 * WAD_SCALE, 0);
    }
    expect(play).toHaveBeenCalledWith("door_close", false, 0.7);

    // Pressing Use near switch (special 23, tag 10) plays "switch" and "lift"
    play.mockClear();
    physics.triggerUse(232 * WAD_SCALE, -10 * WAD_SCALE);
    expect(play).toHaveBeenCalledWith("switch", false, 0.75);
    expect(play).toHaveBeenCalledWith("lift", false, 0.7);
  });
});
