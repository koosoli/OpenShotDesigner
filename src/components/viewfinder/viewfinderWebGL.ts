import { VIEWFINDER_FLOOR, VIEWFINDER_SKY, type ViewfinderPose } from '../../domain/camera/viewfinderScene';
import { LIT_LIMITS, LIT_STRIDE, UNLIT_STRIDE, type ScenePreviewMesh } from '../../domain/plan/scenePreviewMesh';

const vertex = `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec3 tint;
  attribute float surface;
  uniform vec3 eye, right, up, forward;
  uniform vec2 lens;
  uniform float ground;
  uniform float orthographic;
  varying vec3 color;
  varying vec3 worldNormal;
  varying vec3 worldPosition;
  varying float surfaceId;
  varying float distanceMetres;
  void main() {
    vec3 p = position + vec3(eye.xy * ground, 0.0) - eye;
    float depth = dot(p, forward);
    // 30 mm near plane and 300 m far plane, in WebGL clip space.
    gl_Position = vec4(dot(p, right) * lens.x, dot(p, up) * lens.y,
      depth * 1.00020002 - 60.0060006, depth);
    if (orthographic > 0.0) gl_Position = vec4(dot(p, right) * lens.x, dot(p, up) * lens.y,
      depth / 300000.0 * 2.0 - 1.0, 1.0);
    color = tint;
    worldNormal = normal;
    worldPosition = position;
    surfaceId = surface;
    // Fade the ground into the horizon while retaining the contrast of objects.
    distanceMetres = depth * 0.001 * ground;
  }
`;
const fragment = `
  precision mediump float;
  varying vec3 color;
  varying float distanceMetres;
  uniform vec3 sky;
  void main() {
    gl_FragColor = vec4(mix(color, sky, smoothstep(9.0, 65.0, distanceMetres)), 1.0);
  }
`;

const LIGHT_VECTORS = LIT_LIMITS.lights * 4;
const BLOCKER_VECTORS = LIT_LIMITS.blockers * (2 + LIT_LIMITS.planes);
// Mirrors sceneLighting.ts: samplePreviewLighting and isLightBlocked are the reference this shader implements.
const litFragment = `
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
  uniform vec4 lightData[${LIGHT_VECTORS}];
  uniform vec4 blockerData[${BLOCKER_VECTORS}];

  bool blocked(vec3 from, vec3 to, float source, float surface) {
    vec3 delta = to - from;
    vec3 segmentMin = min(from, to);
    vec3 segmentMax = max(from, to);
    for (int b = 0; b < ${LIT_LIMITS.blockers}; b++) {
      if (float(b) >= blockerCount) break;
      vec4 low = blockerData[b * ${2 + LIT_LIMITS.planes}];
      vec4 high = blockerData[b * ${2 + LIT_LIMITS.planes} + 1];
      if (low.w == source || low.w == surface) continue;
      if (any(lessThan(segmentMax, low.xyz)) || any(greaterThan(segmentMin, high.xyz))) continue;
      float near = 0.001;
      float far = 0.999;
      bool clear = false;
      for (int p = 0; p < ${LIT_LIMITS.planes}; p++) {
        if (float(p) >= high.w) break;
        vec4 plane = blockerData[b * ${2 + LIT_LIMITS.planes} + 2 + p];
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
    for (int i = 0; i < ${LIT_LIMITS.lights}; i++) {
      if (float(i) >= lightCount) break;
      vec4 origin = lightData[i * 4];
      vec4 aim = lightData[i * 4 + 1];
      vec4 emission = lightData[i * 4 + 2];
      vec4 identity = lightData[i * 4 + 3];
      vec3 delta = worldPosition - origin.xyz;
      float span = length(delta);
      if (span < 1.0) continue;
      vec3 direction = delta / span;
      float cone = emission.a > 0.5 ? 1.0 : clamp((dot(direction, aim.xyz) - origin.a) / max(0.001, aim.a - origin.a), 0.0, 1.0);
      float incidence = max(0.0, -dot(normal, direction));
      if (cone <= 0.0 || incidence <= 0.0) continue;
      if (blocked(origin.xyz, worldPosition, identity.x, surfaceId)) continue;
      light += emission.rgb * cone * incidence / (1.0 + pow(span / 2000.0, 2.0));
    }
    gl_FragColor = vec4(1.0 - exp(-color * light), 1.0);
  }
`;

