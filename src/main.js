import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ACTUATOR, LEG_REEFS, actuatorVelocity, actuatorZ, isReefFootprint, rearReefHeight } from './model.js';
import { WaveField } from './wave-field.js';
import './styles.css';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071b26);
scene.fog = new THREE.FogExp2(0x0a2b36, 0.25);

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.02, 20);
camera.position.set(2.15, 1.55, 2.35);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 0.55;
controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI * 0.88;
controls.target.set(0, -0.12, 0);

scene.add(new THREE.HemisphereLight(0xc9f3ed, 0x102b2b, 1.65));
const sun = new THREE.DirectionalLight(0xffe1b5, 3.2);
sun.position.set(-2.2, 3.5, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -2;
sun.shadow.camera.right = sun.shadow.camera.top = 2;
scene.add(sun);
const fill = new THREE.PointLight(0x55cbd1, 7, 3.5, 2);
fill.position.set(0.2, -0.45, 0.25);
scene.add(fill);

function rockMaterial(color, roughness = 0.92) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03, flatShading: true });
}

const darkRock = rockMaterial(0x405047);
const sunRock = rockMaterial(0x7a6853);
const algaeRock = rockMaterial(0x526b55);

function roughen(geometry, amount = 0.018) {
  const positions = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = Math.sin(x * 31 + y * 19) * Math.sin(z * 37 - x * 11) * amount;
    positions.setXYZ(i, x + normal.getX(i) * noise, y + normal.getY(i) * noise, z + normal.getZ(i) * noise);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function addLegReefs() {
  LEG_REEFS.forEach((definition, reefIndex) => {
    const curve = new THREE.CatmullRomCurve3(
      definition.points.map(([x, y, z]) => new THREE.Vector3(x, z, y)),
      false,
      'centripetal',
    );
    const geometry = roughen(new THREE.TubeGeometry(curve, 56, 0.105, 9, false), 0.014);
    const mesh = new THREE.Mesh(geometry, reefIndex ? darkRock : sunRock);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = definition.name;
    scene.add(mesh);

    const knee = definition.points[2];
    for (let i = 0; i < 4; i += 1) {
      const side = reefIndex ? 1 : -1;
      const boulderGeometry = roughen(new THREE.IcosahedronGeometry(0.10 - i * 0.009, 2), 0.026);
      const boulder = new THREE.Mesh(boulderGeometry, i % 2 ? algaeRock : sunRock);
      boulder.position.set(knee[0] + side * (i - 1.5) * 0.038, knee[2] - 0.015 + i * 0.012, knee[1] + Math.sin(i * 2.1) * 0.045);
      boulder.scale.set(1.1, 0.8 + i * 0.05, 0.92);
      boulder.rotation.set(i * 0.7, i * 1.1, i * 0.33);
      boulder.castShadow = true;
      scene.add(boulder);
    }
  });
}

function createRearReef() {
  const cols = 49;
  const rows = 29;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let j = 0; j < rows; j += 1) {
    const y = -1 + (j / (rows - 1)) * 0.5;
    for (let i = 0; i < cols; i += 1) {
      const x = -0.66 + (i / (cols - 1)) * 1.32;
      const base = rearReefHeight(x, y);
      const edge = Math.max(0, 1 - Math.abs(x) / 0.66);
      const texture = 0.018 * Math.sin(i * 2.31 + j * 1.17) * Math.sin(j * 0.83 - i * 0.37) * edge;
      const z = base + texture;
      positions.push(x, z, y);
      const emerged = THREE.MathUtils.smoothstep(z, -0.2, 0.35);
      colors.push(0.25 + emerged * 0.22, 0.34 + emerged * 0.12, 0.28 + emerged * 0.04);
    }
  }
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, flatShading: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = '渐高外凸岸脊';
  scene.add(mesh);

  for (let i = 0; i < 22; i += 1) {
    const y = -0.53 - (i / 21) * 0.46;
    const sign = i % 2 ? 1 : -1;
    const x = sign * (0.57 + 0.045 * Math.sin(i * 4.7));
    const z = Math.max(-0.92, rearReefHeight(x * 0.93, y) - 0.13);
    const stone = new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(0.075 + (i % 4) * 0.009, 1), 0.014), i % 3 ? darkRock : algaeRock);
    stone.position.set(x, z, y);
    stone.scale.set(0.75, 1.15, 0.9);
    stone.rotation.set(i, i * 0.47, i * 0.23);
    stone.castShadow = true;
    scene.add(stone);
  }
}

