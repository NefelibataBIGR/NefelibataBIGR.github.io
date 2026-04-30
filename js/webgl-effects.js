/* webgl-effects.js — NeBIGR's Blog
 * Self-contained: WebGL fluid background + 3D card tilt + cursor spotlight.
 * Auto-degrades for reduced-motion / mobile / low FPS / no WebGL.
 */
(function () {
  'use strict';

  // -------------------- 0. Capability detection --------------------
  var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = matchMedia('(max-width: 768px)').matches || ('ontouchstart' in window && !matchMedia('(hover: hover)').matches);

  // Locked to dark mode.
  var DARK_PALETTE = [[0.36, 0.55, 1.00], [0.70, 0.40, 1.00], [1.00, 0.36, 0.86]];
  document.documentElement.dataset.theme = 'dark';

  if (reducedMotion) return; // full degradation: only static gradient remains via CSS

  // -------------------- 1. WebGL fluid simulation --------------------
  function getWebGLContext(canvas) {
    var params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    var gl = canvas.getContext('webgl2', params);
    var isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    if (!gl) return null;

    var halfFloat, supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    gl.clearColor(0, 0, 0, 0);

    var halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
    var formatRGBA, formatRG, formatR;
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG   = getSupportedFormat(gl, gl.RG16F,   gl.RG,   halfFloatTexType);
      formatR    = getSupportedFormat(gl, gl.R16F,    gl.RED,  halfFloatTexType);
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG   = formatRGBA;
      formatR    = formatRGBA;
    }
    if (!formatRGBA) return null;

    return { gl: gl, ext: { formatRGBA: formatRGBA, formatRG: formatRG, formatR: formatR, halfFloatTexType: halfFloatTexType, supportLinearFiltering: supportLinearFiltering } };
  }

  function getSupportedFormat(gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case gl.R16F:    return getSupportedFormat(gl, gl.RG16F,   gl.RG,   type);
        case gl.RG16F:   return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat: internalFormat, format: format };
  }

  function supportRenderTextureFormat(gl, internalFormat, format, type) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[webgl-effects] shader compile failed:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[webgl-effects] link failed:', gl.getProgramInfoLog(p));
      return null;
    }
    var uniforms = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      uniforms[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, uniforms: uniforms };
  }

  function createFBO(gl, w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture: tex, fbo: fbo, width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
      attach: function (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; }
    };
  }

  function createDoubleFBO(gl, w, h, internalFormat, format, type, filter) {
    var f1 = createFBO(gl, w, h, internalFormat, format, type, filter);
    var f2 = createFBO(gl, w, h, internalFormat, format, type, filter);
    return {
      width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
      get read () { return f1; }, set read (v) { f1 = v; },
      get write() { return f2; }, set write(v) { f2 = v; },
      swap: function () { var t = f1; f1 = f2; f2 = t; }
    };
  }

  // ---- shaders ----
  var VS = [
    'precision highp float;',
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform vec2 texelSize;',
    'void main () {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  vL = vUv - vec2(texelSize.x, 0.0);',
    '  vR = vUv + vec2(texelSize.x, 0.0);',
    '  vT = vUv + vec2(0.0, texelSize.y);',
    '  vB = vUv - vec2(0.0, texelSize.y);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_DISPLAY = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; uniform sampler2D uTexture;',
    'void main(){ vec3 c = texture2D(uTexture, vUv).rgb; gl_FragColor = vec4(c, 1.0); }'
  ].join('\n');

  var FS_SPLAT = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; uniform sampler2D uTarget;',
    'uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;',
    'void main(){',
    '  vec2 p = vUv - point.xy; p.x *= aspectRatio;',
    '  vec3 splat = exp(-dot(p,p)/radius) * color;',
    '  vec3 base = texture2D(uTarget, vUv).xyz;',
    '  gl_FragColor = vec4(base + splat, 1.0);',
    '}'
  ].join('\n');

  var FS_ADVECTION = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uVelocity; uniform sampler2D uSource;',
    'uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;',
    'vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize){',
    '  vec2 st = uv/tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);',
    '  vec4 a = texture2D(sam, (iuv + vec2(0.5,0.5)) * tsize);',
    '  vec4 b = texture2D(sam, (iuv + vec2(1.5,0.5)) * tsize);',
    '  vec4 c = texture2D(sam, (iuv + vec2(0.5,1.5)) * tsize);',
    '  vec4 d = texture2D(sam, (iuv + vec2(1.5,1.5)) * tsize);',
    '  return mix(mix(a,b,fuv.x), mix(c,d,fuv.x), fuv.y);',
    '}',
    'void main(){',
    '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;',
    '  vec4 result = bilerp(uSource, coord, dyeTexelSize);',
    '  float decay = 1.0 + dissipation * dt;',
    '  gl_FragColor = result / decay;',
    '}'
  ].join('\n');

  var FS_DIVERGENCE = [
    'precision mediump float; precision mediump sampler2D;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uVelocity, vL).x;',
    '  float R = texture2D(uVelocity, vR).x;',
    '  float T = texture2D(uVelocity, vT).y;',
    '  float B = texture2D(uVelocity, vB).y;',
    '  vec2 C = texture2D(uVelocity, vUv).xy;',
    '  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;',
    '  if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;',
    '  float div = 0.5 * (R - L + T - B);',
    '  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_PRESSURE = [
    'precision mediump float; precision mediump sampler2D;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uPressure; uniform sampler2D uDivergence;',
    'void main(){',
    '  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;',
    '  float divergence = texture2D(uDivergence, vUv).x;',
    '  float pressure = (L + R + B + T - divergence) * 0.25;',
    '  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_GRADSUB = [
    'precision mediump float; precision mediump sampler2D;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uPressure; uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;',
    '  vec2 velocity = texture2D(uVelocity, vUv).xy;',
    '  velocity.xy -= vec2(R - L, T - B);',
    '  gl_FragColor = vec4(velocity, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_CLEAR = [
    'precision mediump float; precision mediump sampler2D;',
    'varying vec2 vUv; uniform sampler2D uTexture; uniform float value;',
    'void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }'
  ].join('\n');

  // ---- main fluid runner ----
  var fluidState = null;

  function initFluid() {
    var canvas = document.getElementById('webgl-fluid-canvas');
    if (!canvas) return false;

    var ctx = getWebGLContext(canvas);
    if (!ctx) return false;
    var gl = ctx.gl, ext = ctx.ext;

    var simRes = 128, dyeRes = isMobile ? 256 : 512;
    var aspect = canvas.clientWidth / canvas.clientHeight;
    function getRes(res) {
      var a = aspect; if (a < 1) a = 1 / a;
      var min = Math.round(res), max = Math.round(res * a);
      return aspect > 1 ? { width: max, height: min } : { width: min, height: max };
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.floor(canvas.clientWidth * dpr);
      var h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        aspect = w / h;
      }
    }
    resize();

    // quad
    var quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, -1,1, 1,1, 1,-1]), gl.STATIC_DRAW);
    var idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2, 0,2,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function blit(target) {
      if (!target) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    var vs = compile(gl, gl.VERTEX_SHADER, VS);
    if (!vs) return false;
    var pDisplay = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_DISPLAY));
    var pSplat   = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_SPLAT));
    var pAdv     = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_ADVECTION));
    var pDiv     = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_DIVERGENCE));
    var pPress   = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_PRESSURE));
    var pGrad    = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_GRADSUB));
    var pClear   = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_CLEAR));
    if (!pDisplay || !pSplat || !pAdv || !pDiv || !pPress || !pGrad || !pClear) return false;

    var simSize = getRes(simRes), dyeSize = getRes(dyeRes);
    var halfType = ext.halfFloatTexType;
    var filter = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    var dye      = createDoubleFBO(gl, dyeSize.width, dyeSize.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, halfType, filter);
    var velocity = createDoubleFBO(gl, simSize.width, simSize.height, ext.formatRG.internalFormat,   ext.formatRG.format,   halfType, filter);
    var divergence = createFBO(gl, simSize.width, simSize.height, ext.formatR.internalFormat, ext.formatR.format, halfType, gl.NEAREST);
    var pressure   = createDoubleFBO(gl, simSize.width, simSize.height, ext.formatR.internalFormat, ext.formatR.format, halfType, gl.NEAREST);

    var pointers = [{ id: -1, x: 0.5, y: 0.5, dx: 0, dy: 0, color: [0.4, 0.4, 1.0], down: false, moved: false }];

    function correctRadius(r) { var ar = canvas.width / canvas.height; if (ar > 1) r *= ar; return r; }
    function pickColor() { return DARK_PALETTE[Math.floor(Math.random() * DARK_PALETTE.length)].slice(); }

    function splat(x, y, dx, dy, col) {
      gl.useProgram(pSplat.program);
      gl.uniform1i(pSplat.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(pSplat.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(pSplat.uniforms.point, x, y);
      gl.uniform3f(pSplat.uniforms.color, dx, dy, 0);
      gl.uniform1f(pSplat.uniforms.radius, correctRadius(0.0002));
      blit(velocity.write); velocity.swap();

      gl.uniform1i(pSplat.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(pSplat.uniforms.color, col[0], col[1], col[2]);
      blit(dye.write); dye.swap();
    }

    function applyInputs() {
      pointers.forEach(function (p) {
        if (p.moved) {
          p.moved = false;
          splat(p.x, p.y, p.dx * 6000, p.dy * 6000, p.color);
        }
      });
    }

    function step(dt) {
      gl.disable(gl.BLEND);

      // advect velocity
      gl.useProgram(pAdv.program);
      gl.uniform2f(pAdv.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform2f(pAdv.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      var vid = velocity.read.attach(0);
      gl.uniform1i(pAdv.uniforms.uVelocity, vid);
      gl.uniform1i(pAdv.uniforms.uSource, vid);
      gl.uniform1f(pAdv.uniforms.dt, dt);
      gl.uniform1f(pAdv.uniforms.dissipation, 0.2);
      blit(velocity.write); velocity.swap();

      // advect dye
      gl.uniform2f(pAdv.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(pAdv.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(pAdv.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(pAdv.uniforms.dissipation, 1.0);
      blit(dye.write); dye.swap();

      applyInputs();

      // divergence
      gl.useProgram(pDiv.program);
      gl.uniform2f(pDiv.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pDiv.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);

      // clear pressure
      gl.useProgram(pClear.program);
      gl.uniform1i(pClear.uniforms.uTexture, pressure.read.attach(0));
      gl.uniform1f(pClear.uniforms.value, 0.8);
      blit(pressure.write); pressure.swap();

      // pressure jacobi
      gl.useProgram(pPress.program);
      gl.uniform2f(pPress.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pPress.uniforms.uDivergence, divergence.attach(0));
      for (var i = 0; i < 20; i++) {
        gl.uniform1i(pPress.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write); pressure.swap();
      }

      // gradient subtract
      gl.useProgram(pGrad.program);
      gl.uniform2f(pGrad.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pGrad.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(pGrad.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write); velocity.swap();
    }

    function render() {
      gl.useProgram(pDisplay.program);
      gl.uniform1i(pDisplay.uniforms.uTexture, dye.read.attach(0));
      blit(null);
    }

    // pointer events on full window
    function updatePointer(p, x, y) {
      var rx = x / canvas.clientWidth, ry = 1.0 - y / canvas.clientHeight;
      p.dx = (rx - p.x) * 1.0; p.dy = (ry - p.y) * 1.0;
      p.x = rx; p.y = ry;
      p.moved = Math.abs(p.dx) > 0 || Math.abs(p.dy) > 0;
    }
    var ptr = pointers[0]; ptr.color = pickColor();

    function onMove(e) { updatePointer(ptr, e.clientX, e.clientY); }
    function onDown(e) { ptr.down = true; ptr.color = pickColor(); updatePointer(ptr, e.clientX, e.clientY); }
    function onUp() { ptr.down = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    // periodic random splats so the canvas isn't empty before user moves
    function randomSplat() {
      var col = pickColor();
      col[0] *= 10; col[1] *= 10; col[2] *= 10;
      var x = Math.random(), y = Math.random();
      var dx = (Math.random() - 0.5) * 1000, dy = (Math.random() - 0.5) * 1000;
      splat(x, y, dx, dy, col);
    }
    for (var k = 0; k < 6; k++) randomSplat();
    var splatTimer = setInterval(function () {
      if (document.hidden) return;
      if (Math.random() < 0.5) randomSplat();
    }, 4000);

    // resize on window
    var resizeRaf;
    function onResize() {
      clearTimeout(resizeRaf);
      resizeRaf = setTimeout(function () {
        resize();
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }, 200);
    }
    window.addEventListener('resize', onResize);

    // FPS monitor → degrade after 2s of <30fps
    var lastT = performance.now();
    var slowAccum = 0;
    var running = true;
    function loop(now) {
      if (!running) return;
      var dt = (now - lastT) / 1000; lastT = now;
      if (dt > 0.016666 * 2) slowAccum += dt; else slowAccum = Math.max(0, slowAccum - 0.016);
      if (slowAccum > 2.0) { destroy(); return; }
      if (dt > 0.05) dt = 0.05;
      step(dt);
      render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function destroy() {
      running = false;
      clearInterval(splatTimer);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', onResize);
      canvas.style.display = 'none';
      document.documentElement.dataset.fluid = 'off';
    }

    document.documentElement.dataset.fluid = 'on';
    fluidState = { destroy: destroy };
    return true;
  }

  // -------------------- 2. 3D card tilt --------------------
  function initTilt() {
    if (!window.VanillaTilt || isMobile) return;
    var selector = '.card, .friend-card, .about-card';
    function apply(nodes) {
      nodes.forEach(function (el) {
        if (el.dataset.tiltApplied) return;
        el.dataset.tiltApplied = '1';
        VanillaTilt.init(el, {
          max: 8, glare: true, 'max-glare': 0.25, scale: 1.02,
          speed: 400, perspective: 1200, gyroscope: false
        });
      });
    }
    apply(Array.prototype.slice.call(document.querySelectorAll(selector)));

    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches(selector)) apply([n]);
          var inside = n.querySelectorAll && n.querySelectorAll(selector);
          if (inside && inside.length) apply(Array.prototype.slice.call(inside));
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // -------------------- 3. Cursor spotlight --------------------
  function initSpotlight() {
    if (isMobile) return;
    var spot = document.getElementById('cursor-spotlight');
    if (!spot) return;
    spot.style.opacity = '1';
    var mx = 0, my = 0, raf = null;
    function frame() { spot.style.setProperty('--mx', mx + 'px'); spot.style.setProperty('--my', my + 'px'); raf = null; }
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }

  // -------------------- 4. Boot --------------------
  function boot() {
    initFluid();   // gracefully no-op if WebGL fails
    initTilt();    // waits on vanilla-tilt CDN; if not loaded yet, retry briefly
    initSpotlight();

    // Retry tilt init if vanilla-tilt loads after this script
    if (!window.VanillaTilt && !isMobile) {
      var tries = 0;
      var iv = setInterval(function () {
        if (window.VanillaTilt) { clearInterval(iv); initTilt(); }
        if (++tries > 40) clearInterval(iv); // ~4s
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
