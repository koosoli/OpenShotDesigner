import type { LightElement, ShapeElement } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { clampBeamPan, clampBeamTilt, resolveBeamAim } from '../../../domain/lighting/beamAim';
import { useSceneView } from '../../canvas/useSceneView';
import { RubricSection } from '../shared/InspectorPrimitives';

export function FixtureBeamAimControls({ fixture, isLight }: { fixture: LightElement | ShapeElement; isLight: boolean }) {
  const { project, activeSetup, updateElement } = useFloorPlan();
  const view = useSceneView(project.id + ':' + activeSetup.id);
  const aim = resolveBeamAim(fixture, view.lightTilt);
  return <RubricSection title="Beam aim" persistKey="fixture.beam-aim" defaultOpen isLight={isLight}>
    <div className="space-y-3">
      <AimAxis key={`${fixture.id}-pan`} label="Beam pan" min={-180} max={180} value={aim.panOffsetDeg}
        onChange={value => updateElement(fixture.id, { beamPanDeg: clampBeamPan(value) })} />
      <AimAxis key={`${fixture.id}-tilt`} label="Beam tilt" min={-90} max={90} value={aim.tiltDeg}
        onChange={value => updateElement(fixture.id, { beamTiltDeg: clampBeamTilt(value) })} />
      <p className="text-[10px] text-ink-muted">Pan is relative to the fixture body. Positive tilt aims down; negative tilt aims up. {fixture.type === 'light' ? 'Tilt affects 3D lighting; the 2D plan shows the pan direction.' : 'Aim affects 3D lighting; the library symbol keeps its body orientation.'} Omnidirectional sources ignore aim.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => updateElement(fixture.id, { beamPanDeg: undefined })}
          className="rounded border border-line-strong bg-field px-2 py-1 text-xs">Reset beam pan</button>
        <button type="button" onClick={() => updateElement(fixture.id, { beamTiltDeg: undefined })}
          className="rounded border border-line-strong bg-field px-2 py-1 text-xs">Use scene tilt</button>
      </div>
      {fixture.beamTiltDeg == null && <p className="text-[10px] text-ink-muted">Using scene preview tilt: {aim.tiltDeg}°</p>}
    </div>
  </RubricSection>;
}

function AimAxis({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (degrees: number) => void;
}) {
  return <div className="space-y-1">
    <label className="flex items-center gap-2 text-xs font-semibold">{label}
      <input key={value} aria-label={`${label} (degrees)`} type="number" min={min} max={max} step="1" defaultValue={value}
        onBlur={event => {
          const input = event.currentTarget;
          if (!Number.isFinite(input.valueAsNumber)) { input.value = String(value); return; }
          if (input.valueAsNumber !== value) onChange(input.valueAsNumber);
        }}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.stopPropagation();
          if (event.key === 'Escape') event.currentTarget.value = String(value);
          event.currentTarget.blur();
        }} className="min-w-0 flex-1 rounded border border-line-strong bg-field px-2 py-1 font-mono text-xs" />°
    </label>
    <input type="range" aria-label={`${label} slider`} min={min} max={max} step="1" value={value}
      onChange={event => onChange(event.currentTarget.valueAsNumber)} className="w-full accent-sky-500" />
  </div>;
}