function createBasin() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2, 30, 30),
    new THREE.MeshStandardMaterial({ color: 0x172d2c, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);

  const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)), 0x4b7777);
  box.material.transparent = true;
  box.material.opacity = 0.12;
  scene.add(box);
}

function createActuator() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd89c3b, roughness: 0.27, metalness: 0.86, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffca62, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(ACTUATOR.outerRadius, ACTUATOR.outerRadius, ACTUATOR.height, 48, 1, true), metal);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(ACTUATOR.innerRadius, ACTUATOR.innerRadius, ACTUATOR.height, 48, 1, true), metal);
  const top = new THREE.Mesh(new THREE.RingGeometry(ACTUATOR.innerRadius, ACTUATOR.outerRadius, 48), metal);
  const bottom = top.clone();
  top.rotation.x = -Math.PI / 2;
  top.position.y = ACTUATOR.height / 2;
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -ACTUATOR.height / 2;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.105, 0.112, 64), glow);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = ACTUATOR.height / 2 + 0.002;
  group.add(outer, inner, top, bottom, halo);
  group.position.y = ACTUATOR.restZ;
  group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  scene.add(group);
  return group;
}

const waveField = new WaveField(81);

function createWater() {
  const n = waveField.size;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      positions.push(-1 + i * waveField.spacing, 0, -1 + j * waveField.spacing);
      colors.push(0.08, 0.48, 0.55);
    }
  }
  for (let j = 0; j < n - 1; j += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = j * n + i;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.73,
    transmission: 0.18,
    roughness: 0.18,
    metalness: 0.03,
    clearcoat: 0.72,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 3;
  scene.add(mesh);
  return mesh;
}

function createParticles() {
  const count = 520;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() * 2 - 1) * 0.98;
    positions[i * 3 + 1] = -0.92 + Math.random() * 0.88;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * 0.98;
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x9be0dd, size: 0.008, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.userData.seeds = seeds;
  scene.add(points);
  return points;
}

function createSplashSystem() {
  const count = 220;
  const geometry = new THREE.IcosahedronGeometry(0.008, 1);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xb9f4ef,
    emissive: 0x183b45,
    roughness: 0.08,
    transmission: 0.32,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const droplets = Array.from({ length: count }, () => ({
    active: false,
    position: new THREE.Vector3(0, -2, 0),
    velocity: new THREE.Vector3(),
    life: 0,
    scale: 0,
  }));
  const dummy = new THREE.Object3D();
  scene.add(mesh);
  return { mesh, droplets, dummy, cursor: 0 };
}

function createImpactRings() {
  const rings = [];
  for (let i = 0; i < 7; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xd6fff8 : 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.092, 0.108, 64), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.008;
    ring.visible = false;
    ring.renderOrder = 6;
    ring.userData = { age: 99, speed: 0.7 + i * 0.04 };
    rings.push(ring);
    scene.add(ring);
  }
  return rings;
}

function addCoordinateLabels() {
  const axes = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x89aaa8, transparent: true, opacity: 0.28 });
  const values = [-1, -0.5, 0, 0.5, 1];
  for (const value of values) {
    const xLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0.003, value), new THREE.Vector3(1, 0.003, value)]);
    const yLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(value, 0.003, -1), new THREE.Vector3(value, 0.003, 1)]);
    axes.add(new THREE.Line(xLine, material), new THREE.Line(yLine, material));
  }
  axes.renderOrder = 4;
  scene.add(axes);
}

