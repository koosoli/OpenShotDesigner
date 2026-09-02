import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { CameraElementView } from '../canvas/CameraElementView';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import type { CameraElement } from '../../types';

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
