import type { PlanSymbolDefinition } from '../../domain/assets';
import { FixtureGlyph } from './FixtureGlyph';

/** Shared by library thumbnails, placed symbols and print exports. Coordinates are 0–100. */
export function PlanSymbolGlyph({ symbol, selected = false }: { symbol: PlanSymbolDefinition; selected?: boolean }) {
  if (symbol.fixtureGlyph) {
    return <g transform="translate(50 50) scale(2)"><FixtureGlyph fixtureType={symbol.fixtureGlyph} color="#fbbf24" selected={selected} /></g>;
  }
  return <g dangerouslySetInnerHTML={{ __html: symbol.svg }} />;
}
