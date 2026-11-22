export interface WadLump {
  name: string;
  offset: number;
  size: number;
}

export interface WadVertex {
  x: number;
  y: number;
}

export interface WadThing {
  x: number;
  y: number;
  angle: number;
  type: number;
  flags: number;
}

export interface WadLinedef {
  v1: number;
  v2: number;
  flags: number;
  special: number;
  tag: number;
  frontSidedef: number;
  backSidedef: number;
}

export interface WadSidedef {
  xOffset: number;
  yOffset: number;
  upperTex: string;
  lowerTex: string;
  middleTex: string;
  sector: number;
}

export interface WadSector {
  floorHeight: number;
  ceilingHeight: number;
  floorTex: string;
  ceilingTex: string;
  lightLevel: number;
  special: number;
  tag: number;
}

export interface WadSeg {
  v1: number;
  v2: number;
  angle: number;
  linedef: number;
  side: number;
  offset: number;
}

export interface WadSubsector {
  numSegs: number;
  firstSeg: number;
}

export interface WadNode {
  x: number;
  y: number;
  dx: number;
  dy: number;
  rightChild: number;
  leftChild: number;
}

export interface WadMapData {
  name: string;
  vertices: WadVertex[];
  linedefs: WadLinedef[];
  sidedefs: WadSidedef[];
  sectors: WadSector[];
  segs: WadSeg[];
  subsectors: WadSubsector[];
  nodes: WadNode[];
  things: WadThing[];
}

export const LINEDEF_FLAGS = {
  BLOCKING: 0x0001,
  BLOCK_MONSTERS: 0x0002,
  TWO_SIDED: 0x0004,
  DONT_PEG_TOP: 0x0008,
  DONT_PEG_BOTTOM: 0x0010,
  SECRET: 0x0020,
} as const;

