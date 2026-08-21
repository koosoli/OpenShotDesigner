import { describe, expect, it } from "vitest";
import { SYMBOL_REGISTRY, getSymbolById, getSymbolsByCategory } from "../assets/symbolRegistry";

const KNOWN_CATEGORIES = new Set([
  "architecture",
  "audio",
  "video",
  "lighting",
  "grip",
  "staging",
  "backline",
  "broadcast",
  "annotation",
]);

describe("SYMBOL_REGISTRY integrity", () => {
  it("contains at least 40 symbol definitions", () => {
    expect(SYMBOL_REGISTRY.length).toBeGreaterThanOrEqual(40);
  });

  it("has unique ids", () => {
    const ids = SYMBOL_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every symbol has non-empty name, keywords and svg", () => {
    for (const symbol of SYMBOL_REGISTRY) {
      expect(symbol.name.trim().length).toBeGreaterThan(0);
      expect(symbol.keywords.length).toBeGreaterThan(0);
      for (const keyword of symbol.keywords) {
        expect(keyword.trim().length).toBeGreaterThan(0);
      }
      expect(symbol.svg.trim().length).toBeGreaterThan(0);
    }
  });

  it("every symbol has positive default dimensions", () => {
    for (const symbol of SYMBOL_REGISTRY) {
      expect(symbol.defaultWidth).toBeGreaterThan(0);
      expect(symbol.defaultHeight).toBeGreaterThan(0);
    }
  });

  it("only uses known categories", () => {
    for (const symbol of SYMBOL_REGISTRY) {
      expect(KNOWN_CATEGORIES.has(symbol.category)).toBe(true);
    }
  });

  it("spans all required families", () => {
    const categories = new Set(SYMBOL_REGISTRY.map((s) => s.category));
    for (const required of ["architecture", "staging", "audio", "backline", "video", "broadcast", "lighting", "grip"]) {
      expect(categories.has(required)).toBe(true);
    }
  });

  it("contains plan-readable stage and outside-broadcast vehicle families", () => {
    const requiredIds = [
      "staging.main-stage",
      "staging.stage-deck",
      "staging.runway",
      "staging.truss-tower",
      "broadcast.ob-van",
      "broadcast.eng-van",
      "broadcast.satellite-truck",
    ];

    for (const id of requiredIds) {
      const symbol = getSymbolById(id);
      expect(symbol, id).toBeDefined();
      expect(symbol?.defaultPhysicalSize, id).toBeDefined();
      expect(symbol?.svg.length, id).toBeGreaterThan(150);
    }
  });

  it("contains a modular, dimensioned truss family", () => {
    const requiredIds = [
      "staging.truss-tower",
      "staging.box-truss-1m",
      "staging.box-truss-2m",
      "staging.box-truss-3m",
      "staging.triangle-truss-2m",
      "staging.ladder-truss-2m",
      "staging.truss-corner-90",
      "staging.truss-t-junction",
      "staging.truss-cross-junction",
      "staging.truss-base-plate",
      "staging.truss-goalpost",
      "staging.circular-truss-4m",
    ];

    for (const id of requiredIds) {
      const symbol = getSymbolById(id);
      expect(symbol, id).toBeDefined();
      expect(symbol?.category, id).toBe("staging");
      expect(symbol?.subCategory, id).toBe("rigging");
      expect(symbol?.defaultPhysicalSize?.widthMm, id).toBeGreaterThan(0);
      expect(symbol?.defaultPhysicalSize?.depthMm, id).toBeGreaterThan(0);
      expect(symbol?.svg.length, id).toBeGreaterThan(100);
    }
  });

  it("contains a practical architectural fixture family with physical sizes", () => {
    const requiredIds = [
      "arch.shower",
      "arch.bathtub",
      "arch.toilet",
      "arch.sink",
      "arch.bathroom-vanity",
      "arch.double-sink",
      "arch.kitchen-run",
      "arch.corner-counter",
      "arch.oven-range",
      "arch.dishwasher",
      "arch.washing-machine",
      "arch.single-door",
      "arch.window",
    ];

    for (const id of requiredIds) {
      const symbol = getSymbolById(id);
      expect(symbol, id).toBeDefined();
      expect(symbol?.category, id).toBe("architecture");
      expect(symbol?.defaultPhysicalSize, id).toBeDefined();
    }
  });
});

describe("getSymbolById", () => {
  it("returns the matching symbol", () => {
    const symbol = getSymbolById("audio.foh-console");
    expect(symbol?.name).toBe("FOH console");
  });

  it("returns undefined for unknown ids", () => {
    expect(getSymbolById("nope.does-not-exist")).toBeUndefined();
  });
});

describe("getSymbolsByCategory", () => {
  it("returns only symbols in the requested category", () => {
    const broadcast = getSymbolsByCategory("broadcast");
    expect(broadcast.length).toBeGreaterThan(0);
    expect(broadcast.every((s) => s.category === "broadcast")).toBe(true);
  });

  it("returns empty array for unknown category", () => {
    expect(getSymbolsByCategory("nonexistent")).toEqual([]);
  });
});
