import { VIEWFINDER_FLOOR, VIEWFINDER_SKY, type ViewfinderPose } from '../../domain/camera/viewfinderScene';

const vertex = `
  attribute vec3 position;
  attribute vec3 tint;
  uniform vec3 eye, right, up, forward;
  uniform vec2 lens;
  uniform float ground;
  uniform float orthographic;
  varying vec3 color;
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
  const program = link(gl, vertex, fragment);
  if (!program) return null;
  const ground = gl.createBuffer();
  const scene = gl.createBuffer();
  if (!ground || !scene) {
    gl.deleteBuffer(ground);
    gl.deleteBuffer(scene);
    gl.deleteProgram(program);
    return null;
  }

  const position = gl.getAttribLocation(program, 'position');
  const tint = gl.getAttribLocation(program, 'tint');
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const eye = uniform('eye');
  const right = uniform('right');
  const up = uniform('up');
  const forward = uniform('forward');
  const lens = uniform('lens');
  const groundMode = uniform('ground');
  const barrel = createBarrelPass(gl);
  gl.useProgram(program);
  gl.uniform3f(uniform('sky'), ...VIEWFINDER_SKY);
  gl.clearColor(...VIEWFINDER_SKY, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, ground);
  gl.bufferData(gl.ARRAY_BUFFER, groundVertices, gl.STATIC_DRAW);

  let currentMesh: Float32Array | undefined;
  const drawBuffer = (buffer: WebGLBuffer, count: number, floor: boolean) => {
    gl.uniform1f(groundMode, floor ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(tint, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  };

  return {
    draw(mesh: Float32Array, pose: ViewfinderPose, options: { ground?: boolean } = {}) {
      if (gl.isContextLost()) return false;
      if (currentMesh !== mesh) {
        gl.bindBuffer(gl.ARRAY_BUFFER, scene);
        gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
        currentMesh = mesh;
      }
      const { width, height } = canvas;
      const aspect = width / height;
      const scaleX = Math.min(1, aspect);
      const scaleY = Math.min(1, 1 / aspect);
      const amount = barrel ? pose.barrelDistortion : 0;
      // Render a wider source so the inverse warp has pixels at every corner.
      const overscan = 1 + amount * (scaleX * scaleX + scaleY * scaleY);
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(tint);
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(eye, pose.eye);
      gl.uniform3fv(right, pose.right);
      gl.uniform3fv(up, pose.up);
      gl.uniform3fv(forward, pose.forward);
      const focal = 1 / (pose.tanHalfHorizontal * overscan);
      const ortho = pose.orthographicSpan;
      gl.uniform1f(uniform('orthographic'), ortho ? 1 : 0);
      gl.uniform2f(lens, ortho ? 2 / ortho : focal, ortho ? 2 * aspect / ortho : aspect * focal);
      if (!ortho && options.ground !== false) drawBuffer(ground, 6, true);
      drawBuffer(scene, mesh.length / 6, false);
      gl.disableVertexAttribArray(position);
      gl.disableVertexAttribArray(tint);
      if (amount > 0) barrel?.draw(width, height, scaleX, scaleY, amount, overscan);
      return true;
    },
    dispose() {
      barrel?.dispose();
      gl.deleteBuffer(ground);
      gl.deleteBuffer(scene);
      gl.deleteProgram(program);
    },
  };
}
