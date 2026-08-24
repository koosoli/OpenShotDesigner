/**
 * The inspector, driven the way a user drives it.
 *
 * Named in the audit as one of the two large panels with no behaviour
 * coverage. It is the app's main write surface: almost every field on almost
 * every element is edited here, and almost all of them are `<select>`s feeding
 * union-typed fields — which until recently were written with
 * `e.target.value as any`, the one place a raw DOM string reached persisted
 * project state with no check at all.
 *
 * So the cases below are about what gets STORED, not what gets painted, and
 * they concentrate on the two things a cast used to hide: that the value a
 * dropdown offers is the value the project ends up holding, and that a value
 * outside the union cannot get in.
 *
 * Mounted over the real provider (see `renderPanel`).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPanel } from './renderPanel';
import { ASPECT_RATIOS, CAMERA_RIGS, SENSOR_FORMATS } from '../../constants/presets';

afterEach(cleanup);

const mount = () => renderPanel({ module: 'inspector/InspectorPanel', exportName: 'InspectorPanel' });

/** Select the first camera on the plan, so the camera inspector renders. */
const selectFirstCamera = async (mounted: Awaited<ReturnType<typeof mount>>) => {
  const camera = mounted
    .project()
    .setups.find((setup) => setup.id === mounted.project().activeSetupId)
    ?.elements.find((element) => element.type === 'camera');
  if (!camera) throw new Error('the sample project has no camera to inspect');
  await mounted.act(() => mounted.api().selectElements([camera.id]));
  return camera.id;
};

const cameraById = (mounted: Awaited<ReturnType<typeof mount>>, id: string) =>
  mounted
    .project()
    .setups.flatMap((setup) => setup.elements)
    .find((element) => element.id === id) as { rigType?: string; sensorFormat?: string; aspectRatio?: string };

describe('InspectorPanel — scene fields', () => {
  it('stores the time of day that was chosen', async () => {
    const user = userEvent.setup();
    const mounted = await mount();

    await user.selectOptions(screen.getByLabelText('Lighting / Time of Day'), 'Night EXT');

    const active = mounted.project().setups.find((setup) => setup.id === mounted.project().activeSetupId);
    expect(active?.timeOfDay).toBe('Night EXT');
  });

  it('stores every aspect ratio the dropdown offers', async () => {
    // The guarantee `parseOption` exists for: the allowed set IS the rendered
    // option list, so nothing the user can pick can be rejected — and nothing
    // outside it can be written.
    const user = userEvent.setup();
    const mounted = await mount();
    const field = screen.getByLabelText('Project Aspect Ratio');

    for (const ratio of ASPECT_RATIOS) {
      await user.selectOptions(field, ratio.value);
      const active = mounted
        .project()
        .setups.find((setup) => setup.id === mounted.project().activeSetupId);
      expect(active?.aspectRatio).toBe(ratio.value);
    }
  });
});

describe('InspectorPanel — camera fields', () => {
  it('stores every camera rig the dropdown offers', async () => {
    const user = userEvent.setup();
    const mounted = await mount();
    const cameraId = await selectFirstCamera(mounted);
    const field = await screen.findByLabelText('Camera Rig');

    for (const rig of CAMERA_RIGS) {
      await user.selectOptions(field, rig.value);
      expect(cameraById(mounted, cameraId).rigType).toBe(rig.value);
    }
  });

  it('stores every sensor format the dropdown offers', async () => {
    const user = userEvent.setup();
    const mounted = await mount();
    const cameraId = await selectFirstCamera(mounted);
    const field = await screen.findByLabelText('Sensor Format');

    for (const format of SENSOR_FORMATS) {
      await user.selectOptions(field, format.value);
      expect(cameraById(mounted, cameraId).sensorFormat).toBe(format.value);
    }
  });

  it('leaves the field alone when the browser reports a value it does not offer', async () => {
    /**
     * The failure the cast used to allow. An `<option>` renamed while the
     * union is not — or any other route by which a stray string reaches the
     * handler — used to write that string straight into the project, where no
     * renderer has a case for it: a camera that draws with no rig, months
     * later, with nothing to grep for.
     *
     * Driven through the change event directly, because the point is precisely
     * a value no user could select.
     */
    const user = userEvent.setup();
    const mounted = await mount();
    const cameraId = await selectFirstCamera(mounted);
    const field = (await screen.findByLabelText('Camera Rig')) as HTMLSelectElement;

    await user.selectOptions(field, CAMERA_RIGS[0].value);
    const before = cameraById(mounted, cameraId).rigType;

    await mounted.act(() => {
      const option = document.createElement('option');
      option.value = 'Hoverboard';
      field.appendChild(option);
      field.value = 'Hoverboard';
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(cameraById(mounted, cameraId).rigType).toBe(before);
  });
});
