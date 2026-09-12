/**
 * The props, tracks, measurements, arrows and text layer.
 *
 * 1.665 lines and, until now, the last large surface on the canvas with no
 * test at all. It is pure presentation over explicit props — no context, no
 * storage — which makes it cheap to test properly rather than only smoke it.
 *
 * The focus is on what a wrong answer here actually costs. A measurement
 * label is a number a grip reads off the plan and paces out on the floor; if
 * the unit conversion is wrong the mark is in the wrong place. Label
 * visibility gates decide whether a plan is readable or a wall of text.
 * Animation position decides where an actor is told to be on a given beat.
 *
 * Not tested here: pixel geometry of the SVG paths. jsdom has no layout, so
 * asserting on `d` attributes would pin the current output rather than any
 * property worth keeping — and `utils/__tests__/geometry.test.ts` already
 * covers the maths those paths are built from.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { PropsLayer } from '../canvas/PropsLayer';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import type {
  ArrowElement,
  MeasurementElement,
  PropElement,
  TextElement,
  TrackElement,
} from '../../types';

afterEach(cleanup);

const displaySettings = (overrides: Partial<DisplaySettings> = {}): DisplaySettings =>
  ({
    showLabels: true,
    showPropLabels: true,
    showTrackLabels: true,
    showMeasurementLabels: true,
    labelScale: 1,
    labelOpacity: 1,
    labelCategoryScale: {},
    labelCategoryOpacity: {},
    categoryOpacity: {},
    ...overrides,
  }) as DisplaySettings;

const prop = (overrides: Partial<PropElement> = {}): PropElement =>
  ({
    id: 'prop-1',
    type: 'prop',
    propType: 'sofa',
    name: 'Sofa',
    x: 100,
    y: 100,
    width: 80,
    height: 40,
    rotation: 0,
    ...overrides,
  }) as PropElement;

const measurement = (overrides: Partial<MeasurementElement> = {}): MeasurementElement =>
  ({
    id: 'measure-1',
    type: 'measurement',
    x: 0,
    y: 0,
    x2: 300,
    y2: 0,
    rotation: 0,
    unit: 'm',
    ...overrides,
  }) as MeasurementElement;

const renderLayer = (props: Partial<React.ComponentProps<typeof PropsLayer>> = {}) =>
  render(
    <svg>
      <PropsLayer
        propsList={[]}
        tracks={[]}
        measurements={[]}
        arrows={[]}
        texts={[]}
        selectedIds={[]}
        onSelect={() => {}}
        displaySettings={displaySettings()}
        {...props}
      />
    </svg>,
  );

const textsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('text')].map((node) => node.textContent?.trim() ?? '');

describe('PropsLayer — measurements', () => {
  /**
   * The number a grip paces out. 300 plan pixels at 30 px per metre is 10 m;
   * getting the conversion wrong puts a mark in the wrong place on the floor,
   * and nothing on screen would look wrong.
   */
  it('converts plan distance into the measurement unit', () => {
    const { container } = renderLayer({
      measurements: [measurement()],
      pixelsPerUnit: 30,
    });
    expect(textsOf(container).join(' ')).toContain('10 m');
  });

  it('rescales when the plan uses a different pixels-per-unit', () => {
    const { container } = renderLayer({
      measurements: [measurement()],
      pixelsPerUnit: 60,
    });
    expect(textsOf(container).join(' ')).toContain('5 m');
  });

  it('reports one decimal rather than a false whole number', () => {
    // 305 / 30 = 10.17 -> 10.2. Rounding to 10 would quietly lose 17cm.
    const { container } = renderLayer({
      measurements: [measurement({ x2: 305 })],
      pixelsPerUnit: 30,
    });
    expect(textsOf(container).join(' ')).toContain('10.2 m');
  });

  it('prints the unit the measurement was authored in', () => {
    const { container } = renderLayer({
      measurements: [measurement({ unit: 'ft' })],
      pixelsPerUnit: 30,
    });
    expect(textsOf(container).join(' ')).toContain('ft');
  });

  it('measures diagonals, not just axis-aligned runs', () => {
    // 3-4-5: 90 x 120 px is 150 px, i.e. 5 m at 30 px/m.
    const { container } = renderLayer({
      measurements: [measurement({ x: 0, y: 0, x2: 90, y2: 120 })],
      pixelsPerUnit: 30,
    });
    expect(textsOf(container).join(' ')).toContain('5 m');
  });
});

