import { LIT_LIMITS } from '../../domain/plan/scenePreviewMesh';
import { LIGHT_GRID_SIZE, LIGHT_TEXTURE_WIDTH, TILED_LIGHTING_LIMITS } from '../../domain/plan/tiledPreviewLighting';

const LIGHT_VECTORS = LIT_LIMITS.lights * 4;
const BLOCKER_VECTORS = LIT_LIMITS.blockers * (2 + LIT_LIMITS.planes);
// Mirrors sceneLighting.ts: samplePreviewLighting and isLightBlocked are the reference this shader implements.
export function lightingFragment(tiled: boolean) {
  const limits = tiled ? TILED_LIGHTING_LIMITS : LIT_LIMITS;
  return `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  varying vec3 color;
  varying vec3 worldNormal;
  varying vec3 worldPosition;
  varying float surfaceId;
  uniform float ambient;
  uniform float lightCount;
  uniform float blockerCount;
  ${tiled ? `
  uniform highp sampler2D lightingData;
  uniform float lightingHeight;
  uniform vec4 lightingGrid;
  uniform float blockerStart;

  vec4 record(float index) {
    vec2 coord = vec2(mod(index, ${LIGHT_TEXTURE_WIDTH}.0), floor(index / ${LIGHT_TEXTURE_WIDTH}.0));
    return texture2D(lightingData, (coord + 0.5) / vec2(${LIGHT_TEXTURE_WIDTH}.0, lightingHeight));
  }
  ` : `
  uniform vec4 lightData[${LIGHT_VECTORS}];
  uniform vec4 blockerData[${BLOCKER_VECTORS}];
  `}

  bool blocked(vec3 from, vec3 to, float source, float surface${tiled ? ', vec2 tileBlockers' : ''}) {
    vec3 delta = to - from;
    vec3 segmentMin = min(from, to);
    vec3 segmentMax = max(from, to);
    for (int b = 0; b < ${limits.blockers}; b++) {
      ${tiled ? `
      if (float(b) >= tileBlockers.y) break;
      float blockerIndex = record(tileBlockers.x + float(b)).x;
      float boundsIndex = blockerStart + blockerIndex * 2.0;
      vec4 low = record(boundsIndex);
      vec4 high = record(boundsIndex + 1.0);
      ` : `
      if (float(b) >= blockerCount) break;
      vec4 low = blockerData[b * ${2 + LIT_LIMITS.planes}];
      vec4 high = blockerData[b * ${2 + LIT_LIMITS.planes} + 1];
      `}
      if (low.w == source || low.w == surface) continue;
      if (any(lessThan(segmentMax, low.xyz)) || any(greaterThan(segmentMin, high.xyz))) continue;
      ${tiled ? 'float planes = record(blockerStart + blockerCount * 2.0 + blockerIndex).x;' : ''}
      float near = 0.001;
      float far = 0.999;
      bool clear = false;
      for (int p = 0; p < ${limits.planes}; p++) {
        if (float(p) >= high.w) break;
        vec4 plane = ${tiled ? 'record(planes + float(p))' : `blockerData[b * ${2 + LIT_LIMITS.planes} + 2 + p]`};
        float denominator = dot(plane.xyz, delta);
        float offset = plane.w - dot(plane.xyz, from);
        if (abs(denominator) < 1e-9) {
          if (offset < -0.01) { clear = true; break; }
          continue;
        }
        float t = offset / denominator;
        if (denominator < 0.0) near = max(near, t); else far = min(far, t);
        if (near > far) { clear = true; break; }
      }
      if (!clear && near <= far) return true;
    }
    return false;
  }

  void main() {
    vec3 normal = normalize(worldNormal);
    vec3 light = vec3(ambient);
    ${tiled ? `
    vec2 tile = clamp(floor((worldPosition.xy - lightingGrid.xy) / lightingGrid.zw),
      0.0, ${LIGHT_GRID_SIZE - 1}.0);
    vec4 header = record(tile.y * ${LIGHT_GRID_SIZE}.0 + tile.x);
    ` : ''}
    for (int i = 0; i < ${limits.lights}; i++) {
      ${tiled ? `
      if (float(i) >= header.y) break;
      float index = record(header.x + float(i)).x;
      vec4 origin = record(index);
      vec4 aim = record(index + 1.0);
      vec4 emission = record(index + 2.0);
      vec4 identity = record(index + 3.0);
      ` : `
      if (float(i) >= lightCount) break;
      vec4 origin = lightData[i * 4];
      vec4 aim = lightData[i * 4 + 1];
      vec4 emission = lightData[i * 4 + 2];
      vec4 identity = lightData[i * 4 + 3];
      `}
      vec3 delta = worldPosition - origin.xyz;
      float span = length(delta);
      if (span < 1.0) continue;
      vec3 direction = delta / span;
      float cone = emission.a > 0.5 ? 1.0 : clamp((dot(direction, aim.xyz) - origin.a) / max(0.001, aim.a - origin.a), 0.0, 1.0);
      float incidence = max(0.0, -dot(normal, direction));
      if (cone <= 0.0 || incidence <= 0.0) continue;
      if (blocked(origin.xyz, worldPosition, identity.x, surfaceId${tiled ? ', header.zw' : ''})) continue;
      light += emission.rgb * cone * incidence / (1.0 + pow(span / 2000.0, 2.0));
    }
    gl_FragColor = vec4(1.0 - exp(-color * light), 1.0);
  }
`;
}
