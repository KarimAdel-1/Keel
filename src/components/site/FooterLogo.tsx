"use client";

// Keel's logo under the footer's links, filled with moving water: contour lines of a field of waves, drawn on the GPU
// and clipped to the logo's shape. The cursor swells the water where it passes, and a click sends out ripples. It's a
// fluid-type design (its Three.js plane drawn here with WebGL directly, its controls left out at their starting values,
// its text the logo), in Keel's colours. It pauses while it's off screen; where WebGL isn't available, the logo shows
// still.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const LOGO = "/brand/keel-logo-dark.png";

// ── constants, grouped by concern ─────────────────────────

const RENDERER = {
  MAX_PIXEL_RATIO: 2, // cap retina scaling so the GPU doesn't die
};

const MASK = {
  INK_ALPHA_THRESHOLD: 64, // 0-255; logo pixels more opaque than this count as "ink"
  MAX_WIDTH_FRACTION: 0.99, // a hair inside the box, so the edges of the "k" and the "." aren't shaved
  MAX_HEIGHT_FRACTION: 0.98, // never let the logo exceed this share of the box's height
};

/** The design's controls, left at their starting values. */
const SETTINGS = {
  DENSITY: 9.0,
  SPEED: 0.28,
  TURB: 0.45,
};

const RIPPLE = {
  SLOT_COUNT: 4, // number of simultaneous ripple origins
  DECAY_RATE: 1.1, // exponential decay per second
  RING_FREQUENCY: 7.0, // spatial frequency of the concentric rings
  RING_SPEED_MUL: 9.0, // multiplied by uSpeed to get ring propagation rate
  DIST_FALLOFF: 2.2, // how fast rings fade with distance
  AMPLITUDE: 1.8, // peak height contribution
};

const MOUSE_SWELL = {
  DIST_FALLOFF: 2.5, // Gaussian-ish falloff around cursor
  FREQUENCY: 9.0, // spatial ring frequency
  SPEED_MUL: 5.0, // multiplied by uSpeed
  AMPLITUDE: 1.2,
};

const CONTOUR = {
  LINE_WIDTH: 0.22, // half-width of each contour band in tri() space
  AA_BASE: 0.015, // minimum anti-alias blur radius
  AA_DENSITY_SCALE: 0.005, // grows AA slightly as density increases
  WAVE_SCALE: 0.5, // maps wave height → tri() input
};

const MASK_BLEND = {
  // smoothstep edges for the logo mask: how crisply the water is clipped to the logo
  EDGE_LO: 0.38,
  EDGE_HI: 0.62,
};

/** Keel's colours: the footer's navy around the logo, and Keel blue running to teal inside it. */
const PALETTE = {
  BG: [0.016, 0.043, 0.122], // #040b1f
  FILL_FROM: [0.137, 0.282, 0.847], // #2348d8
  FILL_TO: [0.176, 0.831, 0.749], // #2dd4bf
};

// ── wave field ────────────────────────────────────────────
// Each row is one sinusoid in the height field h: amp * sin(fx*p.x + fy*p.y + t*ts + phase).
const BASE_WAVES = [
  { amp: 1.0, fx: 2.4, fy: 0.9, ts: 1.15, phase: 0 },
  { amp: 0.82, fx: -1.3, fy: 2.6, ts: -0.87, phase: Math.PI / 2 },
  { amp: 0.65, fx: 1.7, fy: -2.0, ts: 1.41, phase: Math.PI },
  { amp: 0.7, fx: -2.8, fy: -1.2, ts: -0.66, phase: 0.8 },
  { amp: 0.5, fx: 0.9, fy: 3.1, ts: 1.05, phase: 2.3 },
  { amp: 0.38, fx: 3.2, fy: 0.7, ts: -1.23, phase: 4.7 },
  { amp: 0.3, fx: -1.0, fy: -2.4, ts: 1.56, phase: 5.5 },
  { amp: 0.28, fx: 2.1, fy: 1.7, ts: 0.54, phase: 1.1 },
];

// High-frequency turbulence: each folds h back into its own phase (hFold), for self-similar distortion.
const TURB_WAVES = [
  { amp: 0.35, fx: 5.6, fy: 4.4, ts: 1.1, hFold: 0.8 },
  { amp: 0.18, fx: 8.3, fy: -7.0, ts: -0.9, hFold: 1.3 },
  { amp: 0.1, fx: 12.0, fy: 9.5, ts: 1.6, hFold: 1.8 },
];

