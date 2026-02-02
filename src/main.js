import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { PLYExporter } from "three/examples/jsm/exporters/PLYExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
  seedSymmetry: "mirror",
  birthMin: 5,
  birthMax: 7,
  surviveMin: 4,
  surviveMax: 8,
  rulePreset: "Spine Rise",
  ruleShuffleEnabled: false,
  ruleShuffleInterval: 10,
  ruleShuffleMode: "cycle",
  stepRate: 6,
  randomSeed: 1,
  gradientMode: "neighbors",
  faceColor: "#ffffff",
  edgeColor: "#1f2630",
  backgroundColor: "#0e1014",
  groundColor: "#0f1218",
  shadowsEnabled: true,
  wireframeEnabled: true,
  wireframeLinewidth: 1,
  materialMode: "soft",
  lightingPreset: "Studio Soft",
  lightIntensity: 1,
  exposure: 1,
  exportGradient: true,
  aoStrength: 0.35,
  play: true,
  exportOBJ: () => exportOBJ(),
  exportGLTF: () => exportGLTF(),
  exportPLY: () => exportPLY(),
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
let composer = null;
let ssaoPass = null;
let renderPass = null;
let clock = null;
let stepAccumulator = 0;

const color = new THREE.Color();
const faceColor = new THREE.Color();
const quaternionIdentity = new THREE.Quaternion();
const scaleIdentity = new THREE.Vector3(1, 1, 1);

let ambientLight = null;
let hemiLight = null;
let dirLight = null;
let fillLight = null;
let rimLight = null;
let groundPlane = null;

const rulePresets = [
  { name: "Spine Rise", birth: [4, 6], survive: [3, 7] },
  { name: "Terrace Weave", birth: [5, 7], survive: [4, 8] },
  { name: "Buttress", birth: [4, 5], survive: [5, 8] },
  { name: "Arcade", birth: [6, 7], survive: [4, 7] },
  { name: "Vaulted", birth: [3, 5], survive: [4, 6] },
  { name: "Column Grid", birth: [5, 6], survive: [3, 6] },
  { name: "Lattice", birth: [6, 8], survive: [5, 7] },
  { name: "Cathedral", birth: [4, 7], survive: [5, 9] }
];
let ruleShuffleIndex = 0;
let lightingBase = {
  ambient: 0.5,
  hemi: 0.35,
  key: 1.05,
  fill: 0.35,
  rim: 0.25
};
const lightingPresets = [
  {
    name: "Studio Soft",
    ambient: 0.5,
    hemi: 0.35,
    hemiSky: 0x9bb6ff,
    hemiGround: 0x1a1f28,
    key: 1.05,
    keyPos: [50, 80, 40],
    fill: 0.35,
    fillPos: [-60, 40, -30],
    rim: 0.25,
    rimPos: [0, 80, -80]
  },
  {
    name: "Gallery",
    ambient: 0.7,
    hemi: 0.2,
    hemiSky: 0xffffff,
    hemiGround: 0x111318,
    key: 0.9,
    keyPos: [30, 70, 30],
    fill: 0.25,
    fillPos: [-30, 30, -20],
    rim: 0.15,
    rimPos: [0, 50, -60]
  },
  {
    name: "Dramatic",
    ambient: 0.25,
    hemi: 0.15,
    hemiSky: 0x8aa0ff,
    hemiGround: 0x0b0e12,
    key: 1.4,
    keyPos: [70, 90, 20],
    fill: 0.1,
    fillPos: [-40, 20, -40],
    rim: 0.4,
    rimPos: [0, 100, -100]
  }
];

