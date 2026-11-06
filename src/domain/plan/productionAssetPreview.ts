import type { PropType } from '../../types';
import { stageAssetPreview } from './stageAssetPreview';
import { setAssetPreview } from './setAssetPreview';
import { accessoryAssetPreview } from './accessoryAssetPreview';

/** Shared aliases ensure existing prop placements and library symbols use the same models. */
export const PRODUCTION_PREVIEW_ALIASES: Readonly<Record<string, string>> = {
  stage: 'stage', stage_riser: 'riser', stage_runway: 'stage', stage_truss: 'tower',
  speaker_stack: 'speaker', speaker_array: 'array', sub_stack: 'sub', monitor_wedge: 'wedge',
  foh_console: 'console', monitor_console: 'console', video_wall: 'screen', amp_stack: 'speaker',
  drum_kit: 'drums', keyboard_rig: 'keyboard', mic_stand: 'mic', barricade: 'barrier',
  sound_boom: 'boom', c_stand: 'cstand', tripod: 'tripod', director_chair: 'director-chair',
  apple_box: 'apple', camera_cart: 'cart', green_screen: 'backdrop', plant: 'plant', tree: 'tree',
  stairs: 'stairs', table_coffee: 'coffee', bar_counter: 'counter', bar_stool: 'stool', tv: 'tv',
  sofa_sectional: 'sectional', stove: 'stove',
  fridge: 'fridge', sink: 'sink', toilet: 'toilet', bathtub: 'bathtub', shower: 'shower', radiator: 'radiator', column: 'column', railing: 'barrier',
  'staging.stage-deck': 'riser', 'staging.main-stage': 'stage', 'staging.runway': 'stage',
  'staging.truss-tower': 'tower', 'staging.truss-goalpost': 'goalpost', 'staging.circular-truss-4m': 'truss-ring',
  'staging.box-truss-1m': 'truss', 'staging.box-truss-2m': 'truss', 'staging.box-truss-3m': 'truss',
  'staging.ladder-truss-2m': 'ladder',
  'staging.triangle-truss-2m': 'triangle', 'staging.truss-base-plate': 'baseplate',
  'staging.truss-corner-90': 'truss-corner', 'staging.truss-t-junction': 'truss-t', 'staging.truss-cross-junction': 'truss-cross',
  'staging.foh-barrier': 'barrier', 'staging.drum-riser': 'riser', 'staging.camera-pit': 'barrier',
  'audio.dj-booth': 'dj', 'audio.line-array-hang': 'array', 'audio.sub-array': 'sub', 'audio.delay-tower': 'delay',
  'audio.monitor-wedge': 'wedge', 'audio.foh-console': 'console', 'audio.monitor-console': 'console',
  'backline.mic-stand': 'mic', 'backline.drum-kit': 'drums', 'backline.keyboard-rig': 'keyboard', 'backline.guitar-amp': 'speaker',
  'video.led-wall': 'screen', 'broadcast.vision-mixer': 'console', 'broadcast.ccu': 'console',
  'broadcast.commentary-desk': 'desk', 'broadcast.monitor-wall': 'monitor-wall',
  'grip.sandbag': 'sandbag', 'grip.c-stand-flag': 'flag',
  'arch.sink': 'sink', 'arch.toilet': 'toilet', 'arch.bathtub': 'bathtub', 'arch.shower': 'shower', 'arch.fridge': 'fridge',
  'arch.stairs': 'stairs', 'arch.structural-column': 'column', 'arch.hob': 'hob', 'arch.oven-range': 'stove',
  'arch.dishwasher': 'dishwasher', 'arch.washing-machine': 'washer', 'arch.bathroom-vanity': 'sink',
};

export function productionAssetPreview(propType: PropType | undefined, symbolId: string | undefined, paint: string) {
  const kind = PRODUCTION_PREVIEW_ALIASES[symbolId ?? propType ?? ''];
  return (kind ? stageAssetPreview(kind, paint) ?? setAssetPreview(kind, paint) : undefined)
    ?? accessoryAssetPreview(symbolId ?? propType ?? '', paint);
}
