# ADR 0003: Dual-Level Architecture & Pure Binary Doom WAD Loader

> **Status:** Accepted

## Context

YAD began with simple ASCII text maps (`level1.txt`) and expanded to support genuine Freedoom `.wad` levels (`e1m1.wad`) featuring angled walls, stairs, sector lighting, lifts, switches, and keyed doors without adding external WASM or C-port dependencies.

## Decision

1. **Dual Level Sources:** `App` supports both classic grid levels (`?level=grid`, `LevelBuilder` + `HazardGrid`) and Doom WAD maps (`?level=e1m1`, default), selectable via Game Settings or URL query parameter.
2. **Pure TypeScript Binary WAD Pipeline:**
   - `WadParser` decodes IWAD/PWAD lumps (`THINGS`, `LINEDEFS`, `SIDEDEFS`, `VERTEXES`, `SEGS`, `SSECTORS`, `NODES`, `SECTORS`) directly from an `ArrayBuffer`.
   - `WadLevelBuilder` reconstructs convex floor/ceiling polygons via BSP half-plane clipping + `SEGS` trimming and builds UV-aligned wall batches, `SKY1` ceilings, dynamic mover nodes, and `THING_TABLE` spawns.
   - `WadPhysics` performs $O(\log N)$ BSP sector height lookups, spatially hashed 2D linedef circle-sliding collision, line-of-sight wall occlusion (`raycastWallDistance`), nukage damage, and mover state machines (doors, keycard/skull locks, switches, lifts, exit).

## Consequences

- Zero runtime dependencies beyond `@small-world-machine/engine`.
- Classic grid levels remain available as a fast sandbox alongside full Doom-format maps.
