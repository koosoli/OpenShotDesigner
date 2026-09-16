import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { CameraElementView } from '../canvas/CameraElementView';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import type { CameraElement, Shot } from '../../types';

afterEach(cleanup);

describe('CameraElementView keyframes', () => {
  it('draws the full camera icon at each authored facing rotation', () => {
    const camera = {
      id: 'cam-a',
      type: 'camera',
      x: 10,
      y: 20,
      rotation: 15,
      name: 'Camera A',
      cameraLabel: 'A',
      color: '#0284c7',
      focalLength: 35,
      sensorFormat: 'Super35',
      fovAngle: 45,
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 280,
      path: [{ id: 'wp-1', x: 100, y: 120, beat: 2, rotation: 135 }],
    } as CameraElement;
    const displaySettings = {
      showWaypoints: true,
      showFovCones: true,
      showLabels: false,
      showCameraLabels: false,
      categoryOpacity: {},
      labelCategoryOpacity: {},
    } as DisplaySettings;

    const { container } = render(
      <svg>
        <CameraElementView
          camera={camera}
          isSelected={false}
          isHighlighted={false}
          currentBeat={1}
          isPlaying={false}
          onSelect={vi.fn()}
          displaySettings={displaySettings}
        />
      </svg>,
    );

    const ghost = container.querySelector('.camera-waypoint-ghost');
    expect(ghost?.getAttribute('transform')).toBe('translate(100, 120) rotate(135)');
    expect(ghost?.getAttribute('data-waypoint-rotation')).toBe('135');
    expect(ghost?.querySelector('rect[x="-14"]')).toBeTruthy();
    expect(ghost?.querySelector('polygon[points="8,-10 18,-14 18,14 8,10"]')).toBeTruthy();
  });
});

describe('CameraElementView lens display', () => {
  const camera = {
    id: 'cam-a',
    type: 'camera',
    x: 10,
    y: 20,
    rotation: 0,
    name: 'Camera A',
    cameraLabel: 'A',
    color: '#0284c7',
    focalLength: 35,
    sensorFormat: 'Super35',
    fovAngle: 45,
    aspectRatio: '16:9',
    cameraHeight: 'Eye Level',
    rigType: 'Tripod',
    throwDistance: 280,
    path: [],
  } as CameraElement;

  const shot = {
    id: 'shot-1',
    shotNumber: '1/1',
    shotSize: 'MS',
    lensMm: 35,
    cameraAngle: 'Eye Level',
  } as Shot;

  const settings = (overrides: Partial<DisplaySettings> = {}): DisplaySettings =>
    ({
      showLabels: true,
      showCameraLabels: true,
      showShotNumberOnCamera: false,
      showShotSizeOnCamera: true,
      showShotLensOnCamera: false,
      showShotAngleOnCamera: true,
      categoryOpacity: {},
      labelCategoryOpacity: {},
      ...overrides,
    }) as DisplaySettings;

  const renderCamera = (displaySettings: DisplaySettings, lensMm = 35) => {
    const { container } = render(
      <svg>
        <CameraElementView
          camera={camera}
          isSelected={false}
          isHighlighted={false}
          currentBeat={1}
          isPlaying={false}
          onSelect={vi.fn()}
          displaySettings={displaySettings}
          shot={{ ...shot, lensMm }}
        />
      </svg>,
    );
    return container.textContent ?? '';
  };

  const countOf = (text: string, needle: string): number =>
    text.split(needle).length - 1;

  it('shows the lens exactly once, in the badge under the camera', () => {
    const text = renderCamera(settings({ showShotLensOnCamera: true }));
    expect(text).toContain('MS • 35mm • Eye Level');
    expect(countOf(text, '35mm')).toBe(1);
  });

  it('shows nothing lens-related when the Lens toggle is off', () => {
    const text = renderCamera(settings());
    expect(text).not.toContain('35mm');
    expect(text).not.toContain('45°');
  });

  it('shows a per-shot lens override from the shot, not the camera body', () => {
    const text = renderCamera(settings({ showShotLensOnCamera: true }), 50);
    expect(text).toContain('MS • 50mm • Eye Level');
  });
});
