import { describe, expect, it } from "vitest";
import { HazardGrid } from "../../src/core/LevelBuilder.js";
import { ObjectTags } from "../../src/enums/ObjectTags.js";

describe("HazardGrid", () => {
  it("registers and retrieves hazards in O(1) time based on world coordinates", () => {
    const grid = new HazardGrid(2.0);

    grid.addHazard(10, 20, ObjectTags.LAVA);
    grid.addHazard(-4, 6, ObjectTags.SLIME);

    expect(grid.getHazardAt(10, 20)).toBe(ObjectTags.LAVA);
    expect(grid.getHazardAt(10.3, 19.8)).toBe(ObjectTags.LAVA);
    expect(grid.getHazardAt(-4, 6)).toBe(ObjectTags.SLIME);
    expect(grid.getHazardAt(0, 0)).toBeUndefined();
    expect(grid.getHazardAt(100, 100)).toBeUndefined();
  });
});
