
<img width="2310" height="1873" alt="Screenshot 2026-02-01 220846" src="https://github.com/user-attachments/assets/4e3c770e-cec2-454f-ba08-427a0c7284ca" />


# 260201_ParametricTower

Parametric tower experiment built with Three.js and Vite. It simulates a 3D cellular automaton seeded on the ground plane and renders evolving voxel structures with interactive controls.

## Features
- Instanced voxel rendering for large grids
- 3D cellular automaton with adjustable birth/survival rules
- Live GUI controls for grid size, seed density, and animation
- Orbit camera controls and dynamic lighting
- Multi-tower layout controls (count + spacing)
- Material modes, wireframe overlay, and SSAO
- Lighting presets, exposure, and environment color controls
- Gradient and age-based color modes
- Seed symmetry modes and rule shuffling
- Export to OBJ, GLTF, and PLY

## Getting Started
1. Install dependencies: `npm install`
2. Run dev server: `npm run dev -- --host`
3. Open `http://localhost:5173`

## Controls
- Orbit: left mouse drag
- Pan: right mouse drag (or ctrl + left drag)
- Zoom: mouse wheel
- Use the on-screen GUI to tweak grid size, seed density, rules, and playback

## Deployment
Live demo: https://sbrgkmn.github.io/260201_ParametricTower/

### Build locally
1. Install dependencies: `npm install`
2. Build production assets: `npm run build`
3. Preview locally: `npm run preview` and open the printed URL

### Deploy to GitHub Pages
This repo uses a `gh-pages` branch that contains the built static assets.

1. Build locally: `npm run build`
2. Replace the contents of `gh-pages` with the `dist/` output (root should contain `index.html` and `assets/`).
3. Push `gh-pages` to GitHub. Pages is configured to serve from `gh-pages / (root)`.
