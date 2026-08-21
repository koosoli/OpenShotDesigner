import { describe, expect, it } from 'vitest';
import { getFreehandStrokeAppearance, normalizeFreehandToolSettings } from '../plan';

describe('getFreehandStrokeAppearance', () => {
  it('keeps pen width and explicit opacity', () => {
    expect(getFreehandStrokeAppearance({ strokeWidth: 5, toolStyle: 'pen', opacity: 0.7 })).toEqual({
      strokeWidth: 5,
      opacity: 0.7,
    });
  });

  it('renders a highlighter three times wider with its exact explicit opacity', () => {
    expect(getFreehandStrokeAppearance({ strokeWidth: 4, toolStyle: 'highlighter', opacity: 0.45 })).toEqual({
      strokeWidth: 12,
      opacity: 0.45,
    });
  });

  it('preserves the historical opacity for legacy highlighters', () => {
    expect(getFreehandStrokeAppearance({ strokeWidth: 3, toolStyle: 'highlighter' })).toEqual({
      strokeWidth: 9,
      opacity: 0.35,
    });
  });
});

describe('normalizeFreehandToolSettings', () => {
  it('clamps thickness and opacity and rejects invalid colors', () => {
    expect(normalizeFreehandToolSettings({
      color: 'orange',
      strokeWidth: 99,
      opacity: 0,
      toolStyle: 'highlighter',
    })).toEqual({
      color: '#f59e0b',
      strokeWidth: 16,
      opacity: 0.1,
      toolStyle: 'highlighter',
    });
  });
});