const barrelVertex = `
  attribute vec2 position;
  varying vec2 screen;
  void main() {
    screen = position;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;
const barrelFragment = `
  precision mediump float;
  varying vec2 screen;
  uniform sampler2D image;
  uniform vec2 radialScale;
  uniform float strength, overscan;
  void main() {
    vec2 radial = screen * radialScale;
    float stretch = 1.0 + strength * dot(radial, radial);
    gl_FragColor = texture2D(image, 0.5 + 0.5 * screen * stretch / overscan);
  }
`;

const groundVertices = new Float32Array([
  [-300000, -300000], [300000, -300000], [300000, 300000],
  [-300000, -300000], [300000, 300000], [-300000, 300000],
].flatMap(([x, y]) => [x, y, -1, ...VIEWFINDER_FLOOR]));

const UNIFORMS = ['eye', 'right', 'up', 'forward', 'lens', 'ground', 'orthographic', 'sky', 'ambient', 'lightCount', 'blockerCount', 'lightData', 'blockerData'] as const;
type Uniform = typeof UNIFORMS[number];

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (program && vs && fs) {
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!program || !vs || !fs || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

interface SceneProgram {
  program: WebGLProgram;
  position: number;
  normal: number;
  tint: number;
  surface: number;
  uniforms: Record<Uniform, WebGLUniformLocation | null>;
}

function createSceneProgram(gl: WebGLRenderingContext, fragmentSource: string): SceneProgram | null {
  const program = link(gl, vertex, fragmentSource);
  if (!program) return null;
  const uniforms = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)])) as SceneProgram['uniforms'];
  return {
    program,
    position: gl.getAttribLocation(program, 'position'),
    normal: gl.getAttribLocation(program, 'normal'),
    tint: gl.getAttribLocation(program, 'tint'),
    surface: gl.getAttribLocation(program, 'surface'),
    uniforms,
  };
}

function createBarrelPass(gl: WebGLRenderingContext) {
  const program = link(gl, barrelVertex, barrelFragment);
  const texture = gl.createTexture();
  const triangle = gl.createBuffer();
  if (!program || !texture || !triangle) {
    gl.deleteProgram(program);
    gl.deleteTexture(texture);
    gl.deleteBuffer(triangle);
    return null;
  }

  const position = gl.getAttribLocation(program, 'position');
  const radialScale = gl.getUniformLocation(program, 'radialScale');
  const strength = gl.getUniformLocation(program, 'strength');
  const overscan = gl.getUniformLocation(program, 'overscan');
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  let textureWidth = 0;
  let textureHeight = 0;
  return {
    draw(width: number, height: number, scaleX: number, scaleY: number, amount: number, margin: number) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Copy the resolved, antialiased scene before warping it in image space.
      if (width !== textureWidth || height !== textureHeight) {
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, width, height, 0);
        textureWidth = width;
        textureHeight = height;
      } else {
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(program);
      gl.uniform2f(radialScale, scaleX, scaleY);
      gl.uniform1f(strength, amount);
      gl.uniform1f(overscan, margin);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(position);
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteTexture(texture);
      gl.deleteBuffer(triangle);
    },
  };
}

export function createViewfinderRenderer(canvas: HTMLCanvasElement) {
  if (typeof WebGLRenderingContext === 'undefined') return null;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  // The unlit program is required. The lit program is separate, so a device with few
  // fragment uniforms still gets the unlit view and lit draws simply report failure.
  const unlit = createSceneProgram(gl, fragment);
  if (!unlit) return null;
  const lit = createSceneProgram(gl, litFragment);
  const ground = gl.createBuffer();
  const scene = gl.createBuffer();
  if (!ground || !scene) {
    gl.deleteBuffer(ground);
    gl.deleteBuffer(scene);
    gl.deleteProgram(unlit.program);
    if (lit) gl.deleteProgram(lit.program);
    return null;
  }

  const barrel = createBarrelPass(gl);
  gl.useProgram(unlit.program);
  gl.uniform3f(unlit.uniforms.sky, ...VIEWFINDER_SKY);
  gl.clearColor(...VIEWFINDER_SKY, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, ground);
  gl.bufferData(gl.ARRAY_BUFFER, groundVertices, gl.STATIC_DRAW);

  let currentMesh: Float32Array | undefined;
  // Lit meshes carry normal and surface per vertex; unlit meshes carry only pre-shaded colour.
  const bindVertices = (program: SceneProgram, buffer: WebGLBuffer, litLayout: boolean) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = (litLayout ? LIT_STRIDE : UNLIT_STRIDE) * 4;
    gl.enableVertexAttribArray(program.position);
    gl.vertexAttribPointer(program.position, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(program.tint);
    gl.vertexAttribPointer(program.tint, 3, gl.FLOAT, false, stride, litLayout ? 24 : 12);
    if (litLayout) {
      gl.enableVertexAttribArray(program.normal);
      gl.vertexAttribPointer(program.normal, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(program.surface);
      gl.vertexAttribPointer(program.surface, 1, gl.FLOAT, false, stride, 36);
    } else {
      gl.disableVertexAttribArray(program.normal);
      gl.vertexAttrib3f(program.normal, 0, 0, 1);
      gl.disableVertexAttribArray(program.surface);
      gl.vertexAttrib1f(program.surface, -1);
    }
  };
  const unbindVertices = (program: SceneProgram) => {
    gl.disableVertexAttribArray(program.position);
    gl.disableVertexAttribArray(program.tint);
    gl.disableVertexAttribArray(program.normal);
    gl.disableVertexAttribArray(program.surface);
  };
  const setPose = (program: SceneProgram, pose: ViewfinderPose, aspect: number, overscan: number, groundMode: number) => {
    const u = program.uniforms;
    gl.useProgram(program.program);
    gl.uniform3fv(u.eye, pose.eye);
    gl.uniform3fv(u.right, pose.right);
    gl.uniform3fv(u.up, pose.up);
    gl.uniform3fv(u.forward, pose.forward);
    const focal = 1 / (pose.tanHalfHorizontal * overscan);
    const ortho = pose.orthographicSpan;
    gl.uniform1f(u.orthographic, ortho ? 1 : 0);
    gl.uniform2f(u.lens, ortho ? 2 / ortho : focal, ortho ? 2 * aspect / ortho : aspect * focal);
    gl.uniform1f(u.ground, groundMode);
  };

  return {
    draw(mesh: ScenePreviewMesh, pose: ViewfinderPose, options: { ground?: boolean } = {}) {
      if (gl.isContextLost()) return false;
      const target = mesh.lit ? lit : unlit;
      if (!target) return false;
      if (currentMesh !== mesh.vertices) {
        gl.bindBuffer(gl.ARRAY_BUFFER, scene);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        currentMesh = mesh.vertices;
      }
      const { width, height } = canvas;
      const aspect = width / height;
      const scaleX = Math.min(1, aspect);
      const scaleY = Math.min(1, 1 / aspect);
      const amount = barrel ? pose.barrelDistortion : 0;
      // Render a wider source so the inverse warp has pixels at every corner.
      const overscan = 1 + amount * (scaleX * scaleX + scaleY * scaleY);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // The infinite ground is only for unlit views: lit floor tiles sit below it.
      if (!pose.orthographicSpan && !mesh.lit && options.ground !== false) {
        setPose(unlit, pose, aspect, overscan, 1);
        bindVertices(unlit, ground, false);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        unbindVertices(unlit);
      }
      setPose(target, pose, aspect, overscan, 0);
      if (mesh.lit && lit) {
        const u = lit.uniforms;
        gl.uniform1f(u.ambient, mesh.lit.ambient);
        gl.uniform1f(u.lightCount, mesh.lit.lightCount);
        gl.uniform1f(u.blockerCount, mesh.lit.blockerCount);
        gl.uniform4fv(u.lightData, mesh.lit.lightData);
        gl.uniform4fv(u.blockerData, mesh.lit.blockerData);
      }
      bindVertices(target, scene, Boolean(mesh.lit));
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / (mesh.lit ? LIT_STRIDE : UNLIT_STRIDE));
      unbindVertices(target);
      if (amount > 0) barrel?.draw(width, height, scaleX, scaleY, amount, overscan);
      return true;
    },
    dispose() {
      barrel?.dispose();
      gl.deleteBuffer(ground);
      gl.deleteBuffer(scene);
      gl.deleteProgram(unlit.program);
      if (lit) gl.deleteProgram(lit.program);
    },
  };
}