function readAscii(view: DataView, offset: number, maxLength: number): string {
  let out = "";
  for (let i = 0; i < maxLength; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.toUpperCase();
}

function findMapIndex(lumps: WadLump[], requestedName?: string): number {
  if (requestedName) {
    const target = requestedName.toUpperCase();
    for (let i = 0; i < lumps.length; i++) {
      if (lumps[i]!.name === target) return i;
    }
    throw new Error(`WadParser: Map lump "${target}" not found in WAD.`);
  }
  for (let i = 0; i + 1 < lumps.length; i++) {
    if (lumps[i + 1]!.name === "THINGS") return i;
  }
  throw new Error("WadParser: No map marker found in WAD directory.");
}

function getRequiredLump(
  lumps: WadLump[],
  startIndex: number,
  name: string,
): WadLump {
  // Map lumps always sit in a contiguous block of up to 11 entries after the map marker.
  const limit = Math.min(lumps.length, startIndex + 12);
  for (let i = startIndex + 1; i < limit; i++) {
    const lump = lumps[i]!;
    if (lump.name === name) return lump;
    if (lump.name === "THINGS" && name !== "THINGS" && i > startIndex + 1) break;
  }
  throw new Error(`WadParser: Missing required map lump "${name}".`);
}

/**
 * Parses a classic Doom IWAD or PWAD binary buffer into structured map geometry and entity lumps.
 */
export function parseWadMap(buffer: ArrayBuffer, mapName?: string): WadMapData {
  if (buffer.byteLength < 12) {
    throw new Error("WadParser: Buffer too small to contain a valid WAD header.");
  }

  const view = new DataView(buffer);
  const magic = readAscii(view, 0, 4);
  if (magic !== "IWAD" && magic !== "PWAD") {
    throw new Error(`WadParser: Invalid WAD signature "${magic}". Expected IWAD or PWAD.`);
  }

  const numLumps = view.getInt32(4, true);
  const dirOffset = view.getInt32(8, true);
  if (numLumps <= 0 || dirOffset < 12 || dirOffset + numLumps * 16 > buffer.byteLength) {
    throw new Error("WadParser: Corrupt WAD directory table.");
  }

  const lumps: WadLump[] = [];
  for (let i = 0; i < numLumps; i++) {
    const entryOffset = dirOffset + i * 16;
    lumps.push({
      offset: view.getInt32(entryOffset, true),
      size: view.getInt32(entryOffset + 4, true),
      name: readAscii(view, entryOffset + 8, 8),
    });
  }

  const mapIndex = findMapIndex(lumps, mapName);
  const resolvedName = lumps[mapIndex]!.name;

  const thingsLump = getRequiredLump(lumps, mapIndex, "THINGS");
  const linedefsLump = getRequiredLump(lumps, mapIndex, "LINEDEFS");
  const sidedefsLump = getRequiredLump(lumps, mapIndex, "SIDEDEFS");
  const verticesLump = getRequiredLump(lumps, mapIndex, "VERTEXES");
  const segsLump = getRequiredLump(lumps, mapIndex, "SEGS");
  const ssectorsLump = getRequiredLump(lumps, mapIndex, "SSECTORS");
  const nodesLump = getRequiredLump(lumps, mapIndex, "NODES");
  const sectorsLump = getRequiredLump(lumps, mapIndex, "SECTORS");

  const vertices: WadVertex[] = [];
  for (let o = verticesLump.offset; o + 4 <= verticesLump.offset + verticesLump.size; o += 4) {
    vertices.push({
      x: view.getInt16(o, true),
      y: view.getInt16(o + 2, true),
    });
  }

  const things: WadThing[] = [];
  for (let o = thingsLump.offset; o + 10 <= thingsLump.offset + thingsLump.size; o += 10) {
    things.push({
      x: view.getInt16(o, true),
      y: view.getInt16(o + 2, true),
      angle: view.getInt16(o + 4, true),
      type: view.getInt16(o + 6, true),
      flags: view.getInt16(o + 8, true),
    });
  }

  const linedefs: WadLinedef[] = [];
  for (let o = linedefsLump.offset; o + 14 <= linedefsLump.offset + linedefsLump.size; o += 14) {
    const frontRaw = view.getUint16(o + 10, true);
    const backRaw = view.getUint16(o + 12, true);
    linedefs.push({
      v1: view.getUint16(o, true),
      v2: view.getUint16(o + 2, true),
      flags: view.getUint16(o + 4, true),
      special: view.getInt16(o + 6, true),
      tag: view.getInt16(o + 8, true),
      frontSidedef: frontRaw === 0xffff ? -1 : frontRaw,
      backSidedef: backRaw === 0xffff ? -1 : backRaw,
    });
  }

  const sidedefs: WadSidedef[] = [];
  for (let o = sidedefsLump.offset; o + 30 <= sidedefsLump.offset + sidedefsLump.size; o += 30) {
    sidedefs.push({
      xOffset: view.getInt16(o, true),
      yOffset: view.getInt16(o + 2, true),
      upperTex: readAscii(view, o + 4, 8),
      lowerTex: readAscii(view, o + 12, 8),
      middleTex: readAscii(view, o + 20, 8),
      sector: view.getInt16(o + 28, true),
    });
  }

  const sectors: WadSector[] = [];
  for (let o = sectorsLump.offset; o + 26 <= sectorsLump.offset + sectorsLump.size; o += 26) {
    sectors.push({
      floorHeight: view.getInt16(o, true),
      ceilingHeight: view.getInt16(o + 2, true),
      floorTex: readAscii(view, o + 4, 8),
      ceilingTex: readAscii(view, o + 12, 8),
      lightLevel: view.getInt16(o + 20, true),
      special: view.getInt16(o + 22, true),
      tag: view.getInt16(o + 24, true),
    });
  }

  const segs: WadSeg[] = [];
  for (let o = segsLump.offset; o + 12 <= segsLump.offset + segsLump.size; o += 12) {
    segs.push({
      v1: view.getUint16(o, true),
      v2: view.getUint16(o + 2, true),
      angle: view.getInt16(o + 4, true),
      linedef: view.getUint16(o + 6, true),
      side: view.getInt16(o + 8, true),
      offset: view.getInt16(o + 10, true),
    });
  }

  const subsectors: WadSubsector[] = [];
  for (let o = ssectorsLump.offset; o + 4 <= ssectorsLump.offset + ssectorsLump.size; o += 4) {
    subsectors.push({
      numSegs: view.getUint16(o, true),
      firstSeg: view.getUint16(o + 2, true),
    });
  }

  const nodes: WadNode[] = [];
  for (let o = nodesLump.offset; o + 28 <= nodesLump.offset + nodesLump.size; o += 28) {
    nodes.push({
      x: view.getInt16(o, true),
      y: view.getInt16(o + 2, true),
      dx: view.getInt16(o + 4, true),
      dy: view.getInt16(o + 6, true),
      rightChild: view.getUint16(o + 24, true),
      leftChild: view.getUint16(o + 26, true),
    });
  }

  return {
    name: resolvedName,
    vertices,
    linedefs,
    sidedefs,
    sectors,
    segs,
    subsectors,
    nodes,
    things,
  };
}
