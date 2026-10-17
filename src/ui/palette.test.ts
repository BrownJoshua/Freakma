import { describe, expect, it } from "vitest";
import { themeFromPalette } from "./Library";
import { THEMES } from "../model/theme";

describe("palette → theme", () => {
  it("uses light/dark pair and the most colourful as primary", () => {
    const t = themeFromPalette(THEMES[0], ["#FAFAF7", "#1A1A1A", "#E4572E", "#BBBBBB"]);
    expect(t.colors.background).toBe("#FAFAF7");
    expect(t.colors.primary).toBe("#E4572E");
    expect(t.colors.text).toBe("#1A1A1A");
  });
  it("keeps readable text when the reference has one colour", () => {
    const t = themeFromPalette(THEMES[0], ["#FF0000"]);
    expect(t.colors.primary).toBe("#FF0000");
    expect(t.colors.text).toBe(THEMES[0].colors.text);
    expect(t.colors.background).toBe(THEMES[0].colors.background);
  });
});