createBasin();
addLegReefs();
createRearReef();
const actuator = createActuator();
const water = createWater();
const particles = createParticles();
const splash = createSplashSystem();
const impactRings = createImpactRings();
addCoordinateLabels();

const state = { time: 0, paused: false, amplitude: ACTUATOR.defaultAmplitude, frequency: ACTUATOR.defaultFrequency, speed: 1 };
const amplitudeInput = document.querySelector('#amplitude');
const frequencyInput = document.querySelector('#frequency');
const speedInput = document.querySelector('#speed');
const pauseButton = document.querySelector('#pause');
const depthReadout = document.querySelector('#depthReadout');
const waveReadout = document.querySelector('#waveReadout');
const heatmapCanvas = document.querySelector('#heatmap');
const heatmapContext = heatmapCanvas.getContext('2d');
const heatmapScratch = document.createElement('canvas');
heatmapScratch.width = waveField.size;
heatmapScratch.height = waveField.size;

function bindRange(input, key, output, format) {
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    output.value = format(state[key]);
  });
}
bindRange(amplitudeInput, 'amplitude', document.querySelector('#amplitudeValue'), (v) => v.toFixed(3));
bindRange(frequencyInput, 'frequency', document.querySelector('#frequencyValue'), (v) => `${v.toFixed(2)} Hz`);
bindRange(speedInput, 'speed', document.querySelector('#speedValue'), (v) => `${v.toFixed(1)}×`);

pauseButton.addEventListener('click', () => {
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? '▶' : 'Ⅱ';
  pauseButton.setAttribute('aria-label', state.paused ? '继续模拟' : '暂停模拟');
});
document.querySelector('#reset').addEventListener('click', () => waveField.reset());

const views = {
  overview: { position: new THREE.Vector3(2.15, 1.55, 2.35), target: new THREE.Vector3(0, -0.12, 0) },
  surface: { position: new THREE.Vector3(1.9, 0.18, 1.4), target: new THREE.Vector3(0, 0.02, -0.05) },
  source: { position: new THREE.Vector3(0.62, -0.02, 0.72), target: new THREE.Vector3(0, -0.22, 0) },
};
let cameraTween = null;
document.querySelectorAll('.view-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.view-button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    cameraTween = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), ...views[button.dataset.view] };
  });
});

function updateWater() {
  const positions = water.geometry.attributes.position;
  const colors = water.geometry.attributes.color;
  for (let i = 0; i < waveField.height.length; i += 1) {
    const h = waveField.height[i];
    positions.setY(i, h);
    const crest = THREE.MathUtils.clamp(h * 7 + 0.35, 0, 1);
    colors.setXYZ(i, 0.045 + crest * 0.18, 0.33 + crest * 0.31, 0.42 + crest * 0.28);
  }
  positions.needsUpdate = true;
  colors.needsUpdate = true;
  water.geometry.computeVertexNormals();
}

function updateParticles(dt) {
  const positions = particles.geometry.attributes.position;
  const seeds = particles.userData.seeds;
  for (let i = 0; i < positions.count; i += 1) {
    let x = positions.getX(i);
    let y = positions.getY(i);
    let z = positions.getZ(i);
    const radial = Math.hypot(x, z) + 0.001;
    const sourceFlow = Math.exp(-radial * 3.3) * Math.sin(state.time * Math.PI * 2 * state.frequency);
    x += (x / radial * sourceFlow * 0.026 + Math.sin(state.time * 0.7 + seeds[i]) * 0.005) * dt;
    z += (z / radial * sourceFlow * 0.026 + Math.cos(state.time * 0.6 + seeds[i]) * 0.004) * dt;
    y += (0.007 + 0.005 * Math.sin(seeds[i])) * dt;
    if (y > -0.015 || Math.abs(x) > 1 || Math.abs(z) > 1) {
      x = (Math.random() * 2 - 1) * 0.95;
      y = -0.92;
      z = (Math.random() * 2 - 1) * 0.95;
    }
    positions.setXYZ(i, x, y, z);
  }
  positions.needsUpdate = true;
}

