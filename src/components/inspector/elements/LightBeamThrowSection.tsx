import type { LightElement } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { RubricSection } from '../shared/InspectorPrimitives';
import { Maximize } from 'lucide-react';
export function LightBeamThrowSection({ light, isLight }: { light: LightElement; isLight: boolean }) {
  const { updateElement } = useFloorPlan();
  return (<>
          {/* Rubric 3: Beam Geometry & Throw */}
          <RubricSection
            persistKey="lightinspector.beam-throw-angle"
            title="Beam Throw & Angle"
            icon={<Maximize className="w-3.5 h-3.5 text-accent-ink" />}
            badge={
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-accent-ink font-bold">
                {light.beamAngle}° · {light.throwDistance}px
              </span>
            }
            defaultOpen={false}
            isLight={isLight}
          >
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Beam Angle</span>
                  <span className="font-mono text-warn font-bold">{light.beamAngle}°</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={160}
                  value={light.beamAngle}
                  onChange={(e) => updateElement(light.id, { beamAngle: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Throw Distance</span>
                  <span className="font-mono text-warn font-bold">{light.throwDistance} px</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={400}
                  value={light.throwDistance}
                  onChange={(e) => updateElement(light.id, { throwDistance: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </RubricSection>

</>);
}
