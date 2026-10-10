import { describe, expect, it } from 'vitest';
import { layoutPages, lockPages, pageLabels } from '../script/pageLock';

const action = (id: string) => ({ id, type: 'action', text: 'A line of action that fills one printed line.' });

/** n one-line action paragraphs: each takes 2 printed lines (blank + text). */
const script = (n: number, prefix = 'l') => Array.from({ length: n }, (_, i) => action(`${prefix}${i}`));

describe('page locking', () => {
  it('lays out 55-line pages', () => {
    const pages = layoutPages(script(60));
    expect(pages.get('l0')).toBe(1);
    expect(pages.get('l27')).toBe(1);
    expect(pages.get('l28')).toBe(2);
  });

  it('keeps locked numbers and spills new text onto A-pages', () => {
    const original = script(40);
    const lock = lockPages(original);
    const revised = [...original.slice(0, 10), ...script(20, 'new'), ...original.slice(10)];
    const labels = pageLabels(revised, lock);
    expect(labels.byLine.get('l0')).toBe('1');
    expect(labels.starts.map((start) => start.label)).toContain('1A');
    expect(labels.byLine.get('l30')).toBe('2');
    expect(labels.addedPages).toBe(1);
  });

  it('lists a locked page that lost all its lines as omitted', () => {
    const original = script(60);
    const lock = lockPages(original);
    const revised = original.filter((line) => lock[line.id] !== 2);
    expect(pageLabels(revised, lock).omitted).toEqual(['2']);
  });

  it('numbers plainly when not locked', () => {
    expect(pageLabels(script(60)).starts.map((start) => start.label)).toEqual(['1', '2', '3']);
  });
});
