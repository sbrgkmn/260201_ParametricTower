import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GUI } from "lil-gui";
import "./style.css";

const app = document.querySelector("#app");

const params = {
  gridX: 28,
  gridY: 28,
  gridZ: 48,
  voxelSize: 1,
  seedDensity: 0.35,
  birthMin: 5,
  birthMax: 7,
  surviveMin: 4,
  surviveMax: 8,
  stepRate: 6,
  randomSeed: 1,
  gradientMode: "neighbors",
  play: true,
  reset: () => resetSimulation(true),
  stepOnce: () => {
    stepSimulation();
    renderVoxels();
  }
};

let grid = null;
let ages = null;
let next = null;
let neighbors = null;
let gridSize = 0;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let instanced = null;
let clock = null;
let stepAccumulator = 0;

const color = new THREE.Color();
const quaternionIdentity = new THREE.Quaternion();
const scaleIdentity = new THREE.Vector3(1, 1, 1);

init();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1014);
  scene.fog = new THREE.Fog(0x0e1014, 40, 140);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(40, 34, 60);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const hemi = new THREE.HemisphereLight(0xa7b7ff, 0x222735, 0.85);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(40, 60, 30);
  scene.add(dir);

  buildInstancedMesh();
  resetSimulation(true);
  renderVoxels();

  buildGUI();

  clock = new THREE.Clock();
  window.addEventListener("resize", onResize);
  animate();
}

function buildInstancedMesh() {
  if (instanced) {
    scene.remove(instanced);
    instanced.geometry.dispose();
    instanced.material.dispose();
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.1,
    transparent: true,
    opacity: 0.95
  });

  const maxCount = params.gridX * params.gridY * params.gridZ;
  instanced = new THREE.InstancedMesh(geometry, material, maxCount);
  instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instanced.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
  scene.add(instanced);
}

function resetSimulation(rebuildMesh = false) {
  const { gridX, gridY, gridZ } = params;
  gridSize = gridX * gridY * gridZ;
  grid = new Uint8Array(gridSize);
  ages = new Uint8Array(gridSize);
  next = new Uint8Array(gridSize);
  neighbors = new Uint8Array(gridSize);

  seedGround();

  if (rebuildMesh) {
    buildInstancedMesh();
  }
}

function seedGround() {
  const rng = mulberry32(params.randomSeed);
  const { gridX, gridY } = params;
  for (let y = 0; y < gridY; y += 1) {
    for (let x = 0; x < gridX; x += 1) {
      const alive = rng() < params.seedDensity ? 1 : 0;
      const idx = indexFor(x, y, 0);
      grid[idx] = alive;
      ages[idx] = alive ? 1 : 0;
    }
  }
}

function stepSimulation() {
  const { gridX, gridY, gridZ, birthMin, birthMax, surviveMin, surviveMax } = params;
  neighbors.fill(0);

  for (let z = 0; z < gridZ; z += 1) {
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const idx = indexFor(x, y, z);
        const count = countNeighbors(x, y, z);
        neighbors[idx] = count;
        const alive = grid[idx] === 1;

        let nextAlive = 0;
        if (!alive && count >= birthMin && count <= birthMax) {
          nextAlive = 1;
        } else if (alive && count >= surviveMin && count <= surviveMax) {
          nextAlive = 1;
        }

        next[idx] = nextAlive;
        ages[idx] = nextAlive ? Math.min(ages[idx] + 1, 255) : 0;
      }
    }
  }

  const swap = grid;
  grid = next;
  next = swap;
}

function renderVoxels() {
  const { gridX, gridY, gridZ, voxelSize, gradientMode } = params;
  const halfX = (gridX * voxelSize) / 2;
  const halfY = (gridY * voxelSize) / 2;

  let count = 0;
  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();

  for (let z = 0; z < gridZ; z += 1) {
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const idx = indexFor(x, y, z);
        if (grid[idx] !== 1) {
          continue;
        }

        tempPosition.set(
          x * voxelSize - halfX + voxelSize * 0.5,
          y * voxelSize - halfY + voxelSize * 0.5,
          z * voxelSize + voxelSize * 0.5
        );
        tempMatrix.compose(tempPosition, quaternionIdentity, scaleIdentity);
        instanced.setMatrixAt(count, tempMatrix);

        const neighborCount = neighbors[idx];
        const age = ages[idx];
        setVoxelColor(color, neighborCount, age, gradientMode);
        instanced.setColorAt(count, color);
        count += 1;
      }
    }
  }

  instanced.count = count;
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) {
    instanced.instanceColor.needsUpdate = true;
  }
}

function setVoxelColor(out, neighborCount, age, mode) {
  if (mode === "age") {
    const t = Math.min(age / 30, 1);
    out.setHSL(0.58 - 0.4 * t, 0.7, 0.5 + 0.15 * t);
    return;
  }

  const t = Math.min(neighborCount / 12, 1);
  out.setHSL(0.9 - 0.65 * t, 0.7, 0.45 + 0.2 * t);
}

function countNeighbors(cx, cy, cz) {
  let count = 0;
  const { gridX, gridY, gridZ } = params;

  for (let dz = -1; dz <= 1; dz += 1) {
    const z = cz + dz;
    if (z < 0 || z >= gridZ) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      const y = cy + dy;
      if (y < 0 || y >= gridY) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx;
        if (x < 0 || x >= gridX) continue;
        if (dx === 0 && dy === 0 && dz === 0) continue;
        count += grid[indexFor(x, y, z)];
      }
    }
  }

  return count;
}

function indexFor(x, y, z) {
  return x + params.gridX * (y + params.gridY * z);
}

function buildGUI() {
  const gui = new GUI();
  gui.title("Parametric Tower");

  gui.add(params, "gridX", 8, 64, 1).name("Grid X").onFinishChange(rebuild);
  gui.add(params, "gridY", 8, 64, 1).name("Grid Y").onFinishChange(rebuild);
  gui.add(params, "gridZ", 8, 96, 1).name("Grid Z").onFinishChange(rebuild);
  gui.add(params, "voxelSize", 0.5, 3, 0.1).name("Voxel Size").onFinishChange(renderVoxels);
  gui.add(params, "seedDensity", 0.05, 0.9, 0.01).name("Seed Density").onFinishChange(resetSeed);
  gui.add(params, "randomSeed", 1, 9999, 1).name("Random Seed").onFinishChange(resetSeed);

  gui.add(params, "birthMin", 1, 12, 1).name("Birth Min");
  gui.add(params, "birthMax", 1, 12, 1).name("Birth Max");
  gui.add(params, "surviveMin", 1, 12, 1).name("Survive Min");
  gui.add(params, "surviveMax", 1, 12, 1).name("Survive Max");

  gui.add(params, "stepRate", 1, 30, 1).name("Steps/sec");
  gui.add(params, "gradientMode", ["neighbors", "age"]).name("Gradient");
  gui.add(params, "play").name("Play");
  gui.add(params, "stepOnce").name("Step Once");
  gui.add(params, "reset").name("Reset");
}

function rebuild() {
  resetSimulation(true);
  renderVoxels();
}

function resetSeed() {
  resetSimulation(false);
  renderVoxels();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  stepAccumulator += delta;

  if (params.play) {
    const stepInterval = 1 / params.stepRate;
    while (stepAccumulator >= stepInterval) {
      stepSimulation();
      stepAccumulator -= stepInterval;
    }
  }

  renderVoxels();
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
