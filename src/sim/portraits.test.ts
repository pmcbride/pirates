import { describe, expect, it } from "vitest";
import { missionNodes } from "./content";
import { missionPortraits } from "./portraits";

describe("missionPortraits", () => {
  it("covers every mission node on the world map", () => {
    for (const node of missionNodes) {
      expect(
        missionPortraits[node.missionId],
        `mission ${node.missionId} is missing a portrait glyph`,
      ).toBeTruthy();
    }
  });

  it("uses the expected glyphs from the design spec", () => {
    expect(missionPortraits["tutorial-cove"]).toBe("📦");
    expect(missionPortraits["spark-shoals"]).toBe("⚔️");
    expect(missionPortraits["windrise-cove"]).toBe("🌬️");
    expect(missionPortraits["barrel-bay"]).toBe("🛢️");
    expect(missionPortraits["harbor-bend"]).toBe("⚓");
    expect(missionPortraits["current-crescent"]).toBe("🌀");
    expect(missionPortraits["coral-lookout"]).toBe("🦜");
    expect(missionPortraits["treasure-isle"]).toBe("👑");
    expect(missionPortraits["sandbox-isle"]).toBe("🌴");
  });

  it("does not collide — every portrait is distinct", () => {
    const glyphs = Object.values(missionPortraits);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
