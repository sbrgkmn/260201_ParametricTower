import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GUI } from "lil-gui";
import "./style.css";

const app = document.querySelector("#app");

const params = {
  gridX: 28,
  gridY: 48,
  gridZ: 28,
  towerCountX: 1,
  towerCountY: 1,
  towerSpacing: 40,
  voxelSize: 1,
  seedDensity: 0.35,
  birthMin: 5,
  birthMax: 7,
  surviveMin: 4,
  surviveMax: 8,
  stepRate: 6,
  randomSeed: 1,
  gradientMode: "neighbors",
  faceColor: "#ffffff",
  edgeColor: "#1f2630",
  gridColor: "#2a313d",
  play: true,
  reset: () => resetSimulation(true),
  stepOnce: () => {
    stepSimulation();
    renderVoxels();
  }
};

let towerGrids = [];
let towerAges = [];
let towerNeighbors = [];
let towerLayers = [];
let gridSize = 0;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let instancedSolid = null;
let instancedWire = null;
let clock = null;
let stepAccumulator = 0;

const color = new THREE.Color();
const faceColor = new THREE.Color();
const quaternionIdentity = new THREE.Quaternion();
const scaleIdentity = new THREE.Vector3(1, 1, 1);

let ambientLight = null;
let hemiLight = null;
let dirLight = null;
let gridHelper = null;

init();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1014);
  scene.fog = null;

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(40, 34, 60);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xa7b7ff, 0x222735, 0.35);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight.position.set(40, 60, 30);
  scene.add(dirLight);

  rebuildGridHelper();

  buildInstancedMesh();
  resetSimulation(true);
  renderVoxels();

  buildGUI();

  clock = new THREE.Clock();
  window.addEventListener("resize", onResize);
  animate();
}

function buildInstancedMesh() {
  if (instancedSolid) {
    scene.remove(instancedSolid);
    instancedSolid.geometry.dispose();
    instancedSolid.material.dispose();
  }
  if (instancedWire) {
    scene.remove(instancedWire);
    instancedWire.geometry.dispose();
    instancedWire.material.dispose();
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const solidMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.1,
    transparent: true,
    opacity: 0.95
  });
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: params.edgeColor,
    wireframe: true
  });

  const towerCount = params.towerCountX * params.towerCountY;
  const maxCount = params.gridX * params.gridY * params.gridZ * towerCount;
  instancedSolid = new THREE.InstancedMesh(geometry, solidMaterial, maxCount);
  instancedSolid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedSolid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
  scene.add(instancedSolid);

  instancedWire = new THREE.InstancedMesh(geometry, wireMaterial, maxCount);
  instancedWire.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(instancedWire);
}

function resetSimulation(rebuildMesh = false) {
  const { gridX, gridY, gridZ } = params;
  gridSize = gridX * gridY * gridZ;
  const towerCount = params.towerCountX * params.towerCountY;
  towerGrids = Array.from({ length: towerCount }, () => new Uint8Array(gridSize));
  towerAges = Array.from({ length: towerCount }, () => new Uint8Array(gridSize));
  towerNeighbors = Array.from({ length: towerCount }, () => new Uint8Array(gridSize));
  towerLayers = Array.from({ length: towerCount }, () => 0);

  for (let t = 0; t < towerCount; t += 1) {
    seedGroundForTower(t);
  }

  if (rebuildMesh) {
    buildInstancedMesh();
  }

  rebuildGridHelper();
  params.play = true;
}

function seedGroundForTower(towerIndex) {
  const rng = mulberry32(params.randomSeed + towerIndex * 9176);
  const { gridX, gridZ } = params;
  const grid = towerGrids[towerIndex];
  const ages = towerAges[towerIndex];
  const neighbors = towerNeighbors[towerIndex];
  for (let z = 0; z < gridZ; z += 1) {
    for (let x = 0; x < gridX; x += 1) {
      const alive = rng() < params.seedDensity ? 1 : 0;
      const idx = indexFor(x, 0, z);
      grid[idx] = alive;
      ages[idx] = alive ? 1 : 0;
    }
  }

  for (let z = 0; z < gridZ; z += 1) {
    for (let x = 0; x < gridX; x += 1) {
      const idx = indexFor(x, 0, z);
      neighbors[idx] = countNeighborsLayer(grid, x, 0, z);
    }
  }
}

