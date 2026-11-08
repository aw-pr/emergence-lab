export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = mustCreate(gl.createProgram(), "program");

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`WebGL2 renderer shader link failed: ${message}`);
  }

  return program;
}

export function createQuadVao(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  quadBuffer: WebGLBuffer,
): WebGLVertexArrayObject {
  const positionLocation = gl.getAttribLocation(program, "a_position");
  if (positionLocation < 0) {
    throw new Error("WebGL2 renderer could not locate a_position attribute.");
  }

  const vao = mustCreate(gl.createVertexArray(), "vertex array");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = mustCreate(gl.createShader(type), "shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`WebGL2 renderer shader compile failed: ${message}`);
  }

  return shader;
}

export function mustCreate<T>(value: T | null, label: string): T {
  if (!value) {
    throw new Error(`WebGL2 renderer could not create ${label}.`);
  }
  return value;
}
