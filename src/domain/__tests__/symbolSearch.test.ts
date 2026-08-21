import { describe, expect, it } from "vitest";
import { searchSymbols } from "../assets/search";
import { SYMBOL_REGISTRY } from "../assets/symbolRegistry";

describe("searchSymbols", () => {
  it("returns [] for empty or whitespace queries", () => {
    expect(searchSymbols("")).toEqual([]);
    expect(searchSymbols("   ")).toEqual([]);
    expect(searchSymbols("\t\n")).toEqual([]);
  });

  it("finds FOH console and vision mixer for 'mix'", () => {
    const results = searchSymbols("mix");
    const names = results.map((r) => r.symbol.name);
    expect(names).toContain("FOH console");
    expect(names).toContain("Monitor console");
    expect(names).toContain("Vision mixer");
  });

  it("is case-insensitive", () => {
    const lower = searchSymbols("foh console");
    const upper = searchSymbols("FOH CONSOLE");
    expect(lower.map((r) => r.symbol.id)).toEqual(upper.map((r) => r.symbol.id));
    expect(lower.length).toBeGreaterThan(0);
  });

  it("ranks exact name match first", () => {
    const results = searchSymbols("fresnel");
    expect(results[0].symbol.name).toBe("Fresnel");
    expect(results[0].matchedOn).toBe("name");
  });

  it("ranks name prefix above keyword matches", () => {
    const results = searchSymbols("drum");
    const names = results.map((r) => r.symbol.name);
    // "Drum kit" and "Drum riser" are name prefixes; "Stage monitor wedge" etc. only keyword hits.
    expect(names.indexOf("Drum kit")).toBeLessThan(names.length - 1);
    const prefixResults = results.filter((r) => r.matchedOn.startsWith("name-prefix"));
    const keywordOnly = results.filter((r) => r.matchedOn === "keyword");
    if (prefixResults.length && keywordOnly.length) {
      expect(prefixResults[0].score).toBeGreaterThan(keywordOnly[0].score);
    }
  });

  it("matches on keywords/synonyms", () => {
    const results = searchSymbols("couch");
    expect(results.map((r) => r.symbol.name)).toContain("Sofa");
    expect(results[0].matchedOn).toBe("keyword");
  });

  it("finds common floor-plan fixtures and spelling variants", () => {
    expect(searchSymbols("shower")[0].symbol.id).toBe("arch.shower");
    expect(searchSymbols("bathtop")[0].symbol.id).toBe("arch.bathtub");
    expect(searchSymbols("bathroom sink").map((result) => result.symbol.id))
      .toContain("arch.bathroom-vanity");
    expect(searchSymbols("kitchen counter").map((result) => result.symbol.id))
      .toContain("arch.kitchen-run");
    expect(searchSymbols("floorplan door").map((result) => result.symbol.id))
      .toContain("arch.single-door");
  });

  it("requires all tokens of a multi-token query to match", () => {
    const results = searchSymbols("stage deck");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.matchedOn.split("+").length >= 2)).toBe(true);

    // A query where one token matches nothing returns no results.
    expect(searchSymbols("stage zzzznotfound")).toEqual([]);
  });

  it("supports category filtering", () => {
    const results = searchSymbols("camera", { category: "broadcast" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.symbol.category === "broadcast")).toBe(true);

    const lighting = searchSymbols("camera", { category: "lighting" });
    expect(lighting.every((r) => r.symbol.category === "lighting")).toBe(true);
  });

  it("respects the limit option", () => {
    const all = searchSymbols("a", { limit: SYMBOL_REGISTRY.length + 10 });
    const limited = searchSymbols("a", { limit: 3 });
    expect(limited.length).toBe(3);
    expect(all.length).toBeGreaterThanOrEqual(limited.length);
  });

  it("defaults to a limit of 20", () => {
    const results = searchSymbols("a");
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("orders deterministically (score desc, then name asc)", () => {
    const run1 = searchSymbols("console").map((r) => [r.symbol.id, r.score] as const);
    const run2 = searchSymbols("console").map((r) => [r.symbol.id, r.score] as const);
    expect(run1).toEqual(run2);

    for (let i = 1; i < run1.length; i++) {
      const prev = run1[i - 1];
      const curr = run1[i];
      expect(prev[1]).toBeGreaterThanOrEqual(curr[1]);
      if (prev[1] === curr[1]) {
        const prevName = searchSymbols("console").find((r) => r.symbol.id === prev[0])!.symbol.name;
        const currName = searchSymbols("console").find((r) => r.symbol.id === curr[0])!.symbol.name;
        expect(prevName.localeCompare(currName)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("finds truss-related symbols deterministically", () => {
    const results = searchSymbols("truss");
    const sorted = [...results].sort(
      (a, b) => b.score - a.score || a.symbol.name.localeCompare(b.symbol.name),
    );
    expect(results).toEqual(sorted);
  });

  it("finds exact modular truss sections and junctions", () => {
    expect(searchSymbols("2m box truss")[0].symbol.id).toBe("staging.box-truss-2m");
    expect(searchSymbols("truss 90 degree").map((result) => result.symbol.id))
      .toContain("staging.truss-corner-90");
    expect(searchSymbols("truss base plate")[0].symbol.id).toBe("staging.truss-base-plate");
    expect(searchSymbols("circle truss").map((result) => result.symbol.id))
      .toContain("staging.circular-truss-4m");
  });
});
