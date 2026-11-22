import { describe, expect, it } from "vitest";
import { Events } from "../../src/Events.js";

describe("Events", () => {
  it("defines unique event identifiers", () => {
    const values = Object.values(Events);
    const uniqueValues = new Set(values);

    expect(values.length).toBe(uniqueValues.size);
    expect(Events.DAMAGE).toBe("app:yad:damage");
    expect(Events.PICKUP).toBe("app:yad:pickup");
    expect(Events.SHOOT).toBe("app:yad:shoot");
    expect(Events.WEAPON).toBe("app:yad:weapon");
    expect(Events.GAME_OVER).toBe("app:yad:gameOver");
  });
});