function stepSimulation() {
  const { gridX, gridY, gridZ, birthMin, birthMax, surviveMin, surviveMax } = params;
  let active = 0;

  for (let t = 0; t < towerGrids.length; t += 1) {
    const grid = towerGrids[t];
    const ages = towerAges[t];
    const neighbors = towerNeighbors[t];
    const currentLayer = towerLayers[t];

    if (currentLayer >= gridY - 1) {
      continue;
    }

    active += 1;
    const nextLayer = currentLayer + 1;

    for (let z = 0; z < gridZ; z += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const prevIdx = indexFor(x, currentLayer, z);
        const count = countNeighborsLayer(grid, x, currentLayer, z);
        const alive = grid[prevIdx] === 1;

        let nextAlive = 0;
        if (!alive && count >= birthMin && count <= birthMax) {
          nextAlive = 1;
        } else if (alive && count >= surviveMin && count <= surviveMax) {
          nextAlive = 1;
        }

        const nextIdx = indexFor(x, nextLayer, z);
        grid[nextIdx] = nextAlive;
        neighbors[nextIdx] = count;
        ages[nextIdx] = nextAlive ? Math.min(ages[prevIdx] + 1, 255) : 0;
      }
    }

    towerLayers[t] = nextLayer;
  }

  if (active === 0) {
    params.play = false;
  }
}

function renderVoxels() {
  const { gridX, gridY, gridZ, voxelSize, gradientMode } = params;
  const halfX = (gridX * voxelSize) / 2;
  const halfY = (gridY * voxelSize) / 2;
  const halfZ = (gridZ * voxelSize) / 2;
  const towerCountX = Math.max(1, params.towerCountX);
  const towerCountY = Math.max(1, params.towerCountY);
  const spacing = params.towerSpacing;
  const totalWidth = (towerCountX - 1) * spacing;
  const totalDepth = (towerCountY - 1) * spacing;
  const towerOffsetX = -totalWidth / 2;
  const towerOffsetZ = -totalDepth / 2;

  let count = 0;
  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  faceColor.set(params.faceColor);

  for (let ty = 0; ty < towerCountY; ty += 1) {
    for (let tx = 0; tx < towerCountX; tx += 1) {
      const towerIndex = ty * towerCountX + tx;
      const grid = towerGrids[towerIndex];
      const ages = towerAges[towerIndex];
      const neighbors = towerNeighbors[towerIndex];
      const offsetX = towerOffsetX + tx * spacing;
      const offsetZ = towerOffsetZ + ty * spacing;

      for (let y = 0; y < gridY; y += 1) {
        for (let z = 0; z < gridZ; z += 1) {
          for (let x = 0; x < gridX; x += 1) {
            const idx = indexFor(x, y, z);
            if (grid[idx] !== 1) {
              continue;
            }

            const neighborCount = neighbors[idx];
            const age = ages[idx];
            setVoxelColor(color, neighborCount, age, gradientMode);
            color.multiply(faceColor);

            tempPosition.set(
              x * voxelSize - halfX + voxelSize * 0.5 + offsetX,
              y * voxelSize - halfY + voxelSize * 0.5,
              z * voxelSize - halfZ + voxelSize * 0.5 + offsetZ
            );
            tempMatrix.compose(tempPosition, quaternionIdentity, scaleIdentity);
            instancedSolid.setMatrixAt(count, tempMatrix);
            instancedWire.setMatrixAt(count, tempMatrix);
            instancedSolid.setColorAt(count, color);
            count += 1;
          }
        }
      }
    }
  }

  instancedSolid.count = count;
  instancedSolid.instanceMatrix.needsUpdate = true;
  if (instancedSolid.instanceColor) {
    instancedSolid.instanceColor.needsUpdate = true;
  }
  instancedWire.count = count;
  instancedWire.instanceMatrix.needsUpdate = true;
}

function setVoxelColor(out, neighborCount, age, mode) {
  if (mode === "solid") {
    out.set(0xffffff);
    return;
  }

  if (mode === "age") {
    const t = Math.min(age / 30, 1);
    out.setHSL(0.58 - 0.4 * t, 0.7, 0.5 + 0.15 * t);
    return;
  }

  const t = Math.min(neighborCount / 8, 1);
  out.setHSL(0.9 - 0.65 * t, 0.7, 0.45 + 0.2 * t);
}