function emitSplash(intensity) {
  const amount = Math.min(22, Math.max(4, Math.round(intensity * 38)));
  for (let i = 0; i < amount; i += 1) {
    const drop = splash.droplets[splash.cursor];
    splash.cursor = (splash.cursor + 1) % splash.droplets.length;
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.045 + Math.random() * 0.085;
    drop.active = true;
    drop.life = 0.55 + Math.random() * 0.55;
    drop.scale = 0.45 + Math.random() * 1.05;
    drop.position.set(Math.cos(angle) * radius, 0.005 + Math.random() * 0.025, Math.sin(angle) * radius);
    const radialSpeed = 0.12 + Math.random() * 0.34 * intensity;
    drop.velocity.set(
      Math.cos(angle) * radialSpeed,
      0.32 + Math.random() * 0.55 * intensity,
      Math.sin(angle) * radialSpeed,
    );
  }
}

function triggerImpactRing() {
  const ring = impactRings.reduce((oldest, item) => item.userData.age > oldest.userData.age ? item : oldest);
  ring.visible = true;
  ring.userData.age = 0;
  ring.scale.setScalar(1);
  ring.material.opacity = 0.9;
}

function updateSplash(dt) {
  for (let index = 0; index < splash.droplets.length; index += 1) {
    const drop = splash.droplets[index];
    if (drop.active) {
      drop.life -= dt;
      drop.velocity.y -= 1.65 * dt;
      drop.velocity.multiplyScalar(Math.pow(0.985, dt * 60));
      drop.position.addScaledVector(drop.velocity, dt);
      if (drop.position.y < -0.01 || drop.life <= 0) drop.active = false;
    }
    if (drop.active) splash.dummy.position.copy(drop.position);
    else splash.dummy.position.set(0, -2, 0);
    const stretch = drop.active ? drop.scale * (1 + Math.abs(drop.velocity.y) * 0.8) : 0;
    splash.dummy.scale.set(drop.scale, stretch, drop.scale);
    splash.dummy.updateMatrix();
    splash.mesh.setMatrixAt(index, splash.dummy.matrix);
  }
  splash.mesh.instanceMatrix.needsUpdate = true;

  for (const ring of impactRings) {
    if (!ring.visible) continue;
    ring.userData.age += dt;
    const age = ring.userData.age;
    const size = 1 + age * ring.userData.speed * 5.5;
    ring.scale.setScalar(size);
    ring.position.y = 0.009 + Math.sin(age * 18) * 0.002;
    ring.material.opacity = Math.max(0, 0.78 * (1 - age / 1.15));
    if (age > 1.15) ring.visible = false;
  }
}