init();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(params.backgroundColor);
  scene.fog = null;

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(40, 34, 60);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = params.shadowsEnabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0x9bb6ff, 0x1a1f28, 0.35);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 1.05);
  dirLight.position.set(50, 80, 40);
  dirLight.castShadow = params.shadowsEnabled;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 5;
  dirLight.shadow.camera.far = 260;
  dirLight.shadow.camera.left = -120;
  dirLight.shadow.camera.right = 120;
  dirLight.shadow.camera.top = 120;
  dirLight.shadow.camera.bottom = -120;
  dirLight.shadow.radius = 3.5;
  scene.add(dirLight);

  fillLight = new THREE.DirectionalLight(0x9bc8ff, 0.35);
  fillLight.position.set(-60, 40, -30);
  scene.add(fillLight);

  rimLight = new THREE.DirectionalLight(0xffe1c7, 0.25);
  rimLight.position.set(0, 80, -80);
  scene.add(rimLight);

  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshStandardMaterial({ color: params.groundColor, roughness: 1, metalness: 0 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = calcGridBaseY();
  groundPlane.receiveShadow = params.shadowsEnabled;
  scene.add(groundPlane);
  applyLightingPreset(params.lightingPreset);
  syncEnvironment();

  buildInstancedMesh();
  resetSimulation(true);
  renderVoxels();

  buildGUI();

  renderPass = new RenderPass(scene, camera);
  ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 10;
  ssaoPass.minDistance = 0.005;
  ssaoPass.maxDistance = 0.2;
  ssaoPass.opacity = params.aoStrength;

  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(ssaoPass);

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
  const solidMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.1,
    transparent: true,
    opacity: 0.95,
    clearcoat: 0.1,
    clearcoatRoughness: 0.6
  });
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: params.edgeColor,
    wireframe: true,
    wireframeLinewidth: params.wireframeLinewidth
  });

  const towerCount = params.towerCountX * params.towerCountY;
  const maxCount = params.gridX * params.gridY * params.gridZ * towerCount;
  instancedSolid = new THREE.InstancedMesh(geometry, solidMaterial, maxCount);
  instancedSolid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedSolid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
  instancedSolid.castShadow = params.shadowsEnabled;
  instancedSolid.receiveShadow = params.shadowsEnabled;
  scene.add(instancedSolid);

  instancedWire = new THREE.InstancedMesh(geometry, wireMaterial, maxCount);
  instancedWire.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedWire.visible = params.wireframeEnabled;
  scene.add(instancedWire);

  applyMaterialMode();
}

function resetSimulation(rebuildMesh = false) {
  params.randomSeed = randomSeedValue();
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

  updateGroundPlanePosition();
  params.play = true;

  applyRulePreset(params.rulePreset);

  syncEnvironment();
}