function countNeighborsLayer(grid, cx, cy, cz) {
  let count = 0;
  const { gridX, gridZ } = params;

  for (let dz = -1; dz <= 1; dz += 1) {
    const z = cz + dz;
    if (z < 0 || z >= gridZ) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = cx + dx;
      if (x < 0 || x >= gridX) continue;
      if (dx === 0 && dz === 0) continue;
      count += grid[indexFor(x, cy, z)];
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
  gui.add(params, "gridY", 8, 96, 1).name("Grid Y").onFinishChange(rebuild);
  gui.add(params, "gridZ", 8, 64, 1).name("Grid Z").onFinishChange(rebuild);
  gui.add(params, "voxelSize", 0.5, 3, 0.1).name("Voxel Size").onFinishChange(() => {
    renderVoxels();
    rebuildGridHelper();
  });
  gui.add(params, "seedDensity", 0.05, 0.9, 0.01).name("Seed Density").onFinishChange(resetSeed);
  gui.add(params, "randomSeed", 1, 9999, 1).name("Random Seed").onFinishChange(resetSeed);

  gui.add(params, "birthMin", 1, 12, 1).name("Birth Min");
  gui.add(params, "birthMax", 1, 12, 1).name("Birth Max");
  gui.add(params, "surviveMin", 1, 12, 1).name("Survive Min");
  gui.add(params, "surviveMax", 1, 12, 1).name("Survive Max");

  gui.add(params, "stepRate", 1, 30, 1).name("Steps/sec");
  gui.add(params, "gradientMode", ["neighbors", "age", "solid"]).name("Gradient");
  gui.addColor(params, "faceColor").name("Face Color").onChange(renderVoxels);
  gui.addColor(params, "edgeColor").name("Edge Color").onChange(() => {
    if (instancedWire) {
      instancedWire.material.color.set(params.edgeColor);
    }
  });
  gui.add(params, "play").name("Play");
  gui.add(params, "stepOnce").name("Step Once");
  gui.add(params, "reset").name("Reset");

  const lighting = gui.addFolder("Lighting");
  lighting.add(ambientLight, "intensity", 0, 2, 0.01).name("Ambient");
  lighting.addColor(ambientLight, "color").name("Ambient Color");
  lighting.add(hemiLight, "intensity", 0, 2, 0.01).name("Hemi Intensity");
  lighting.addColor(hemiLight, "color").name("Sky Color");
  lighting.addColor(hemiLight, "groundColor").name("Ground Color");
  lighting.add(dirLight, "intensity", 0, 2, 0.01).name("Dir Intensity");
  lighting.addColor(dirLight, "color").name("Dir Color");

  const gridFolder = gui.addFolder("Grid");
  gridFolder.addColor(params, "gridColor").name("Grid Color").onChange(rebuildGridHelper);

  const towerFolder = gui.addFolder("Tower Grid");
  towerFolder.add(params, "towerCountX", 1, 6, 1).name("Count X").onFinishChange(rebuildInstances);
  towerFolder.add(params, "towerCountY", 1, 6, 1).name("Count Y").onFinishChange(rebuildInstances);
  towerFolder.add(params, "towerSpacing", 10, 120, 1).name("Spacing").onFinishChange(rebuildInstances);
}

function rebuild() {
  resetSimulation(true);
  renderVoxels();
}

function resetSeed() {
  resetSimulation(false);
  renderVoxels();
}

function rebuildInstances() {
  resetSimulation(true);
  renderVoxels();
}

function rebuildGridHelper() {
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    gridHelper.material.dispose();
  }

  const gridSize = calcGridSize();
  gridHelper = new THREE.GridHelper(gridSize, Math.max(10, Math.floor(gridSize / 10)), params.gridColor, params.gridColor);
  gridHelper.position.y = calcGridBaseY();
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.45;
  scene.add(gridHelper);
}

function calcGridBaseY() {
  const { gridY, voxelSize } = params;
  const halfY = (gridY * voxelSize) / 2;
  return -halfY + voxelSize * 0.5;
}

function calcGridSize() {
  const { gridX, gridZ, voxelSize, towerCountX, towerCountY, towerSpacing } = params;
  const baseWidth = gridX * voxelSize;
  const baseDepth = gridZ * voxelSize;
  const extraWidth = (Math.max(1, towerCountX) - 1) * towerSpacing;
  const extraDepth = (Math.max(1, towerCountY) - 1) * towerSpacing;
  const span = Math.max(baseWidth + extraWidth, baseDepth + extraDepth);
  return Math.max(200, span * 2);
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