function heatColor(value) {
  const stops = [
    [0.00, 12, 35, 54],
    [0.25, 18, 94, 116],
    [0.50, 47, 164, 164],
    [0.75, 167, 207, 139],
    [1.00, 255, 195, 92],
  ];
  const v = THREE.MathUtils.clamp(value, 0, 1);
  const scaled = v * (stops.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(stops.length - 1, low + 1);
  const t = scaled - low;
  return [
    Math.round(THREE.MathUtils.lerp(stops[low][1], stops[high][1], t)),
    Math.round(THREE.MathUtils.lerp(stops[low][2], stops[high][2], t)),
    Math.round(THREE.MathUtils.lerp(stops[low][3], stops[high][3], t)),
  ];
}

function updateHeatmap() {
  const ctx = heatmapContext;
  const width = heatmapCanvas.width;
  const height = heatmapCanvas.height;
  const margin = { left: 38, top: 16, right: 72, bottom: 34 };
  const mapSize = Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom);
  const mapX = margin.left;
  const mapY = margin.top;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#061820';
  ctx.fillRect(0, 0, width, height);

  const n = waveField.size;
  const image = ctx.createImageData(n, n);
  for (let py = 0; py < n; py += 1) {
    for (let px = 0; px < n; px += 1) {
      const x = -1 + px * waveField.spacing;
      const y = 1 - py * waveField.spacing;
      const index = (n - 1 - py) * n + px;
      const output = (py * n + px) * 4;
      const actuatorMask = Math.hypot(x, y) <= ACTUATOR.outerRadius * 1.12;
      if (isReefFootprint(x, y) || actuatorMask) {
        image.data[output] = 5;
        image.data[output + 1] = 20;
        image.data[output + 2] = 25;
        image.data[output + 3] = 255;
      } else {
        const depth = 1 + waveField.height[index];
        const [r, g, b] = heatColor((depth - 0.82) / 0.36);
        image.data[output] = r;
        image.data[output + 1] = g;
        image.data[output + 2] = b;
        image.data[output + 3] = 255;
      }
    }
  }
  heatmapScratch.getContext('2d').putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(heatmapScratch, mapX, mapY, mapSize, mapSize);

  ctx.strokeStyle = 'rgba(174, 221, 216, .28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX + 0.5, mapY + 0.5, mapSize - 1, mapSize - 1);
  ctx.font = '18px DM Mono, monospace';
  ctx.fillStyle = '#789795';
  ctx.textAlign = 'center';
  ctx.fillText('−1', mapX, mapY + mapSize + 24);
  ctx.fillText('x', mapX + mapSize / 2, mapY + mapSize + 24);
  ctx.fillText('+1', mapX + mapSize, mapY + mapSize + 24);
  ctx.textAlign = 'right';
  ctx.fillText('+1', mapX - 8, mapY + 7);
  ctx.fillText('y', mapX - 8, mapY + mapSize / 2 + 6);
  ctx.fillText('−1', mapX - 8, mapY + mapSize);

  const barX = mapX + mapSize + 24;
  const gradient = ctx.createLinearGradient(0, mapY + mapSize, 0, mapY);
  for (let i = 0; i <= 4; i += 1) {
    const [r, g, b] = heatColor(i / 4);
    gradient.addColorStop(i / 4, `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(barX, mapY, 15, mapSize);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9bb5b3';
  ctx.fillText('1.18', barX + 22, mapY + 7);
  ctx.fillText('1.00', barX + 22, mapY + mapSize / 2 + 6);
  ctx.fillText('0.82', barX + 22, mapY + mapSize);
}

let lastTime = performance.now();
let normalFrame = 0;
let previousPhase = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const realDt = Math.min(0.035, (now - lastTime) / 1000);
  lastTime = now;

  if (!state.paused) {
    const dt = realDt * state.speed;
    state.time += dt;
    const phase = Math.sin(2 * Math.PI * state.frequency * state.time);
    const drive = actuatorVelocity(state.time, state.amplitude, state.frequency);
    const substeps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < substeps; i += 1) {
      waveField.step(dt / substeps, drive);
    }
    if (previousPhase < 0 && phase >= 0 && drive > 0) {
      const intensity = THREE.MathUtils.clamp(state.amplitude / 0.085, 0.35, 1.8);
      emitSplash(intensity);
      triggerImpactRing();
      fill.intensity = 14;
    }
    if (drive > 0.28 && Math.random() < dt * 18) emitSplash(THREE.MathUtils.clamp(drive * 2.2, 0.3, 1.4));
    previousPhase = phase;
    actuator.position.y = actuatorZ(state.time, state.amplitude, state.frequency);
    updateParticles(dt);
    updateSplash(dt);
    updateWater();
    fill.intensity += (7 - fill.intensity) * Math.min(1, dt * 8);
    depthReadout.textContent = `−${Math.abs(actuator.position.y).toFixed(2)} m`;
    if (normalFrame++ % 8 === 0) {
      waveReadout.textContent = `${waveField.peak().toFixed(3)} m`;
      updateHeatmap();
    }
  }

  if (cameraTween) {
    const t = Math.min(1, (now - cameraTween.start) / 900);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.position, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.target, eased);
    if (t === 1) cameraTween = null;
  }

  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
updateHeatmap();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
