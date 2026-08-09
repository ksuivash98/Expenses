/**
 * silk.js — фон «Silk» на Three.js (vanilla-порт React Bits Silk)
 */
import * as THREE from 'three';

function hexToNormalizedRGB(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return [0.15, 0.35, 0.28];
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ];
}

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

export const SILK_THEME = {
  dark: {
    speed: 4.2,
    scale: 1.15,
    color: '#1e4a3c',
    noiseIntensity: 1.35,
    rotation: 0.08
  },
  light: {
    speed: 3.6,
    scale: 1.05,
    color: '#8fb9a6',
    noiseIntensity: 1.15,
    rotation: 0.04
  }
};

/**
 * Создаёт Silk-фон в контейнере. { destroy, update, setTheme }
 */
export function createSilk(container, options = {}) {
  if (!container) return { destroy() {}, update() {}, setTheme() {} };

  const props = { ...SILK_THEME.dark, ...options };
  container.classList.add('silk-host');

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduceMotion) {
    return {
      destroy() { container.classList.remove('silk-host'); },
      update() {},
      setTheme() {}
    };
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power'
    });
  } catch (error) {
    console.warn('Silk: WebGL недоступен.', error);
    return {
      destroy() { container.classList.remove('silk-host'); },
      update() {},
      setTheme() {}
    };
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const uniforms = {
    uSpeed: { value: props.speed },
    uScale: { value: props.scale },
    uNoiseIntensity: { value: props.noiseIntensity },
    uColor: { value: new THREE.Color(...hexToNormalizedRGB(props.color)) },
    uRotation: { value: props.rotation },
    uTime: { value: 0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false
  });

  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let raf = 0;
  let disposed = false;
  let visible = true;
  let pageVisible = !document.hidden;
  let last = performance.now();

  const resize = () => {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  };

  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const loop = (now) => {
    if (disposed) return;
    if (!visible || !pageVisible) {
      raf = 0;
      return;
    }
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    uniforms.uTime.value += 0.1 * delta;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (disposed || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };

  const onVisibility = () => {
    pageVisible = !document.hidden;
    if (pageVisible && visible) startLoop();
    else stopLoop();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible && pageVisible) startLoop();
      else stopLoop();
    },
    { threshold: 0 }
  );
  intersectionObserver.observe(container);

  document.addEventListener('visibilitychange', onVisibility);

  const applyProps = (next = {}) => {
    Object.assign(props, next);
    uniforms.uSpeed.value = props.speed;
    uniforms.uScale.value = props.scale;
    uniforms.uNoiseIntensity.value = props.noiseIntensity;
    uniforms.uRotation.value = props.rotation;
    uniforms.uColor.value.setRGB(...hexToNormalizedRGB(props.color));
  };

  resize();
  startLoop();

  return {
    update(next = {}) {
      applyProps(next);
    },
    setTheme(theme = 'dark') {
      applyProps(theme === 'light' ? SILK_THEME.light : SILK_THEME.dark);
    },
    destroy() {
      disposed = true;
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
      container.classList.remove('silk-host');
    }
  };
}

export default createSilk;
