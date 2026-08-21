import type { PlanSymbolDefinition } from "./symbolTypes";
import { SYMBOL_REGISTRY } from "./symbolRegistry";

export interface SymbolSearchResult {
  symbol: PlanSymbolDefinition;
  score: number;
  matchedOn: string;
}

interface TokenMatch {
  score: number;
  matchedOn: string;
}

const EXACT_NAME_SCORE = 1000;
const NAME_PREFIX_SCORE = 800;
const EXACT_KEYWORD_SCORE = 600;
const KEYWORD_MATCH_SCORE = 500;
const SUBCATEGORY_MATCH_SCORE = 300;
const CATEGORY_MATCH_SCORE = 200;
const NAME_SUBSTRING_SCORE = 100;

const scoreTokenAgainstSymbol = (
  token: string,
  symbol: PlanSymbolDefinition,
): TokenMatch | null => {
  const name = symbol.name.toLowerCase();
  if (name === token) return { score: EXACT_NAME_SCORE, matchedOn: "name" };
  if (name.startsWith(token)) return { score: NAME_PREFIX_SCORE, matchedOn: "name-prefix" };

  const keywords = symbol.keywords.map((k) => k.toLowerCase());
  if (keywords.includes(token)) return { score: EXACT_KEYWORD_SCORE, matchedOn: "keyword" };
  if (keywords.some((k) => k.startsWith(token) || k.includes(token))) {
    return { score: KEYWORD_MATCH_SCORE, matchedOn: "keyword" };
  }

  const subCategory = symbol.subCategory.toLowerCase();
  if (subCategory === token || subCategory.includes(token)) {
    return { score: SUBCATEGORY_MATCH_SCORE, matchedOn: "subCategory" };
  }

  const category = symbol.category.toLowerCase();
  if (category === token || category.includes(token)) {
    return { score: CATEGORY_MATCH_SCORE, matchedOn: "category" };
  }

  if (name.includes(token)) return { score: NAME_SUBSTRING_SCORE, matchedOn: "name-substring" };

  return null;
};

export const searchSymbols = (
  query: string,
  options?: { category?: string; limit?: number },
): SymbolSearchResult[] => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const tokens = trimmed.split(/\s+/);
  const limit = options?.limit ?? 20;

  const results: SymbolSearchResult[] = [];
  for (const symbol of SYMBOL_REGISTRY) {
    if (options?.category && symbol.category !== options.category) continue;

    let totalScore = 0;
    const matchedOnParts: string[] = [];
    let allTokensMatched = true;

    for (const token of tokens) {
      const match = scoreTokenAgainstSymbol(token, symbol);
      if (!match) {
        allTokensMatched = false;
        break;
      }
      totalScore += match.score;
      matchedOnParts.push(match.matchedOn);
    }

    if (!allTokensMatched) continue;

    // Prefer symbols whose name matches the full query as a whole.
    const name = symbol.name.toLowerCase();
    if (tokens.length > 1 && name === trimmed) totalScore += EXACT_NAME_SCORE;
    else if (tokens.length > 1 && name.startsWith(trimmed)) totalScore += NAME_PREFIX_SCORE;

    results.push({ symbol, score: totalScore, matchedOn: matchedOnParts.join("+") });
  }

  results.sort((a, b) => b.score - a.score || a.symbol.name.localeCompare(b.symbol.name));

  return limit >= 0 ? results.slice(0, limit) : results;
};