// ── GLSL code generation ──────────────────────────────────

// GLSL won't coerce integer literals to float in const declarations: every number gets a decimal.
const glslFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const f4 = (n: number) => n.toFixed(4);
const vec3Of = (c: number[]) => `vec3(${c.map((v) => v.toFixed(3)).join(", ")})`;
const baseWaveGLSL = (w: (typeof BASE_WAVES)[number]) => `        h += ${f4(w.amp)} * sin(${f4(w.fx)}*p.x + ${f4(w.fy)}*p.y + t*${f4(w.ts)}${w.phase !== 0 ? ` + ${f4(w.phase)}` : ""});`;
const turbWaveGLSL = (w: (typeof TURB_WAVES)[number]) => `          h += uTurb * ${f4(w.amp)} * sin(${f4(w.fx)}*p.x + ${f4(w.fy)}*p.y + t*${f4(w.ts)} + h*${f4(w.hFold)});`;

const VERTEX_SHADER = `attribute vec2 position; void main(){ gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAGMENT_SHADER = /* glsl */ `
      precision highp float;

      uniform float     uTime;
      uniform vec2      uRes;
      uniform vec2      uMouse;
      uniform float     uDensity;
      uniform float     uSpeed;
      uniform float     uTurb;
      uniform sampler2D uMask;
      uniform vec4      uR0, uR1, uR2, uR3;

      // ── palette ────────────────────────────────────────
      const vec3 COLOR_BG        = ${vec3Of(PALETTE.BG)};
      const vec3 COLOR_FILL_FROM = ${vec3Of(PALETTE.FILL_FROM)};
      const vec3 COLOR_FILL_TO   = ${vec3Of(PALETTE.FILL_TO)};

      // ── mask clip ──────────────────────────────────────
      const float MASK_EDGE_LO = ${glslFloat(MASK_BLEND.EDGE_LO)};
      const float MASK_EDGE_HI = ${glslFloat(MASK_BLEND.EDGE_HI)};

      // ── ripple physics ─────────────────────────────────
      const float RIPPLE_DECAY_RATE   = ${glslFloat(RIPPLE.DECAY_RATE)};
      const float RIPPLE_RING_FREQ    = ${glslFloat(RIPPLE.RING_FREQUENCY)};
      const float RIPPLE_RING_SPEED   = ${glslFloat(RIPPLE.RING_SPEED_MUL)};
      const float RIPPLE_DIST_FALLOFF = ${glslFloat(RIPPLE.DIST_FALLOFF)};
      const float RIPPLE_AMPLITUDE    = ${glslFloat(RIPPLE.AMPLITUDE)};

      // ── mouse swell ────────────────────────────────────
      const float SWELL_DIST_FALLOFF = ${glslFloat(MOUSE_SWELL.DIST_FALLOFF)};
      const float SWELL_FREQUENCY    = ${glslFloat(MOUSE_SWELL.FREQUENCY)};
      const float SWELL_SPEED_MUL    = ${glslFloat(MOUSE_SWELL.SPEED_MUL)};
      const float SWELL_AMPLITUDE    = ${glslFloat(MOUSE_SWELL.AMPLITUDE)};

      // ── contour lines ──────────────────────────────────
      const float CONTOUR_LINE_WIDTH = ${glslFloat(CONTOUR.LINE_WIDTH)};
      const float CONTOUR_AA_BASE    = ${glslFloat(CONTOUR.AA_BASE)};
      const float CONTOUR_AA_DENSITY = ${glslFloat(CONTOUR.AA_DENSITY_SCALE)};
      const float CONTOUR_WAVE_SCALE = ${glslFloat(CONTOUR.WAVE_SCALE)};

      // Triangle wave: maps any float to [0,1], used for contour bands
      float tri(float x) {
        return abs(fract(x + 0.5) - 0.5) * 2.0;
      }

      // The height contribution of one click-ripple; r.z < 0 means the slot is empty.
      float ripple(vec4 r, vec2 uv, float t) {
        if (r.z < 0.0) return 0.0;
        float age       = t - r.z;
        float decay     = exp(-age * RIPPLE_DECAY_RATE);
        float ar        = uRes.x / uRes.y;
        vec2  delta     = (uv - r.xy) * vec2(ar, 1.0);
        float dist      = length(delta);
        float ringPhase = dist * RIPPLE_RING_FREQ - age * uSpeed * RIPPLE_RING_SPEED;
        return decay * sin(ringPhase) * exp(-dist * RIPPLE_DIST_FALLOFF) * RIPPLE_AMPLITUDE;
      }

      void main() {
        vec2  uv = gl_FragCoord.xy / uRes;
        float ar = uRes.x / uRes.y;
        vec2  p  = vec2(uv.x * ar, uv.y);   // aspect-corrected position
        float t  = uTime * uSpeed;

        // ── logo clip mask ───────────────────────────────
        float insideMask = texture2D(uMask, uv).r;
        float mask       = smoothstep(MASK_EDGE_LO, MASK_EDGE_HI, insideMask);

        // Pixels fully outside the logo are solid background.
        if (mask < 0.001) {
          gl_FragColor = vec4(COLOR_BG, 1.0);
          return;
        }

        // ── wave field (8 base sinusoids + turbulence) ───
        float h = 0.0;
${BASE_WAVES.map(baseWaveGLSL).join("\n")}

        // High-frequency turbulence (self-referential: current h folds back into phase)
        if (uTurb > 0.0) {
${TURB_WAVES.map(turbWaveGLSL).join("\n")}
        }

        // ── mouse proximity swell ────────────────────────
        vec2  swellDelta = (uv - uMouse) * vec2(ar, 1.0);
        float swellDist  = length(swellDelta);
        h += SWELL_AMPLITUDE
           * exp(-swellDist * SWELL_DIST_FALLOFF)
           * sin(swellDist * SWELL_FREQUENCY - t * SWELL_SPEED_MUL);

        // ── click ripples ────────────────────────────────
        h += ripple(uR0, uv, uTime);
        h += ripple(uR1, uv, uTime);
        h += ripple(uR2, uv, uTime);
        h += ripple(uR3, uv, uTime);

        // ── contour rendering ────────────────────────────
        float bands      = tri(h * uDensity * CONTOUR_WAVE_SCALE);
        float aaRadius   = CONTOUR_AA_BASE + CONTOUR_AA_DENSITY * uDensity;
        float isOnLine   = 1.0 - smoothstep(CONTOUR_LINE_WIDTH - aaRadius, CONTOUR_LINE_WIDTH + aaRadius, bands);
        vec3  fill       = mix(COLOR_FILL_FROM, COLOR_FILL_TO, uv.x);
        vec3  fluidColor = mix(fill, COLOR_BG, isOnLine);

        // Water inside the logo, background outside
        gl_FragColor = vec4(mix(COLOR_BG, fluidColor, mask), 1.0);
      }
    `;

/**
 * The logo's silhouette, white on black, as large as fits a W × H box: what the water is clipped to. Its true ink
 * bounds are found first, so it fills the width (all but a hair), never taller than MASK.MAX_HEIGHT_FRACTION of the box.
 */
function drawMask(mask: HTMLCanvasElement, logo: HTMLImageElement, W: number, H: number) {
  const probe = document.createElement("canvas");
  probe.width = logo.naturalWidth;
  probe.height = logo.naturalHeight;
  const pc = probe.getContext("2d")!;
  pc.drawImage(logo, 0, 0);
  const alpha = pc.getImageData(0, 0, probe.width, probe.height).data;
  let minX = probe.width;
  let maxX = 0;
  let minY = probe.height;
  let maxY = 0;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (alpha[(y * probe.width + x) * 4 + 3] > MASK.INK_ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const inkW = Math.max(1, maxX - minX + 1);
  const inkH = Math.max(1, maxY - minY + 1);
  const scale = Math.min((W * MASK.MAX_WIDTH_FRACTION) / inkW, (H * MASK.MAX_HEIGHT_FRACTION) / inkH);

  // The logo drawn at that size, centred, then every part of it made white.
  const shape = document.createElement("canvas");
  shape.width = W;
  shape.height = H;
  const sc = shape.getContext("2d")!;
  sc.imageSmoothingQuality = "high";
  sc.drawImage(logo, minX, minY, inkW, inkH, (W - inkW * scale) / 2, (H - inkH * scale) / 2, inkW * scale, inkH * scale);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#fff";
  sc.fillRect(0, 0, W, H);

  mask.width = W;
  mask.height = H;
  const mc = mask.getContext("2d")!;
  mc.fillStyle = "#000";
  mc.fillRect(0, 0, W, H);
  mc.drawImage(shape, 0, 0);
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "The footer's shader didn't compile.");
  return shader;
}

export function FooterLogo() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const area = box.current;
    const view = canvas.current;
    const ring = cursor.current;
    if (!area || !view || !ring) return;
    const gl = view.getContext("webgl", { antialias: true });
    if (!gl) {
      setStill(true);
      return;
    }

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "The footer's shader didn't link.");
    } catch {
      setStill(true);
      return;
    }
    gl.useProgram(program);

    // One rectangle covering the canvas, as two triangles.
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uTime = u("uTime");
    const uRes = u("uRes");
    const uMouse = u("uMouse");
    const ripples = [u("uR0"), u("uR1"), u("uR2"), u("uR3")];
    gl.uniform1f(u("uDensity"), SETTINGS.DENSITY);
    gl.uniform1f(u("uSpeed"), SETTINGS.SPEED);
    gl.uniform1f(u("uTurb"), SETTINGS.TURB);
    gl.uniform2f(uMouse, 0.5, 0.5);
    ripples.forEach((r) => gl.uniform4f(r, 0, 0, -1, 0));

    // The mask texture: the canvas is uploaded flipped, so its bottom row is v = 0, as gl_FragCoord counts.
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(u("uMask"), 0);

    const mask = document.createElement("canvas");
    const logo = new window.Image();
    let ready = false;

    // ── size: the canvas fills its box; the mask is redrawn to match ──
    const resize = () => {
      const W = Math.max(1, area.clientWidth);
      const H = Math.max(1, area.clientHeight);
      const ratio = Math.min(devicePixelRatio, RENDERER.MAX_PIXEL_RATIO);
      view.width = Math.round(W * ratio);
      view.height = Math.round(H * ratio);
      gl.viewport(0, 0, view.width, view.height);
      gl.uniform2f(uRes, view.width, view.height);
      if (!logo.complete || !logo.naturalWidth) return;
      drawMask(mask, logo, W, H);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
      ready = true;
    };
    logo.onload = resize;
    logo.onerror = () => setStill(true);
    logo.src = LOGO;
    const sized = new ResizeObserver(resize);
    sized.observe(area);

    // ── the cursor: its ring follows the pointer and swells the water; a press grows it; a click sends ripples ──
    let elapsed = 0;
    let rippleIndex = 0;
    const at = (e: PointerEvent | MouseEvent) => {
      const rect = area.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
    };
    const onMove = (e: PointerEvent) => {
      const p = at(e);
      ring.style.left = `${p.x}px`;
      ring.style.top = `${p.y}px`;
      ring.style.opacity = "1";
      gl.uniform2f(uMouse, p.x / p.w, 1 - p.y / p.h);
    };
    const onLeave = () => {
      ring.style.opacity = "0";
    };
    const onDown = () => ring.classList.add("big");
    const onUp = () => ring.classList.remove("big");
    const onClick = (e: MouseEvent) => {
      const p = at(e);
      gl.uniform4f(ripples[rippleIndex % RIPPLE.SLOT_COUNT], p.x / p.w, 1 - p.y / p.h, elapsed, 1);
      rippleIndex++;
    };
    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerleave", onLeave);
    area.addEventListener("pointerdown", onDown);
    area.addEventListener("pointerup", onUp);
    area.addEventListener("click", onClick);

    // ── render loop, only while the logo is on screen ──
    let frame = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      if (!ready) return;
      gl.uniform1f(uTime, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const onScreen = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      last = null;
      if (entry.isIntersecting) frame = requestAnimationFrame(loop);
    });
    onScreen.observe(area);

    return () => {
      cancelAnimationFrame(frame);
      onScreen.disconnect();
      sized.disconnect();
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
      area.removeEventListener("pointerdown", onDown);
      area.removeEventListener("pointerup", onUp);
      area.removeEventListener("click", onClick);
      logo.onload = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div ref={box} role="img" aria-label="Keel" className="footer-logo aspect-[5/2] w-full">
      {still ? (
        <Image src={LOGO} alt="" width={414} height={216} className="h-full w-full object-contain" />
      ) : (
        <>
          <canvas ref={canvas} />
          <span ref={cursor} className="footer-logo-cursor" style={{ opacity: 0 }} />
        </>
      )}
    </div>
  );
}
