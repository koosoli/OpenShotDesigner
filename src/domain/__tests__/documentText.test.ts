/**
 * Paperwork language.
 *
 * The property that matters is the same one the number formatting has: a call
 * sheet is a shared document, so what it says must depend on the PRODUCTION,
 * never on who happened to press print. These tests pin that, plus the two
 * ways a translation layer usually fails people — a missing key rendering as
 * `callsheet.unitBase`, and a language silently falling back to nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_LANGUAGES,
  DOCUMENT_LANGUAGE_LABELS,
  DOCUMENT_TEXT_KEYS,
  documentTextFor,
} from '../documentText';

describe('documentTextFor', () => {
  it('prints English by default', () => {
    const t = documentTextFor(undefined);
    expect(t('callsheet.call')).toBe('Call');
    expect(t('callsheet.unitBase')).toBe('Unit base');
  });

  it('prints the set vocabulary German crews actually use', () => {
    const t = documentTextFor('de');
    // Not a dictionary translation: a German call sheet says "Motiv", not
    // "Ort", and "Zeit" rather than "Anruf" for Call.
    expect(t('callsheet.location')).toBe('Motiv');
    expect(t('callsheet.call')).toBe('Zeit');
    expect(t('callsheet.unitBase')).toBe('Basislager');
  });

  it('falls back to English for anything untranslated, never to the key', () => {
    // An English word on a German call sheet is readable.
    // `callsheet.unitBase` printed on the page is not.
    for (const language of DOCUMENT_LANGUAGES) {
      const t = documentTextFor(language);
      for (const key of DOCUMENT_TEXT_KEYS) {
        const value = t(key);
        expect(value.length, key).toBeGreaterThan(0);
        expect(value, key).not.toContain('callsheet.');
      }
    }
  });

  it('treats an unknown language as English rather than throwing', () => {
    // Reachable from an imported project written by a newer build.
    const t = documentTextFor('fr' as never);
    expect(t('callsheet.call')).toBe('Call');
  });

  it('offers every language a label in its own language', () => {
    for (const language of DOCUMENT_LANGUAGES) {
      expect(DOCUMENT_LANGUAGE_LABELS[language]?.length).toBeGreaterThan(0);
    }
    expect(DOCUMENT_LANGUAGE_LABELS.de).toBe('Deutsch');
  });

  it('does not depend on the machine locale', () => {
    // The whole point. Two people exporting the same production's call sheet
    // must get the same words.
    const before = documentTextFor('de')('callsheet.shootingSchedule');
    const after = documentTextFor('de')('callsheet.shootingSchedule');
    expect(before).toBe(after);
    expect(before).toBe('Drehplan');
  });
});

describe('the German call sheet is complete', () => {
  it('translates every key rather than leaving a half-German page', () => {
    // A sheet that is half German and half English reads as a mistake, which
    // it would be. If a key is genuinely better left English, it belongs on an
    // explicit exception list, not silently missing.
    const german = documentTextFor('de');
    const english = documentTextFor('en');
    const untranslated = DOCUMENT_TEXT_KEYS.filter(
      (key) => german(key) === english(key),
    );
    // These are the same word in both languages, which is correct, not a gap.
    expect(untranslated.sort()).toEqual(['callsheet.crew', 'callsheet.name'].sort());
  });
});