function seedGroundForTower(towerIndex) {
  const rng = mulberry32(params.randomSeed + towerIndex * 9176);
  const { gridX, gridZ } = params;
  const grid = towerGrids[towerIndex];
  const ages = towerAges[towerIndex];
  const neighbors = towerNeighbors[towerIndex];
  const symmetry = params.seedSymmetry;
  const halfX = Math.ceil(gridX / 2);
  const halfZ = Math.ceil(gridZ / 2);

  if (symmetry === "asym") {
    for (let z = 0; z < gridZ; z += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const alive = rng() < params.seedDensity ? 1 : 0;
        setSeedCell(grid, ages, x, 0, z, alive);
      }
    }
  } else if (symmetry === "mirror") {
    for (let z = 0; z < gridZ; z += 1) {
      for (let x = 0; x < halfX; x += 1) {
        const alive = rng() < params.seedDensity ? 1 : 0;
        setSeedCellMirrorX(grid, ages, x, 0, z, alive);
      }
    }
  } else {
    for (let z = 0; z < halfZ; z += 1) {
      for (let x = 0; x < halfX; x += 1) {
        const alive = rng() < params.seedDensity ? 1 : 0;
        setSeedCellMirrorXZ(grid, ages, x, 0, z, alive);
      }
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
  const { gridX, gridY, gridZ } = params;
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
    if (params.ruleShuffleEnabled && params.ruleShuffleInterval > 0 && nextLayer % params.ruleShuffleInterval === 0) {
      shuffleRules();
    }

    for (let z = 0; z < gridZ; z += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const prevIdx = indexFor(x, currentLayer, z);
        const count = countNeighborsLayer(grid, x, currentLayer, z);
        const alive = grid[prevIdx] === 1;

        let nextAlive = 0;
        if (!alive && count >= params.birthMin && count <= params.birthMax) {
          nextAlive = 1;
        } else if (alive && count >= params.surviveMin && count <= params.surviveMax) {
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

  const simFolder = gui.addFolder("Simulation");
  simFolder.add(params, "gridX", 8, 64, 1).name("Grid X").onFinishChange(rebuild);
  simFolder.add(params, "gridY", 8, 96, 1).name("Grid Y").onFinishChange(rebuild);
  simFolder.add(params, "gridZ", 8, 64, 1).name("Grid Z").onFinishChange(rebuild);
  simFolder.add(params, "voxelSize", 0.5, 3, 0.1).name("Voxel Size").onFinishChange(() => {
    renderVoxels();
    updateGroundPlanePosition();
  });
  simFolder.add(params, "seedDensity", 0.05, 0.9, 0.01).name("Seed Density").onFinishChange(resetSeed);
  simFolder.add(params, "seedSymmetry", ["mirror", "four-way", "asym"]).name("Seed Symmetry").onFinishChange(resetSeed);
  simFolder.add(params, "randomSeed", 1, 9999, 1).name("Random Seed").onFinishChange(resetSeed);
  simFolder.add(params, "stepRate", 1, 30, 1).name("Steps/sec");
  simFolder.add(params, "play").name("Play");
  simFolder.add(params, "stepOnce").name("Step Once");
  simFolder.add(params, "reset").name("Reset");

  const rulesFolder = gui.addFolder("Rules");
  rulesFolder.add(params, "rulePreset", rulePresets.map((item) => item.name)).name("Preset").onChange(() => {
    applyRulePreset(params.rulePreset);
  });
  rulesFolder.add(params, "ruleShuffleEnabled").name("Shuffle Rules");
  rulesFolder.add(params, "ruleShuffleMode", ["cycle", "random"]).name("Shuffle Mode");
  rulesFolder.add(params, "ruleShuffleInterval", 1, 50, 1).name("Shuffle Every");
  rulesFolder.add(params, "birthMin", 1, 12, 1).name("Birth Min").disable();
  rulesFolder.add(params, "birthMax", 1, 12, 1).name("Birth Max").disable();
  rulesFolder.add(params, "surviveMin", 1, 12, 1).name("Survive Min").disable();
  rulesFolder.add(params, "surviveMax", 1, 12, 1).name("Survive Max").disable();

  const renderFolder = gui.addFolder("Rendering");
  renderFolder.add(params, "gradientMode", ["neighbors", "age", "solid"]).name("Gradient");
  renderFolder.addColor(params, "faceColor").name("Face Color").onChange(renderVoxels);
  renderFolder.addColor(params, "edgeColor").name("Edge Color").onChange(() => {
    if (instancedWire) {
      instancedWire.material.color.set(params.edgeColor);
    }
  });
  renderFolder.add(params, "wireframeEnabled").name("Wireframe").onChange(syncEnvironment);
  renderFolder.add(params, "wireframeLinewidth", 1, 6, 1).name("Lineweight").onChange(syncEnvironment);
  renderFolder.add(params, "materialMode", ["soft", "transparent", "reflective"]).name("Material").onChange(applyMaterialMode);
  renderFolder.add(params, "aoStrength", 0, 1, 0.01).name("AO Strength").onChange(() => {
    if (ssaoPass) {
      ssaoPass.opacity = params.aoStrength;
    }
  });
  renderFolder.add(params, "exportGradient").name("Export Gradient");
  renderFolder.add(params, "exportOBJ").name("Export OBJ");
  renderFolder.add(params, "exportGLTF").name("Export GLTF");
  renderFolder.add(params, "exportPLY").name("Export PLY");

  const environment = gui.addFolder("Environment");
  environment
    .add(params, "lightingPreset", lightingPresets.map((item) => item.name))
    .name("Lighting")
    .onChange(() => {
      applyLightingPreset(params.lightingPreset);
    });
  environment.add(params, "lightIntensity", 0, 3, 0.01).name("Light Intensity").onChange(applyLightingIntensity);
  environment.add(params, "exposure", 0.2, 2.5, 0.01).name("Exposure").onChange(applyLightingIntensity);
  environment.add(params, "shadowsEnabled").name("Shadows").onChange(syncEnvironment);
  environment.addColor(params, "backgroundColor").name("Background").onChange(syncEnvironment);
  environment.addColor(params, "groundColor").name("Ground").onChange(syncEnvironment);

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

function updateGroundPlanePosition() {
  if (groundPlane) {
    groundPlane.position.y = calcGridBaseY();
  }
}

function calcGridBaseY() {
  const { gridY, voxelSize } = params;
  const halfY = (gridY * voxelSize) / 2;
  return -halfY + voxelSize * 0.5;
}


function shuffleRules() {
  if (!rulePresets.length) return;
  if (params.ruleShuffleMode === "random") {
    const idx = Math.floor(Math.random() * rulePresets.length);
    applyRulePreset(rulePresets[idx].name);
    return;
  }

  ruleShuffleIndex = (ruleShuffleIndex + 1) % rulePresets.length;
  applyRulePreset(rulePresets[ruleShuffleIndex].name);
}

function applyRulePreset(name) {
  const preset = rulePresets.find((item) => item.name === name) || rulePresets[0];
  params.rulePreset = preset.name;
  params.birthMin = preset.birth[0];
  params.birthMax = preset.birth[1];
  params.surviveMin = preset.survive[0];
  params.surviveMax = preset.survive[1];
}

function applyLightingPreset(name) {
  const preset = lightingPresets.find((item) => item.name === name) || lightingPresets[0];
  params.lightingPreset = preset.name;

  lightingBase = {
    ambient: preset.ambient,
    hemi: preset.hemi,
    key: preset.key,
    fill: preset.fill,
    rim: preset.rim
  };

  ambientLight.intensity = preset.ambient;
  hemiLight.intensity = preset.hemi;
  hemiLight.color.setHex(preset.hemiSky);
  hemiLight.groundColor.setHex(preset.hemiGround);

  dirLight.intensity = preset.key;
  dirLight.position.set(...preset.keyPos);
  fillLight.intensity = preset.fill;
  fillLight.position.set(...preset.fillPos);
  rimLight.intensity = preset.rim;
  rimLight.position.set(...preset.rimPos);

  applyLightingIntensity();
}

function applyMaterialMode() {
  if (!instancedSolid) return;
  const material = instancedSolid.material;
  if (params.materialMode === "transparent") {
    material.roughness = 0.2;
    material.metalness = 0.1;
    material.clearcoat = 0.2;
    material.clearcoatRoughness = 0.4;
    material.opacity = 0.45;
    material.transparent = true;
  } else if (params.materialMode === "reflective") {
    material.roughness = 0.08;
    material.metalness = 0.9;
    material.clearcoat = 0.6;
    material.clearcoatRoughness = 0.15;
    material.opacity = 0.98;
    material.transparent = true;
  } else {
    material.roughness = 0.75;
    material.metalness = 0.05;
    material.clearcoat = 0.05;
    material.clearcoatRoughness = 0.8;
    material.opacity = 0.95;
    material.transparent = true;
  }
  material.needsUpdate = true;
}

function applyLightingIntensity() {
  const intensity = Math.max(0, params.lightIntensity);
  if (ambientLight) ambientLight.intensity = lightingBase.ambient * intensity;
  if (hemiLight) hemiLight.intensity = lightingBase.hemi * intensity;
  if (dirLight) dirLight.intensity = lightingBase.key * intensity;
  if (fillLight) fillLight.intensity = lightingBase.fill * intensity;
  if (rimLight) rimLight.intensity = lightingBase.rim * intensity;
  if (renderer) renderer.toneMappingExposure = Math.max(0.1, params.exposure);
}

function syncEnvironment() {
  if (scene) {
    scene.background = new THREE.Color(params.backgroundColor);
  }
  if (groundPlane) {
    groundPlane.material.color.set(params.groundColor);
  }
  if (renderer) {
    renderer.shadowMap.enabled = params.shadowsEnabled;
  }
  if (dirLight) {
    dirLight.castShadow = params.shadowsEnabled;
  }
  if (instancedSolid) {
    instancedSolid.castShadow = params.shadowsEnabled;
    instancedSolid.receiveShadow = params.shadowsEnabled;
  }
  if (groundPlane) {
    groundPlane.receiveShadow = params.shadowsEnabled;
  }
  if (instancedWire) {
    instancedWire.visible = params.wireframeEnabled;
    if (instancedWire.material) {
      instancedWire.material.wireframeLinewidth = params.wireframeLinewidth;
    }
  }
}

function setSeedCell(grid, ages, x, y, z, alive) {
  const idx = indexFor(x, y, z);
  grid[idx] = alive ? 1 : 0;
  ages[idx] = alive ? 1 : 0;
}

function setSeedCellMirrorX(grid, ages, x, y, z, alive) {
  const mirrorX = params.gridX - 1 - x;
  setSeedCell(grid, ages, x, y, z, alive);
  if (mirrorX !== x) {
    setSeedCell(grid, ages, mirrorX, y, z, alive);
  }
}

function setSeedCellMirrorXZ(grid, ages, x, y, z, alive) {
  const mirrorX = params.gridX - 1 - x;
  const mirrorZ = params.gridZ - 1 - z;
  setSeedCell(grid, ages, x, y, z, alive);
  setSeedCell(grid, ages, mirrorX, y, z, alive);
  setSeedCell(grid, ages, x, y, mirrorZ, alive);
  setSeedCell(grid, ages, mirrorX, y, mirrorZ, alive);
}

function randomSeedValue() {
  return Math.floor(Math.random() * 9999) + 1;
}

function exportOBJ() {
  const exportMesh = buildExportMesh();
  if (!exportMesh) return;

  const exporter = new OBJExporter();
  const obj = exporter.parse(exportMesh);
  const blob = new Blob([obj], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "parametric-tower.obj";
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportGLTF() {
  const exportMesh = buildExportMesh();
  if (!exportMesh) return;
  const exporter = new GLTFExporter();
  exporter.parse(
    exportMesh,
    (result) => {
      const gltf = JSON.stringify(result);
      downloadBlob(gltf, "parametric-tower.gltf", "model/gltf+json");
    },
    (error) => {
      console.error("GLTF export error:", error);
    },
    { binary: false }
  );
}

function exportPLY() {
  const exportMesh = buildExportMesh();
  if (!exportMesh) return;
  const exporter = new PLYExporter();
  const ply = exporter.parse(exportMesh, { binary: false });
  downloadBlob(ply, "parametric-tower.ply", "text/plain");
}

function buildExportMesh() {
  if (!towerGrids.length) return null;

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

  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const geometries = [];
  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const exportColor = new THREE.Color();
  const exportFaceColor = new THREE.Color(params.faceColor);

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
            if (grid[idx] !== 1) continue;

            const neighborCount = neighbors[idx];
            const age = ages[idx];
            setVoxelColor(exportColor, neighborCount, age, gradientMode);
            exportColor.multiply(exportFaceColor);
            if (params.exportGradient) {
              const t = gridY > 1 ? y / (gridY - 1) : 0;
              const boost = 0.65 + t * 0.5;
              exportColor.multiplyScalar(boost);
            }

            tempPosition.set(
              x * voxelSize - halfX + voxelSize * 0.5 + offsetX,
              y * voxelSize - halfY + voxelSize * 0.5,
              z * voxelSize - halfZ + voxelSize * 0.5 + offsetZ
            );
            tempMatrix.compose(tempPosition, quaternionIdentity, scaleIdentity);
            const geom = baseGeometry.clone();
            geom.applyMatrix4(tempMatrix);

            const colorArray = new Float32Array(geom.attributes.position.count * 3);
            for (let i = 0; i < geom.attributes.position.count; i += 1) {
              colorArray[i * 3] = exportColor.r;
              colorArray[i * 3 + 1] = exportColor.g;
              colorArray[i * 3 + 2] = exportColor.b;
            }
            geom.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
            geometries.push(geom);
          }
        }
      }
    }
  }

  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries, false);
  return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true }));
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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
  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  if (ssaoPass) {
    ssaoPass.setSize(window.innerWidth, window.innerHeight);
  }
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