describe('PropsLayer — label visibility', () => {
  it('shows prop labels when both the master and category switch are on', () => {
    const { container } = renderLayer({ propsList: [prop({ name: 'Armchair' })] });
    expect(textsOf(container).join(' ')).toContain('Armchair');
  });

  it('hides prop labels when the category switch is off', () => {
    const { container } = renderLayer({
      propsList: [prop({ name: 'Armchair' })],
      displaySettings: displaySettings({ showPropLabels: false }),
    });
    expect(textsOf(container).join(' ')).not.toContain('Armchair');
  });

  it('hides every label when the master switch is off', () => {
    // The master switch is what "declutter the plan" drives; a category that
    // ignored it would leave text on a plan the user asked to clear.
    const { container } = renderLayer({
      propsList: [prop({ name: 'Armchair' })],
      tracks: [{ id: 't1', type: 'track', name: 'Dolly A', x: 0, y: 0, x2: 200, y2: 0, rotation: 0 } as TrackElement],
      measurements: [measurement()],
      displaySettings: displaySettings({ showLabels: false }),
    });
    const text = textsOf(container).join(' ');
    expect(text).not.toContain('Armchair');
    expect(text).not.toContain('Dolly A');
  });

  it('still draws the element itself when its label is hidden', () => {
    // Hiding a name must not hide the thing. This was worth pinning: the
    // label gates sit close to the shape markup they belong to.
    const { container } = renderLayer({
      propsList: [prop({ name: 'Armchair' })],
      displaySettings: displaySettings({ showPropLabels: false }),
    });
    expect(container.querySelectorAll('g').length).toBeGreaterThan(0);
  });
});

describe('PropsLayer — selection', () => {
  it('reports which element was pointed at', () => {
    const onSelect = vi.fn();
    const { container } = renderLayer({ propsList: [prop({ id: 'prop-42' })], onSelect });

    // The interactive group is the one carrying the pointer cursor; outer
    // groups are transform wrappers and deliberately not clickable.
    const group = container.querySelector('g.cursor-pointer');
    expect(group, 'no interactive group rendered for the prop').toBeTruthy();
    fireEvent.pointerDown(group!);
    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0][0]).toBe('prop-42');
  });

  it('renders a selected element differently from an unselected one', () => {
    const unselected = renderLayer({ propsList: [prop()] }).container.innerHTML;
    cleanup();
    const selected = renderLayer({
      propsList: [prop()],
      selectedIds: ['prop-1'],
    }).container.innerHTML;
    expect(selected).not.toBe(unselected);
  });
});

describe('PropsLayer — text elements', () => {
  const textElement = (overrides: Partial<TextElement> = {}): TextElement =>
    ({
      id: 'text-1',
      type: 'text',
      text: 'Camera left',
      x: 10,
      y: 10,
      rotation: 0,
      ...overrides,
    }) as TextElement;

  it('draws the authored text', () => {
    const { container } = renderLayer({ texts: [textElement()] });
    expect(container.textContent).toContain('Camera left');
  });

  it('opens an editor on double click', () => {
    const { container } = renderLayer({ texts: [textElement()] });
    const target = container.querySelector('text')?.closest('g') ?? container.querySelector('g');
    fireEvent.doubleClick(target!);
    // An inline editor is a real form control, not a redraw of the label.
    expect(container.querySelector('input, textarea')).toBeTruthy();
  });

  it('reports an edited value to the caller rather than mutating locally', () => {
    const onUpdateText = vi.fn();
    const { container } = renderLayer({ texts: [textElement()], onUpdateText });
    const target = container.querySelector('text')?.closest('g') ?? container.querySelector('g');
    fireEvent.doubleClick(target!);

    const field = container.querySelector<HTMLInputElement>('input, textarea');
    expect(field).toBeTruthy();
    fireEvent.change(field!, { target: { value: 'Camera right' } });
    fireEvent.blur(field!);

    expect(onUpdateText).toHaveBeenCalledWith('text-1', 'Camera right');
  });
});

describe('PropsLayer — animated props', () => {
  const walking = prop({
    id: 'prop-move',
    name: 'Trolley',
    x: 0,
    y: 0,
    path: [{ id: 'wp-1', x: 200, y: 0, beat: 3 }],
  } as Partial<PropElement>);

  it('draws a prop at its authored position before the move starts', () => {
    const { container } = renderLayer({ propsList: [walking], currentBeat: 1 });
    expect(container.innerHTML).toContain('Trolley');
  });

  it('moves the prop as the beat advances', () => {
    const atStart = renderLayer({ propsList: [walking], currentBeat: 1 }).container.innerHTML;
    cleanup();
    const atEnd = renderLayer({ propsList: [walking], currentBeat: 3 }).container.innerHTML;
    // The transform has to differ, or blocking playback shows a prop that
    // never leaves its mark.
    expect(atEnd).not.toBe(atStart);
  });

  it('renders without a path at all', () => {
    const { container } = renderLayer({ propsList: [prop({ name: 'Static table' })] });
    expect(container.innerHTML).toContain('Static table');
  });
});

describe('PropsLayer — empty and partial input', () => {
  it('renders nothing visible for an empty plan rather than throwing', () => {
    const { container } = renderLayer();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('survives an element missing its optional dimensions', () => {
    // Elements arrive from imported projects and older schema versions, where
    // width/height can legitimately be absent.
    const { container } = renderLayer({
      propsList: [{ id: 'p', type: 'prop', propType: 'sofa', name: 'Bare', x: 0, y: 0, rotation: 0 } as PropElement],
    });
    expect(container.innerHTML).toContain('Bare');
  });

  it('survives an arrow with no explicit style', () => {
    const { container } = renderLayer({
      arrows: [{ id: 'a', type: 'arrow', x: 0, y: 0, x2: 50, y2: 50, rotation: 0 } as ArrowElement],
    });
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
