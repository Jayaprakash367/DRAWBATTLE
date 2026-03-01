// Solo Drawing Game with AI Recognition
// DrawBattle - PowerPoint-style drawing interface

let soloCanvas, soloCtx;
let isDrawing = false;
let currentColor = '#222222';
let currentBrushSize = 8;
let currentTool = 'pen'; // 'pen' | 'pencil' | 'highlighter' | 'eraser'
let drawingData = [];
let strokeCount = 0;
let predictionModel = null;
let canPredict = false;
let predictionTimer = null; // track pending prediction timeout
let undoStack = [];          // canvas snapshots for per-stroke undo

// Fun predictions fallback
const funMessages = [
  { message: 'A masterpiece!', confidence: Math.random() * 30 + 70 },
  { message: 'Creative work!', confidence: Math.random() * 30 + 65 },
  { message: 'Artistic expression!', confidence: Math.random() * 30 + 60 },
  { message: 'Abstract art!', confidence: Math.random() * 30 + 55 },
  { message: 'Drawing detected!', confidence: Math.random() * 30 + 50 },
];

// Common objects for quick drawings
const commonObjects = [
  'cat', 'dog', 'tree', 'house', 'car', 'star', 'heart', 'sun',
  'flower', 'bird', 'fish', 'apple', 'circle', 'square', 'triangle',
  'stick figure', 'cloud', 'mountain', 'wave', 'face'
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initSoloCanvas();
  loadAIModel();
});

// Initialize Canvas
function initSoloCanvas() {
  soloCanvas = document.getElementById('soloCanvas');
  soloCtx = soloCanvas.getContext('2d');

  // Add event listeners (only once)
  if (!soloCanvas._listenersAdded) {
    soloCanvas.addEventListener('mousedown', startSoloDraw);
    soloCanvas.addEventListener('mousemove', doSoloDraw);
    // Use window mouseup so strokes complete even if mouse leaves canvas
    window.addEventListener('mouseup', stopSoloDraw);
    soloCanvas.addEventListener('touchstart', handleSoloTouch, { passive: false });
    soloCanvas.addEventListener('touchmove', handleSoloTouch, { passive: false });
    soloCanvas.addEventListener('touchend', stopSoloDraw);
    soloCanvas._listenersAdded = true;
  }

  // First-load only: wait for layout before measuring
  if (!soloCanvas._initialised) {
    requestAnimationFrame(() => {
      applySizeToCanvas();
      soloCanvas._initialised = true;
    });
  }
}

// Resize canvas to fit container and fill white
function applySizeToCanvas() {
  const container = soloCanvas.parentElement;
  const rect = container.getBoundingClientRect();
  const w = Math.max(500, rect.width - 20);
  const h = Math.max(400, rect.height - 20);

  soloCanvas.width = w;
  soloCanvas.height = h;

  soloCtx.fillStyle = '#ffffff';
  soloCtx.fillRect(0, 0, w, h);
  soloCtx.lineCap = 'round';
  soloCtx.lineJoin = 'round';
  applyToolContext();
  // Save blank state as base of undo stack
  undoStack = [soloCanvas.toDataURL()];
}

// Apply current tool context settings to canvas
function applyToolContext() {
  if (currentTool === 'eraser') {
    soloCtx.globalCompositeOperation = 'destination-out';
    soloCtx.lineWidth = currentBrushSize * 2;
    soloCtx.globalAlpha = 1.0;
  } else {
    soloCtx.globalCompositeOperation = 'source-over';
    soloCtx.strokeStyle = currentColor;
    if (currentTool === 'highlighter') {
      soloCtx.globalAlpha = 0.35;
      soloCtx.lineWidth = currentBrushSize * 3;
    } else if (currentTool === 'pencil') {
      soloCtx.globalAlpha = 0.7;
      soloCtx.lineWidth = Math.max(1, Math.round(currentBrushSize * 0.6));
    } else {
      soloCtx.globalAlpha = 1.0;
      soloCtx.lineWidth = currentBrushSize;
    }
  }
}

// Tool Selection
function selectTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.ribbon-tool[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.ribbon-tool[data-tool="${tool}"]`);
  if (btn) btn.classList.add('active');
  applyToolContext();
}

// Load AI Model
async function loadAIModel() {
  const loadingOverlay = document.getElementById('soloLoadingOverlay');
  const loadingText = document.getElementById('loadingText');
  
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Loading AI Model...';
  
  try {
    // Load ml5 sketch recognition model
    predictionModel = await ml5.neuralNetwork({
      task: 'classification',
      debug: false,
      modelUrl: 'https://storage.googleapis.com/tm-model/N7v_8c3QC/model.json', // Google's Quick Draw model
    });
    
    canPredict = true;
    loadingOverlay.classList.add('hidden');
    updatePredictionStatus('🎨 Ready to draw!', 'success');
  } catch (err) {
    console.warn('Failed to load neural network model, using image recognition fallback');
    loadingOverlay.classList.add('hidden');
    
    // Fallback: Use TensorFlow.js simple model or manual classification
    try {
      predictionModel = await ml5.imageClassifier('MobileNet', soloCanvas);
      canPredict = true;
      updatePredictionStatus('🎨 Ready to draw!', 'success');
    } catch (e) {
      console.error('Failed to load models:', e);
      updatePredictionStatus('⚠️ AI model unavailable. Drawing will work for fun!', 'warning');
      canPredict = false;
    }
  }
}

// Drawing Functions
function startSoloDraw(e) {
  e.preventDefault();
  isDrawing = true;
  const rect = soloCanvas.getBoundingClientRect();
  const scaleX = soloCanvas.width / rect.width;
  const scaleY = soloCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  applyToolContext();
  soloCtx.beginPath();
  soloCtx.moveTo(x, y);

  if (currentTool !== 'eraser') {
    strokeCount++;
    updateDrawingStatus();
    drawingData.push({ x, y, color: currentColor, size: currentBrushSize, tool: currentTool });
  }
}

function doSoloDraw(e) {
  if (!isDrawing) return;
  e.preventDefault();

  const rect = soloCanvas.getBoundingClientRect();
  const scaleX = soloCanvas.width / rect.width;
  const scaleY = soloCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  soloCtx.lineTo(x, y);
  soloCtx.stroke();

  if (currentTool !== 'eraser') {
    drawingData.push({ x, y, color: currentColor, size: currentBrushSize, tool: currentTool });
    if (drawingData.length % 30 === 0) {
      predictSoloDrawing();
    }
  }
}

function stopSoloDraw() {
  if (!isDrawing) return;
  isDrawing = false;
  soloCtx.closePath();

  // Save snapshot for undo (cap at 50 steps)
  undoStack.push(soloCanvas.toDataURL());
  if (undoStack.length > 51) undoStack.shift();

  // Predict after every stroke (min 10 data points)
  if (drawingData.length > 10) {
    clearTimeout(predictionTimer);
    predictionTimer = setTimeout(predictSoloDrawing, 400);
  }
}

function handleSoloTouch(e) {
  e.preventDefault();
  const touch = e.touches[0] || e.changedTouches[0];
  if (!touch) return;
  const synth = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} };
  if (e.type === 'touchstart') startSoloDraw(synth);
  else if (e.type === 'touchmove') doSoloDraw(synth);
}

// Color Selection
function selectSoloColor(btn) {
  document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentColor = btn.getAttribute('data-color');
  const preview = document.getElementById('currentColorPreview');
  if (preview) preview.style.background = currentColor;
  if (currentTool !== 'eraser') {
    soloCtx.strokeStyle = currentColor;
  }
}

// Brush Size Selection
function selectSoloBrushSize(size) {
  document.querySelectorAll('.ribbon-size-btn').forEach(b => b.classList.remove('ribbon-size-active'));
  const btn = document.querySelector(`.ribbon-size-btn[data-size="${size}"]`);
  if (btn) btn.classList.add('ribbon-size-active');
  currentBrushSize = size;
  applyToolContext();
}

// Undo last stroke (Clear button)
function clearSoloCanvas() {
  clearTimeout(predictionTimer);
  predictionTimer = null;
  isDrawing = false;

  if (undoStack.length > 1) {
    // Remove current state and restore the one before it
    undoStack.pop();
    const prevDataURL = undoStack[undoStack.length - 1];
    const img = new Image();
    img.onload = () => {
      soloCtx.globalCompositeOperation = 'source-over';
      soloCtx.globalAlpha = 1.0;
      soloCtx.clearRect(0, 0, soloCanvas.width, soloCanvas.height);
      soloCtx.drawImage(img, 0, 0);
      applyToolContext();
    };
    img.src = prevDataURL;

    if (strokeCount > 0) strokeCount--;
    document.getElementById('strokeCount').textContent = strokeCount;

    if (strokeCount === 0) {
      drawingData = [];
      document.getElementById('drawingStatus').textContent = 'Ready';
      clearPredictions();
      updatePredictionStatus('Canvas cleared!', 'info');
    } else {
      // Trim drawingData roughly proportional to remaining strokes
      const approxPts = Math.floor(drawingData.length * (strokeCount / (strokeCount + 1)));
      drawingData = drawingData.slice(0, approxPts);
      updatePredictionStatus('Undo! (' + strokeCount + ' stroke' + (strokeCount > 1 ? 's' : '') + ' left)', 'info');
      predictionTimer = setTimeout(predictSoloDrawing, 350);
    }
  } else {
    // Already at blank state — nothing to undo
    soloCtx.globalCompositeOperation = 'source-over';
    soloCtx.globalAlpha = 1.0;
    soloCtx.clearRect(0, 0, soloCanvas.width, soloCanvas.height);
    soloCtx.fillStyle = '#ffffff';
    soloCtx.fillRect(0, 0, soloCanvas.width, soloCanvas.height);
    applyToolContext();
    drawingData = [];
    strokeCount = 0;
    undoStack = [soloCanvas.toDataURL()];
    clearPredictions();
    document.getElementById('strokeCount').textContent = '0';
    document.getElementById('drawingStatus').textContent = 'Ready';
    updatePredictionStatus('Canvas is already blank!', 'info');
  }
}

// Full clear (used by New button)
function clearAllCanvas() {
  clearTimeout(predictionTimer);
  predictionTimer = null;
  isDrawing = false;
  soloCtx.globalCompositeOperation = 'source-over';
  soloCtx.globalAlpha = 1.0;
  soloCtx.clearRect(0, 0, soloCanvas.width, soloCanvas.height);
  soloCtx.fillStyle = '#ffffff';
  soloCtx.fillRect(0, 0, soloCanvas.width, soloCanvas.height);
  applyToolContext();
  drawingData = [];
  strokeCount = 0;
  undoStack = [soloCanvas.toDataURL()];
  clearPredictions();
  document.getElementById('strokeCount').textContent = '0';
  document.getElementById('drawingStatus').textContent = 'Ready';
  updatePredictionStatus('New canvas — start drawing!', 'info');
}

// Update Drawing Status
function updateDrawingStatus() {
  const status = document.getElementById('drawingStatus');
  const strokeCountEl = document.getElementById('strokeCount');
  
  if (drawingData.length < 5) {
    status.textContent = 'Drawing...';
    status.style.color = 'var(--warning)';
  } else if (drawingData.length < 20) {
    status.textContent = 'Looking good!';
    status.style.color = 'var(--accent)';
  } else {
    status.textContent = 'Nice work!';
    status.style.color = 'var(--success)';
  }
  
  strokeCountEl.textContent = strokeCount;
}

// AI Prediction
async function predictSoloDrawing() {
  if (drawingData.length < 5) return;

  if (!canPredict || !predictionModel) {
    // Use smart canvas analysis instead of random guesses
    smartPredict();
    return;
  }

  try {
    const imageData = soloCanvas.toDataURL();
    const results = await predictionModel.predict(imageData);
    displayPredictions(results);
  } catch (err) {
    console.error('Prediction error:', err);
    smartPredict();
  }
}

// ── Smart Canvas Analyser ─────────────────────────────────────────────────────
// Extracts real visual features from the canvas and scores against known shapes.

function extractFeatures() {
  if (drawingData.length < 5) return null;

  // ── 1. Sample canvas at 64×64 for pixel analysis ──
  const SZ = 64;
  const off = document.createElement('canvas');
  off.width = SZ; off.height = SZ;
  const oc = off.getContext('2d');
  oc.fillStyle = '#fff';
  oc.fillRect(0, 0, SZ, SZ);
  oc.drawImage(soloCanvas, 0, 0, SZ, SZ);
  const px = oc.getImageData(0, 0, SZ, SZ).data;

  const grid = new Uint8Array(SZ * SZ);
  let minX = SZ, maxX = 0, minY = SZ, maxY = 0, inkCount = 0;
  for (let y = 0; y < SZ; y++) {
    for (let x = 0; x < SZ; x++) {
      const i = (y * SZ + x) * 4;
      if (px[i] < 200 || px[i+1] < 200 || px[i+2] < 200) {
        grid[y * SZ + x] = 1; inkCount++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (inkCount < 30) return null;

  const bbW = maxX - minX + 1;
  const bbH = maxY - minY + 1;
  const midX = Math.floor((minX + maxX) / 2);
  const midY = Math.floor((minY + maxY) / 2);

  // ── 2. Core ratios ──
  const aspectRatio = bbW / Math.max(1, bbH);    // >1 = wide, <1 = tall
  const coverage    = inkCount / (bbW * bbH);    // how filled the bbox is

  // ── 3. Quadrant ink distribution ──
  let q = [0, 0, 0, 0]; // TL, TR, BL, BR
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!grid[y * SZ + x]) continue;
    const t = y < midY, l = x < midX;
    q[t ? (l ? 0 : 1) : (l ? 2 : 3)]++;
  }
  const topInk = q[0] + q[1];
  const botInk = q[2] + q[3];
  const topBotRatio = topInk / Math.max(1, botInk); // >1 top-heavy, <1 bottom-heavy

  // ── 4. Symmetry ──
  let vS = 0, vT = 0; // vertical (left-right mirror)
  for (let y = minY; y <= maxY; y++) {
    for (let d = 1; d <= Math.floor(bbW / 2); d++) {
      const lx = midX - d, rx = midX + d;
      if (lx >= 0 && rx < SZ) { vS += grid[y*SZ+lx] === grid[y*SZ+rx] ? 1 : 0; vT++; }
    }
  }
  const vSym = vT > 0 ? vS / vT : 0.5;

  let hS = 0, hT = 0; // horizontal (top-bottom mirror)
  for (let x = minX; x <= maxX; x++) {
    for (let d = 1; d <= Math.floor(bbH / 2); d++) {
      const ty = midY - d, by2 = midY + d;
      if (ty >= 0 && by2 < SZ) { hS += grid[ty*SZ+x] === grid[by2*SZ+x] ? 1 : 0; hT++; }
    }
  }
  const hSym = hT > 0 ? hS / hT : 0.5;

  // ── 5. Edge density (how much ink is near the perimeter = hollow shape) ──
  let edgeInk = 0, innerInk = 0;
  const margin = 3;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!grid[y*SZ+x]) continue;
    const isEdge = x - minX < margin || maxX - x < margin || y - minY < margin || maxY - y < margin;
    isEdge ? edgeInk++ : innerInk++;
  }
  const hollowness = edgeInk / Math.max(1, inkCount); // ~1 = hollow ring, ~0 = filled

  // ── 6. Stroke-level features ──
  let totalAngle = 0, angleSteps = 0;
  for (let i = 2; i < drawingData.length; i++) {
    const dx1 = drawingData[i-1].x - drawingData[i-2].x;
    const dy1 = drawingData[i-1].y - drawingData[i-2].y;
    const dx2 = drawingData[i].x - drawingData[i-1].x;
    const dy2 = drawingData[i].y - drawingData[i-1].y;
    const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
    if (l1 > 1 && l2 > 1) {
      const dot = Math.max(-1, Math.min(1, (dx1*dx2 + dy1*dy2) / (l1 * l2)));
      totalAngle += Math.acos(dot);
      angleSteps++;
    }
  }
  const avgCurvature = angleSteps > 0 ? totalAngle / angleSteps : 0; // high = spiky/sharp

  return { aspectRatio, coverage, topBotRatio, vSym, hSym, hollowness, avgCurvature, strokeCount, bbW, bbH };
}

function scoreShapes(f) {
  // Gaussian match: how close val is to ideal, with given tolerance spread
  const G = (val, ideal, spread) => Math.exp(-0.5 * ((val - ideal) / spread) ** 2);
  // Soft threshold: bonus if val exceeds cutoff
  const GT = (val, cutoff) => val > cutoff ? 1 : val / cutoff;
  const LT = (val, cutoff) => val < cutoff ? 1 : cutoff / val;

  const shapes = [
    // ── Basic Geometry ──────────────────────────────────────────────────────────
    { name: 'circle',          fn: f => G(f.aspectRatio,1,.18)*4 + G(f.hollowness,.72,.18)*4 + f.vSym*2 + f.hSym*2 + G(f.avgCurvature,.12,.08)*3 + LT(f.strokeCount,2)*2 },
    { name: 'oval',            fn: f => G(f.hollowness,.70,.2)*3 + f.vSym*2 + G(f.avgCurvature,.13,.09)*3 + (f.aspectRatio>1.25||f.aspectRatio<0.75?3:0) + LT(f.strokeCount,2)*1 },
    { name: 'square',          fn: f => G(f.aspectRatio,1,.15)*3 + G(f.avgCurvature,.52,.18)*3 + f.vSym*2 + f.hSym*2 + G(f.hollowness,.85,.12)*2 + LT(f.strokeCount,3)*2 },
    { name: 'rectangle',       fn: f => (f.aspectRatio>1.3||f.aspectRatio<0.75?3:0) + G(f.avgCurvature,.52,.18)*3 + f.vSym*2 + f.hSym*2 + G(f.hollowness,.85,.12)*2 },
    { name: 'triangle',        fn: f => G(f.topBotRatio,.45,.2)*3 + G(f.avgCurvature,.55,.18)*3 + f.vSym*3 + G(f.hollowness,.88,.12)*2 + LT(f.strokeCount,3)*2 },
    { name: 'diamond',         fn: f => G(f.aspectRatio,1,.2)*2 + f.vSym*3 + G(f.avgCurvature,.54,.18)*3 + G(f.hollowness,.83,.13)*2 + G(f.topBotRatio,1,.2)*2 },
    { name: 'hexagon',         fn: f => G(f.aspectRatio,1.15,.2)*2 + f.vSym*2 + G(f.hollowness,.85,.12)*2 + G(f.avgCurvature,.5,.18)*2 + LT(f.strokeCount,4)*1 },
    { name: 'pentagon',        fn: f => G(f.aspectRatio,1,.2)*2 + G(f.topBotRatio,.7,.2)*2 + f.vSym*2 + G(f.avgCurvature,.52,.18)*2 + G(f.hollowness,.85,.12)*2 },
    { name: 'star',            fn: f => G(f.avgCurvature,.62,.22)*5 + f.vSym*1.5 + G(f.coverage,.22,.1)*2 + LT(f.strokeCount,2)*2 + G(f.aspectRatio,1,.25)*1 },
    { name: 'crescent',        fn: f => G(f.hollowness,.55,.2)*2 + (f.vSym<0.62?2:0) + G(f.avgCurvature,.15,.09)*3 + G(f.coverage,.28,.12)*2 },
    { name: 'cross / plus',    fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.avgCurvature,.52,.2)*2 + G(f.coverage,.28,.1)*2 },
    { name: 'arrow',           fn: f => G(f.avgCurvature,.48,.2)*3 + LT(f.strokeCount,3)*2 + (f.vSym<0.62?2:0) + (f.aspectRatio>1?2:0) },
    { name: 'parallelogram',   fn: f => (f.aspectRatio>1.3?2:0) + (f.vSym<0.62?2:0) + G(f.avgCurvature,.52,.18)*2 + G(f.hollowness,.85,.12)*2 },
    { name: 'trapezoid',       fn: f => (f.aspectRatio>1.1?2:0) + G(f.topBotRatio,.65,.2)*2 + f.vSym*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'spiral',          fn: f => G(f.coverage,.55,.18)*3 + LT(f.strokeCount,2)*3 + G(f.avgCurvature,.18,.1)*3 + (1-f.hSym)*1.5 },

    // ── Nature / Weather ────────────────────────────────────────────────────────
    { name: 'sun',             fn: f => G(f.aspectRatio,1,.22)*2 + f.vSym*2 + f.hSym*1 + G(f.avgCurvature,.42,.18)*3 + G(f.coverage,.38,.14)*2 },
    { name: 'moon',            fn: f => (f.vSym<0.62?3:0) + G(f.hollowness,.5,.2)*2 + G(f.avgCurvature,.14,.09)*3 + G(f.aspectRatio,.85,.2)*1 },
    { name: 'cloud',           fn: f => GT(f.aspectRatio,1.2)*3 + G(f.topBotRatio,1.5,.4)*2 + G(f.avgCurvature,.22,.1)*3 + f.vSym*1 + G(f.coverage,.2,.09)*2 },
    { name: 'lightning bolt',  fn: f => LT(f.aspectRatio,.9)*2 + G(f.avgCurvature,.58,.2)*4 + LT(f.strokeCount,2)*2 + (f.vSym<0.55?2:0) + G(f.topBotRatio,.9,.3)*1 },
    { name: 'snowflake',       fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.coverage,.22,.1)*2 + GT(f.strokeCount,5)*2 },
    { name: 'raindrop',        fn: f => G(f.aspectRatio,.7,.2)*2 + f.vSym*3 + G(f.topBotRatio,.55,.2)*2 + G(f.avgCurvature,.18,.1)*2 },
    { name: 'wave',            fn: f => GT(f.aspectRatio,1.5)*3 + G(f.topBotRatio,1,.22)*1 + G(f.avgCurvature,.2,.09)*3 + LT(f.strokeCount,3)*2 },
    { name: 'fire / flame',    fn: f => LT(f.aspectRatio,.85)*2 + G(f.topBotRatio,2,.5)*3 + f.vSym*2 + G(f.avgCurvature,.28,.13)*2 },
    { name: 'mountain',        fn: f => GT(f.aspectRatio,1.1)*2 + G(f.topBotRatio,.45,.22)*3 + f.vSym*3 + G(f.avgCurvature,.38,.15)*1 },
    { name: 'volcano',         fn: f => LT(f.aspectRatio,1.1)*2 + G(f.topBotRatio,.4,.2)*3 + f.vSym*2 + G(f.coverage,.45,.15)*2 },
    { name: 'leaf',            fn: f => G(f.aspectRatio,.75,.25)*2 + f.vSym*3 + G(f.hollowness,.62,.2)*2 + G(f.avgCurvature,.2,.1)*2 },
    { name: 'tree',            fn: f => LT(f.aspectRatio,.85)*3 + G(f.topBotRatio,1.6,.4)*2 + f.vSym*2 + G(f.coverage,.35,.15)*1 },
    { name: 'palm tree',       fn: f => LT(f.aspectRatio,.7)*3 + G(f.topBotRatio,2,.5)*2 + f.vSym*1 + G(f.coverage,.25,.1)*2 },
    { name: 'flower',          fn: f => G(f.aspectRatio,1,.28)*2 + f.vSym*2 + f.hSym*1 + G(f.coverage,.38,.13)*2 + GT(f.strokeCount,3)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'mushroom',        fn: f => G(f.aspectRatio,.9,.2)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'cactus',          fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*2 + G(f.coverage,.38,.15)*2 + G(f.avgCurvature,.48,.2)*2 },

    // ── Animals ─────────────────────────────────────────────────────────────────
    { name: 'cat',             fn: f => G(f.aspectRatio,1.1,.3)*1 + GT(f.strokeCount,4)*2 + G(f.topBotRatio,1.1,.3)*1 + f.vSym*1 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'dog',             fn: f => GT(f.aspectRatio,1.3)*2 + GT(f.strokeCount,4)*2 + G(f.coverage,.35,.15)*1 + G(f.avgCurvature,.25,.14)*1 + G(f.topBotRatio,.8,.25)*2 },
    { name: 'fish',            fn: f => GT(f.aspectRatio,1.3)*3 + G(f.topBotRatio,1,.22)*1 + f.vSym*2 + G(f.coverage,.25,.11)*2 + G(f.avgCurvature,.23,.14)*2 },
    { name: 'bird',            fn: f => GT(f.aspectRatio,1.2)*2 + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.28,.14)*2 + G(f.coverage,.2,.1)*2 },
    { name: 'butterfly',       fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*4 + f.hSym*1 + G(f.avgCurvature,.2,.1)*2 + G(f.topBotRatio,1,.2)*1 },
    { name: 'snake',           fn: f => GT(f.aspectRatio,1.4)*2 + LT(f.strokeCount,3)*3 + G(f.avgCurvature,.22,.1)*3 + G(f.coverage,.15,.08)*2 },
    { name: 'turtle',          fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.topBotRatio,.7,.22)*2 + G(f.coverage,.5,.18)*2 + G(f.avgCurvature,.2,.1)*1 },
    { name: 'rabbit',          fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + GT(f.strokeCount,3)*1 },
    { name: 'horse',           fn: f => GT(f.aspectRatio,1.2)*2 + G(f.topBotRatio,.8,.25)*2 + f.vSym*1 + GT(f.strokeCount,3)*2 + G(f.coverage,.38,.15)*1 },
    { name: 'elephant',        fn: f => GT(f.aspectRatio,1.2)*2 + G(f.topBotRatio,.8,.22)*2 + f.vSym*1 + G(f.coverage,.5,.18)*2 },
    { name: 'duck',            fn: f => GT(f.aspectRatio,1.2)*2 + G(f.topBotRatio,1.2,.3)*2 + f.vSym*1 + G(f.avgCurvature,.22,.1)*2 + LT(f.strokeCount,4)*1 },
    { name: 'frog',            fn: f => GT(f.aspectRatio,1.1)*2 + f.vSym*3 + G(f.topBotRatio,.75,.22)*2 + G(f.coverage,.4,.15)*2 },
    { name: 'spider',          fn: f => G(f.aspectRatio,1,.25)*2 + f.vSym*2 + f.hSym*1 + GT(f.strokeCount,6)*3 + G(f.coverage,.18,.1)*2 },
    { name: 'bee',             fn: f => G(f.aspectRatio,1.5,.3)*2 + f.vSym*2 + G(f.coverage,.4,.15)*2 + G(f.avgCurvature,.25,.12)*1 },
    { name: 'shark',           fn: f => GT(f.aspectRatio,1.5)*3 + G(f.topBotRatio,.7,.2)*2 + f.vSym*1 + G(f.avgCurvature,.25,.12)*2 },
    { name: 'whale',           fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,.75,.22)*2 + f.vSym*1 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'octopus',         fn: f => G(f.aspectRatio,1,.25)*2 + G(f.topBotRatio,1.2,.3)*2 + f.vSym*2 + GT(f.strokeCount,5)*3 },
    { name: 'dragonfly',       fn: f => GT(f.aspectRatio,2)*3 + f.vSym*3 + G(f.coverage,.18,.09)*2 + G(f.avgCurvature,.22,.1)*1 },

    // ── Food & Drink ─────────────────────────────────────────────────────────────
    { name: 'apple',           fn: f => LT(f.aspectRatio,1.1)*2 + G(f.topBotRatio,1.2,.25)*2 + f.vSym*3 + G(f.hollowness,.6,.2)*1 },
    { name: 'banana',          fn: f => GT(f.aspectRatio,1.4)*3 + G(f.avgCurvature,.2,.1)*3 + (f.vSym<0.62?2:0) + G(f.topBotRatio,.7,.25)*2 },
    { name: 'strawberry',      fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'pizza slice',     fn: f => G(f.aspectRatio,.85,.2)*2 + G(f.topBotRatio,.45,.2)*3 + f.vSym*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'cake',            fn: f => G(f.aspectRatio,1.2,.25)*2 + f.vSym*3 + G(f.topBotRatio,.8,.22)*2 + G(f.coverage,.5,.18)*2 },
    { name: 'ice cream cone',  fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.3)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'coffee cup',      fn: f => G(f.aspectRatio,.85,.2)*2 + f.vSym*2 + G(f.topBotRatio,.9,.2)*1 + G(f.coverage,.45,.18)*2 },
    { name: 'lollipop',        fn: f => LT(f.aspectRatio,.8)*3 + f.vSym*2 + G(f.topBotRatio,1.8,.4)*3 + G(f.avgCurvature,.18,.1)*2 },
    { name: 'donut',           fn: f => G(f.aspectRatio,1,.2)*3 + G(f.hollowness,.62,.18)*4 + f.vSym*2 + f.hSym*2 + G(f.avgCurvature,.13,.08)*2 },

    // ── Objects & Tools ──────────────────────────────────────────────────────────
    { name: 'key',             fn: f => G(f.aspectRatio,1.8,.4)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.25,.12)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'scissors',        fn: f => G(f.aspectRatio,.75,.25)*2 + f.vSym*2 + G(f.topBotRatio,.7,.25)*2 + G(f.avgCurvature,.42,.18)*2 },
    { name: 'book',            fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.avgCurvature,.52,.18)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'pencil',          fn: f => LT(f.aspectRatio,.55)*3 + f.vSym*2 + G(f.coverage,.25,.1)*2 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'envelope',        fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*3 + G(f.topBotRatio,.75,.22)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'clock',           fn: f => G(f.aspectRatio,1,.2)*3 + G(f.hollowness,.62,.18)*3 + f.vSym*2 + f.hSym*2 + GT(f.strokeCount,3)*2 },
    { name: 'lightbulb',       fn: f => LT(f.aspectRatio,.85)*3 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'umbrella',        fn: f => G(f.aspectRatio,1.3,.3)*2 + G(f.topBotRatio,1.4,.3)*2 + f.vSym*3 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'glasses',         fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*3 + G(f.topBotRatio,1,.2)*1 + G(f.hollowness,.65,.2)*3 },
    { name: 'crown',           fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.55,.2)*2 },
    { name: 'trophy',          fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'phone',           fn: f => LT(f.aspectRatio,.6)*3 + G(f.coverage,.55,.18)*2 + f.vSym*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'flag',            fn: f => GT(f.aspectRatio,1.2)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1,.25)*1 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'anchor',          fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*4 + G(f.avgCurvature,.35,.15)*2 + GT(f.strokeCount,2)*1 },
    { name: 'sword',           fn: f => LT(f.aspectRatio,.45)*3 + f.vSym*3 + G(f.coverage,.2,.1)*2 + G(f.avgCurvature,.5,.18)*2 },
    { name: 'rocket',          fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1.8,.4)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'bell',            fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*3 + G(f.hollowness,.55,.2)*2 },
    { name: 'musical note',    fn: f => (f.vSym<0.62?2:0) + LT(f.aspectRatio,.8)*2 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'headphones',      fn: f => GT(f.aspectRatio,1.2)*2 + G(f.topBotRatio,.65,.22)*3 + f.vSym*3 + G(f.hollowness,.65,.2)*2 },

    // ── Buildings & Transport ────────────────────────────────────────────────────
    { name: 'house',           fn: f => G(f.aspectRatio,1.1,.28)*2 + LT(f.topBotRatio,1)*2 + f.vSym*3 + G(f.avgCurvature,.42,.18)*2 + G(f.coverage,.42,.15)*1 },
    { name: 'castle',          fn: f => G(f.aspectRatio,1.2,.3)*2 + f.vSym*3 + G(f.topBotRatio,.9,.22)*1 + G(f.avgCurvature,.52,.18)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'car',             fn: f => GT(f.aspectRatio,1.4)*3 + G(f.topBotRatio,.7,.22)*2 + f.vSym*2 + G(f.coverage,.42,.15)*2 },
    { name: 'truck',           fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,.65,.2)*2 + f.vSym*1 + G(f.coverage,.48,.16)*2 },
    { name: 'bicycle',         fn: f => GT(f.aspectRatio,1.4)*2 + GT(f.strokeCount,4)*2 + G(f.coverage,.2,.1)*2 + G(f.topBotRatio,.9,.22)*1 },
    { name: 'airplane',        fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*3 + G(f.topBotRatio,1,.2)*1 + G(f.coverage,.25,.12)*2 },
    { name: 'helicopter',      fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,1.1,.25)*2 + f.vSym*1 + GT(f.strokeCount,3)*2 },
    { name: 'sailboat',        fn: f => G(f.aspectRatio,.85,.22)*2 + G(f.topBotRatio,.6,.22)*3 + f.vSym*2 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'boat',            fn: f => GT(f.aspectRatio,1.2)*2 + G(f.topBotRatio,.55,.22)*3 + f.vSym*2 + G(f.coverage,.32,.14)*1 },
    { name: 'train',           fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*1 + G(f.topBotRatio,.8,.22)*2 + G(f.coverage,.5,.18)*2 },
    { name: 'lighthouse',      fn: f => LT(f.aspectRatio,.6)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'bridge',          fn: f => GT(f.aspectRatio,2)*3 + G(f.topBotRatio,.55,.2)*2 + f.vSym*3 + G(f.hollowness,.72,.2)*2 },
    { name: 'tent',            fn: f => G(f.aspectRatio,1.3,.3)*2 + f.vSym*3 + G(f.topBotRatio,.42,.2)*3 + G(f.avgCurvature,.52,.18)*2 },

    // ── People & Body ────────────────────────────────────────────────────────────
    { name: 'face',            fn: f => G(f.aspectRatio,1,.25)*2 + G(f.hollowness,.5,.2)*2 + f.vSym*2 + GT(f.strokeCount,3)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'stick figure',    fn: f => G(f.aspectRatio,.75,.3)*1 + f.vSym*2 + GT(f.strokeCount,5)*3 + G(f.coverage,.18,.1)*2 },
    { name: 'hand',            fn: f => LT(f.aspectRatio,1.1)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.3,.3)*2 + GT(f.strokeCount,4)*2 },
    { name: 'eye',             fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*3 + f.hSym*1 + G(f.hollowness,.55,.2)*2 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'footprint',       fn: f => LT(f.aspectRatio,.7)*2 + G(f.topBotRatio,1.3,.3)*2 + f.vSym*1 + GT(f.strokeCount,3)*2 },
    { name: 'hat',             fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.35,.15)*1 },

    // ── Symbols ──────────────────────────────────────────────────────────────────
    { name: 'heart',           fn: f => G(f.aspectRatio,1,.22)*2 + G(f.topBotRatio,1.35,.28)*3 + f.vSym*3 + (1-f.hSym)*1.5 + G(f.coverage,.32,.12)*1 },
    { name: 'infinity symbol', fn: f => GT(f.aspectRatio,2)*3 + G(f.hollowness,.6,.2)*3 + f.vSym*3 + G(f.avgCurvature,.14,.08)*2 },
    { name: 'yin yang',        fn: f => G(f.aspectRatio,1,.18)*3 + G(f.coverage,.58,.18)*3 + f.vSym*2 + G(f.avgCurvature,.15,.08)*2 },
    { name: 'peace sign',      fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + G(f.hollowness,.62,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'smiley face',     fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + G(f.hollowness,.62,.18)*2 + G(f.topBotRatio,1,.2)*2 + GT(f.strokeCount,3)*2 },
    { name: 'skull',           fn: f => G(f.aspectRatio,.9,.2)*2 + f.vSym*3 + G(f.topBotRatio,1.2,.28)*2 + G(f.coverage,.42,.15)*2 },

    // ── Space ────────────────────────────────────────────────────────────────────
    { name: 'planet / Saturn', fn: f => GT(f.aspectRatio,1.4)*3 + G(f.hollowness,.62,.2)*2 + f.vSym*2 + G(f.avgCurvature,.14,.08)*3 },
    { name: 'UFO',             fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.18,.1)*2 },
    { name: 'shooting star',   fn: f => GT(f.aspectRatio,1.5)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.35,.15)*2 + LT(f.strokeCount,4)*2 },
    { name: 'telescope',       fn: f => LT(f.aspectRatio,.7)*2 + (f.vSym<0.62?2:0) + G(f.topBotRatio,1.2,.3)*2 + G(f.coverage,.38,.15)*2 },

    // ── Sports & Activities ──────────────────────────────────────────────────────
    { name: 'football',        fn: f => GT(f.aspectRatio,1.2)*2 + G(f.hollowness,.58,.2)*2 + f.vSym*2 + G(f.avgCurvature,.15,.08)*2 },
    { name: 'basketball',      fn: f => G(f.aspectRatio,1,.18)*3 + G(f.hollowness,.62,.18)*3 + f.vSym*2 + f.hSym*2 + GT(f.strokeCount,3)*2 },
    { name: 'tennis racket',   fn: f => LT(f.aspectRatio,.7)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.hollowness,.68,.2)*2 },
    { name: 'trophy cup',      fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'kite',            fn: f => G(f.aspectRatio,.85,.22)*2 + f.vSym*3 + G(f.avgCurvature,.52,.18)*3 + G(f.topBotRatio,1,.22)*2 },

    // ── More Geometry ────────────────────────────────────────────────────────────
    { name: 'octagon',         fn: f => G(f.aspectRatio,1,.15)*3 + f.vSym*3 + f.hSym*3 + G(f.hollowness,.85,.12)*2 + G(f.avgCurvature,.5,.18)*2 },
    { name: 'semicircle',      fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,.45,.2)*3 + f.vSym*3 + G(f.avgCurvature,.13,.08)*3 },
    { name: 'cone',            fn: f => f.vSym*3 + G(f.topBotRatio,.42,.2)*4 + G(f.avgCurvature,.52,.18)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'cube outline',    fn: f => G(f.aspectRatio,1,.2)*2 + G(f.avgCurvature,.52,.18)*3 + GT(f.strokeCount,3)*2 + (f.vSym<0.65?2:0) },
    { name: 'cylinder',        fn: f => LT(f.aspectRatio,.85)*3 + f.vSym*3 + G(f.topBotRatio,1,.2)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'rhombus',         fn: f => G(f.aspectRatio,1.3,.25)*2 + f.vSym*3 + G(f.avgCurvature,.54,.18)*3 + G(f.hollowness,.83,.13)*2 },
    { name: 'zigzag',          fn: f => GT(f.aspectRatio,1.4)*3 + G(f.avgCurvature,.72,.2)*5 + LT(f.strokeCount,3)*2 + (f.vSym<0.55?2:0) },
    { name: 'ring / torus',    fn: f => G(f.aspectRatio,1,.18)*3 + GT(f.hollowness,.78,.15)*5 + f.vSym*2 + f.hSym*2 },
    { name: 'wedge',           fn: f => GT(f.aspectRatio,1.5)*2 + G(f.topBotRatio,.4,.2)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*2 },
    { name: 'heptagon',        fn: f => G(f.aspectRatio,1,.18)*2 + f.vSym*2 + G(f.hollowness,.85,.12)*2 + G(f.avgCurvature,.5,.18)*2 },
    { name: 'nonagon',         fn: f => G(f.aspectRatio,1,.15)*2 + f.vSym*2 + f.hSym*2 + G(f.hollowness,.85,.12)*2 },
    { name: 'ellipse',         fn: f => G(f.hollowness,.70,.2)*3 + (f.aspectRatio>1.3?3:0) + f.vSym*2 + f.hSym*2 + G(f.avgCurvature,.12,.08)*3 },
    { name: 'bowtie',          fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*3 + G(f.topBotRatio,1,.2)*2 + G(f.hollowness,.6,.2)*2 },
    { name: 'bracket',         fn: f => LT(f.aspectRatio,.55)*3 + G(f.avgCurvature,.35,.15)*3 + LT(f.strokeCount,3)*2 + G(f.hollowness,.75,.2)*2 },

    // ── More Animals ────────────────────────────────────────────────────────────
    { name: 'lion',            fn: f => G(f.aspectRatio,.95,.28)*2 + f.vSym*3 + G(f.coverage,.45,.18)*2 + G(f.topBotRatio,1.2,.3)*2 },
    { name: 'tiger',           fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.coverage,.45,.18)*2 + G(f.topBotRatio,.85,.25)*2 },
    { name: 'giraffe',         fn: f => LT(f.aspectRatio,.55)*3 + f.vSym*2 + G(f.topBotRatio,2,.5)*3 + G(f.coverage,.3,.12)*2 },
    { name: 'zebra',           fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.coverage,.45,.18)*2 + G(f.topBotRatio,.8,.25)*2 },
    { name: 'bear',            fn: f => G(f.aspectRatio,1,.28)*2 + f.vSym*3 + G(f.coverage,.5,.18)*3 + G(f.topBotRatio,1.1,.3)*2 },
    { name: 'fox',             fn: f => G(f.aspectRatio,1.1,.3)*2 + f.vSym*2 + G(f.topBotRatio,.85,.25)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'wolf',            fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.topBotRatio,.85,.25)*2 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'deer',            fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*2 + G(f.topBotRatio,1.5,.4)*2 + GT(f.strokeCount,4)*2 },
    { name: 'crocodile',       fn: f => GT(f.aspectRatio,2)*4 + G(f.topBotRatio,.7,.2)*2 + f.vSym*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'penguin',         fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.topBotRatio,1,.25)*2 + G(f.coverage,.52,.18)*3 },
    { name: 'flamingo',        fn: f => LT(f.aspectRatio,.6)*3 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.5,.4)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'eagle',           fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,1.2,.3)*2 + f.vSym*3 + G(f.avgCurvature,.3,.14)*2 },
    { name: 'parrot',          fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*2 + G(f.coverage,.38,.15)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'crab',            fn: f => GT(f.aspectRatio,1.4)*3 + f.vSym*3 + G(f.topBotRatio,.75,.22)*2 + GT(f.strokeCount,5)*2 },
    { name: 'lobster',         fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*2 + G(f.coverage,.35,.15)*2 + GT(f.strokeCount,4)*2 },
    { name: 'starfish',        fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + f.hSym*2 + G(f.avgCurvature,.62,.22)*4 + G(f.coverage,.28,.12)*2 },
    { name: 'jellyfish',       fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.6,.4)*3 + G(f.avgCurvature,.2,.1)*2 },
    { name: 'seahorse',        fn: f => LT(f.aspectRatio,.7)*3 + (f.vSym<0.62?2:0) + G(f.avgCurvature,.25,.12)*2 + G(f.topBotRatio,1.3,.3)*2 },
    { name: 'snail',           fn: f => G(f.aspectRatio,1.2,.3)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.42,.15)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'ant',             fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*2 + GT(f.strokeCount,5)*3 + G(f.coverage,.2,.1)*2 },
    { name: 'bat',             fn: f => GT(f.aspectRatio,2)*4 + f.vSym*3 + G(f.topBotRatio,1.2,.3)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'panda',           fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + G(f.coverage,.52,.18)*3 + GT(f.strokeCount,3)*2 },
    { name: 'kangaroo',        fn: f => LT(f.aspectRatio,.8)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'koala',           fn: f => G(f.aspectRatio,.95,.22)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.28)*2 + G(f.coverage,.48,.18)*2 },
    { name: 'camel',           fn: f => GT(f.aspectRatio,1.4)*3 + G(f.topBotRatio,1.2,.3)*3 + f.vSym*2 + G(f.coverage,.42,.15)*2 },
    { name: 'rhino',           fn: f => GT(f.aspectRatio,1.4)*3 + G(f.topBotRatio,.7,.22)*2 + f.vSym*2 + G(f.coverage,.52,.18)*2 },
    { name: 'hippo',           fn: f => GT(f.aspectRatio,1.3)*2 + G(f.topBotRatio,.7,.22)*2 + f.vSym*2 + G(f.coverage,.55,.18)*3 },
    { name: 'gorilla',         fn: f => G(f.aspectRatio,.9,.25)*2 + f.vSym*2 + G(f.coverage,.52,.18)*2 + G(f.topBotRatio,1.1,.28)*2 },
    { name: 'monkey',          fn: f => G(f.aspectRatio,.95,.25)*2 + f.vSym*2 + G(f.coverage,.42,.15)*2 + G(f.topBotRatio,1.2,.3)*2 },
    { name: 'squirrel',        fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*2 + G(f.topBotRatio,1.5,.35)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'hedgehog',        fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.avgCurvature,.55,.2)*3 + G(f.coverage,.4,.15)*2 },
    { name: 'owl',             fn: f => G(f.aspectRatio,.9,.22)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.28)*2 + GT(f.strokeCount,3)*2 },
    { name: 'swan',            fn: f => G(f.aspectRatio,1.1,.3)*2 + f.vSym*2 + G(f.avgCurvature,.18,.1)*3 + G(f.topBotRatio,.8,.25)*2 },
    { name: 'peacock',         fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.8,.4)*3 + G(f.coverage,.42,.15)*2 },
    { name: 'toucan',          fn: f => GT(f.aspectRatio,1.3)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1,.25)*1 + G(f.coverage,.38,.15)*2 },
    { name: 'scorpion',        fn: f => GT(f.aspectRatio,1.3)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.45,.2)*3 + GT(f.strokeCount,4)*2 },
    { name: 'worm',            fn: f => GT(f.aspectRatio,2)*3 + G(f.avgCurvature,.22,.1)*3 + LT(f.strokeCount,3)*3 + G(f.coverage,.12,.07)*2 },
    { name: 'ladybug',         fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + G(f.coverage,.5,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'grasshopper',     fn: f => GT(f.aspectRatio,1.5)*3 + (f.vSym<0.65?2:0) + GT(f.strokeCount,4)*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'caterpillar',     fn: f => GT(f.aspectRatio,2)*3 + f.vSym*2 + GT(f.strokeCount,4)*3 + G(f.coverage,.38,.15)*2 },
    { name: 'rooster',         fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*2 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.45,.2)*2 },
    { name: 'mosquito',        fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*2 + GT(f.strokeCount,4)*3 + G(f.coverage,.15,.08)*2 },
    { name: 'hamster',         fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + G(f.coverage,.5,.18)*3 + G(f.topBotRatio,1,.22)*2 },
    { name: 'dolphin',         fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.avgCurvature,.2,.1)*3 + G(f.topBotRatio,.75,.22)*2 },
    { name: 'seal',            fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*2 + G(f.coverage,.45,.18)*2 + G(f.avgCurvature,.18,.09)*2 },
    { name: 'cow',             fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.coverage,.5,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'pig',             fn: f => G(f.aspectRatio,1,.25)*2 + f.vSym*3 + G(f.coverage,.52,.18)*3 + G(f.topBotRatio,1,.22)*2 },
    { name: 'sheep',           fn: f => G(f.aspectRatio,1.1,.28)*2 + f.vSym*2 + G(f.coverage,.52,.18)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'goat',            fn: f => GT(f.aspectRatio,1.1)*2 + f.vSym*2 + G(f.topBotRatio,.85,.25)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'fox',             fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.topBotRatio,.85,.25)*2 + G(f.avgCurvature,.32,.15)*2 },

    // ── More Food & Drink ───────────────────────────────────────────────────────
    { name: 'carrot',          fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*3 + G(f.topBotRatio,.45,.2)*3 + G(f.avgCurvature,.38,.15)*1 },
    { name: 'broccoli',        fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'corn',            fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*3 + G(f.topBotRatio,1.2,.3)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'pineapple',       fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.5,.18)*2 },
    { name: 'watermelon',      fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.coverage,.52,.18)*2 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'orange',          fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*3 + f.hSym*2 + G(f.coverage,.58,.18)*3 + G(f.hollowness,.6,.2)*2 },
    { name: 'grapes',          fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + GT(f.strokeCount,4)*2 },
    { name: 'cherry',          fn: f => G(f.aspectRatio,1.2,.3)*2 + f.vSym*3 + G(f.topBotRatio,.8,.25)*2 + GT(f.strokeCount,2)*2 },
    { name: 'pear',            fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.6,.35)*3 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'mango',           fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.18,.1)*2 },
    { name: 'cookie',          fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*2 + f.hSym*2 + G(f.coverage,.62,.18)*3 },
    { name: 'burger',          fn: f => GT(f.aspectRatio,1.4)*3 + f.vSym*2 + G(f.topBotRatio,1,.22)*2 + G(f.coverage,.62,.18)*2 },
    { name: 'hot dog',         fn: f => GT(f.aspectRatio,2)*4 + f.vSym*2 + G(f.topBotRatio,.9,.2)*2 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'taco',            fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.topBotRatio,.65,.22)*3 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'sushi',           fn: f => GT(f.aspectRatio,1.3)*2 + G(f.topBotRatio,1,.22)*1 + f.vSym*2 + G(f.coverage,.55,.18)*2 },
    { name: 'bread loaf',      fn: f => GT(f.aspectRatio,1.4)*3 + f.vSym*2 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.6,.18)*2 },
    { name: 'egg',             fn: f => G(f.aspectRatio,.85,.2)*2 + f.vSym*3 + G(f.topBotRatio,1.2,.25)*2 + G(f.coverage,.62,.18)*3 },
    { name: 'cheese',          fn: f => GT(f.aspectRatio,1.4)*2 + G(f.avgCurvature,.52,.18)*2 + f.vSym*1 + G(f.coverage,.6,.18)*2 },
    { name: 'pie',             fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*2 + G(f.topBotRatio,.9,.2)*1 + G(f.coverage,.6,.18)*2 },
    { name: 'cupcake',         fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*3 + G(f.coverage,.48,.15)*2 },
    { name: 'wine glass',      fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'bottle',          fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.3)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'tomato',          fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*2 + G(f.coverage,.58,.18)*3 },
    { name: 'pumpkin',         fn: f => G(f.aspectRatio,1.1,.22)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.6,.18)*3 },
    { name: 'pepper',          fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.2,.1)*2 },
    { name: 'avocado',         fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.3)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'potato',          fn: f => G(f.aspectRatio,1.3,.3)*2 + G(f.avgCurvature,.18,.1)*3 + f.vSym*1 + G(f.coverage,.65,.18)*3 },
    { name: 'onion',           fn: f => G(f.aspectRatio,1,.22)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.55,.18)*3 },
    { name: 'pretzel',         fn: f => G(f.aspectRatio,1,.25)*2 + f.vSym*3 + G(f.hollowness,.6,.2)*3 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'ice cream scoop', fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.6,.35)*3 + G(f.hollowness,.55,.2)*2 },
    { name: 'popcorn box',     fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*2 + G(f.topBotRatio,1.2,.28)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'candy cane',      fn: f => LT(f.aspectRatio,.7)*2 + G(f.avgCurvature,.28,.14)*3 + LT(f.strokeCount,2)*3 + G(f.topBotRatio,1.5,.35)*2 },
    { name: 'waffle',          fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*2 + f.hSym*2 + G(f.coverage,.72,.18)*3 },
    { name: 'soda can',        fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1,.2)*2 + G(f.coverage,.58,.18)*2 },
    { name: 'teapot',          fn: f => G(f.aspectRatio,1.2,.3)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1,.25)*1 + G(f.coverage,.5,.18)*2 },

    // ── More Objects & Tools ─────────────────────────────────────────────────────
    { name: 'guitar',          fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'piano keys',      fn: f => GT(f.aspectRatio,2.5)*3 + f.vSym*2 + G(f.coverage,.65,.18)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'violin',          fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*3 + G(f.coverage,.42,.15)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'drum',            fn: f => G(f.aspectRatio,1.3,.28)*2 + f.vSym*2 + G(f.hollowness,.65,.2)*2 + G(f.topBotRatio,1,.22)*1 },
    { name: 'trumpet',         fn: f => GT(f.aspectRatio,1.8)*3 + (f.vSym<0.65?2:0) + G(f.coverage,.38,.15)*2 + G(f.avgCurvature,.25,.12)*2 },
    { name: 'saxophone',       fn: f => LT(f.aspectRatio,.75)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.28,.14)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'hammer',          fn: f => G(f.aspectRatio,1,.3)*2 + f.vSym*2 + G(f.topBotRatio,1.4,.3)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'wrench',          fn: f => LT(f.aspectRatio,.8)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.38,.15)*2 + G(f.coverage,.3,.12)*2 },
    { name: 'screwdriver',     fn: f => LT(f.aspectRatio,.55)*3 + f.vSym*2 + G(f.coverage,.22,.1)*2 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'axe',             fn: f => LT(f.aspectRatio,.85)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'magnifying glass',fn: f => G(f.aspectRatio,.9,.25)*2 + f.vSym*2 + G(f.hollowness,.62,.18)*3 + G(f.topBotRatio,1.3,.3)*2 },
    { name: 'compass',         fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.avgCurvature,.52,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'ruler',           fn: f => GT(f.aspectRatio,3)*4 + f.vSym*2 + G(f.topBotRatio,1,.15)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'calculator',      fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.coverage,.72,.18)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'camera',          fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*2 + G(f.hollowness,.55,.2)*2 + G(f.topBotRatio,1,.22)*1 },
    { name: 'television',      fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*3 + G(f.hollowness,.72,.18)*3 + G(f.topBotRatio,1,.2)*2 },
    { name: 'lamp',            fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'chair',           fn: f => G(f.aspectRatio,.9,.28)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.1,.28)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'table',           fn: f => GT(f.aspectRatio,1.5)*3 + G(f.topBotRatio,.55,.2)*3 + f.vSym*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'bed',             fn: f => GT(f.aspectRatio,1.6)*3 + f.vSym*2 + G(f.topBotRatio,.98,.18)*2 + G(f.coverage,.62,.18)*2 },
    { name: 'door',            fn: f => LT(f.aspectRatio,.6)*3 + f.vSym*3 + G(f.hollowness,.72,.18)*2 + G(f.topBotRatio,1,.18)*2 },
    { name: 'window',          fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.hollowness,.78,.15)*3 + GT(f.strokeCount,3)*2 },
    { name: 'ladder',          fn: f => LT(f.aspectRatio,.55)*3 + f.vSym*3 + G(f.coverage,.35,.15)*2 + GT(f.strokeCount,5)*2 },
    { name: 'bucket',          fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,.8,.22)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'broom',           fn: f => LT(f.aspectRatio,.75)*3 + (f.vSym<0.65?2:0) + G(f.topBotRatio,.45,.2)*3 + G(f.avgCurvature,.42,.18)*2 },
    { name: 'shopping bag',    fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1,.2)*1 + G(f.coverage,.58,.18)*2 },
    { name: 'suitcase',        fn: f => G(f.aspectRatio,1.3,.28)*2 + f.vSym*3 + G(f.coverage,.62,.18)*3 + G(f.hollowness,.72,.18)*2 },
    { name: 'backpack',        fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1,.22)*1 + G(f.coverage,.62,.18)*2 },
    { name: 'briefcase',       fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*3 + G(f.topBotRatio,1,.22)*1 + G(f.hollowness,.72,.18)*2 },
    { name: 'wallet',          fn: f => GT(f.aspectRatio,1.6)*2 + f.vSym*2 + G(f.coverage,.72,.18)*3 + G(f.avgCurvature,.52,.18)*1 },
    { name: 'watch',           fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*2 + G(f.hollowness,.62,.18)*3 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'ring',            fn: f => G(f.aspectRatio,1,.18)*3 + GT(f.hollowness,.7,.15)*4 + f.vSym*2 + f.hSym*2 },
    { name: 'necklace',        fn: f => GT(f.aspectRatio,1.5)*2 + G(f.hollowness,.65,.2)*2 + f.vSym*2 + G(f.topBotRatio,.65,.22)*2 },
    { name: 'bow tie',         fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*4 + G(f.topBotRatio,1,.2)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'tie',             fn: f => LT(f.aspectRatio,.55)*3 + f.vSym*3 + G(f.topBotRatio,.4,.2)*3 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'shoe',            fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,.65,.22)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.22,.1)*2 },
    { name: 'boot',            fn: f => LT(f.aspectRatio,.85)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,.7,.22)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'sock',            fn: f => LT(f.aspectRatio,.75)*3 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'lantern',         fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.hollowness,.55,.2)*2 + G(f.topBotRatio,1,.22)*2 },
    { name: 'mirror',          fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.hollowness,.72,.2)*2 },
    { name: 'candle',          fn: f => LT(f.aspectRatio,.45)*4 + f.vSym*3 + G(f.coverage,.42,.15)*2 + G(f.topBotRatio,1.2,.28)*2 },
    { name: 'hourglass',       fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.coverage,.38,.15)*3 + G(f.avgCurvature,.52,.18)*3 },
    { name: 'paint brush',     fn: f => LT(f.aspectRatio,.45)*3 + f.vSym*2 + G(f.topBotRatio,.35,.18)*3 + G(f.coverage,.22,.1)*2 },
    { name: 'palette',         fn: f => G(f.aspectRatio,1.1,.3)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.42,.15)*2 + G(f.hollowness,.55,.2)*2 },

    // ── More Symbols ────────────────────────────────────────────────────────────
    { name: 'checkmark',       fn: f => G(f.aspectRatio,1.2,.3)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.42,.18)*3 + LT(f.strokeCount,2)*3 },
    { name: 'X mark',          fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.avgCurvature,.55,.2)*3 + LT(f.strokeCount,3)*2 },
    { name: 'question mark',   fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*2 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'exclamation mark',fn: f => LT(f.aspectRatio,.35)*5 + f.vSym*3 + G(f.coverage,.35,.15)*2 + GT(f.strokeCount,2)*2 },
    { name: 'dollar sign',     fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*2 + G(f.avgCurvature,.22,.1)*3 + GT(f.strokeCount,2)*2 },
    { name: 'percent sign',    fn: f => G(f.aspectRatio,1,.28)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.35,.15)*2 + GT(f.strokeCount,2)*2 },
    { name: 'at sign',         fn: f => G(f.aspectRatio,1,.2)*2 + G(f.hollowness,.58,.2)*3 + f.vSym*1 + G(f.avgCurvature,.18,.09)*2 },
    { name: 'recycle symbol',  fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*2 + GT(f.strokeCount,3)*3 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'wifi symbol',     fn: f => GT(f.aspectRatio,1.4)*3 + f.vSym*3 + G(f.topBotRatio,.55,.2)*3 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'battery',         fn: f => GT(f.aspectRatio,2)*4 + f.vSym*2 + G(f.hollowness,.72,.18)*2 + G(f.topBotRatio,1,.18)*2 },
    { name: 'power button',    fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + G(f.hollowness,.62,.2)*3 + GT(f.strokeCount,2)*2 },
    { name: 'play button',     fn: f => G(f.aspectRatio,.9,.2)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*3 + LT(f.strokeCount,2)*2 },
    { name: 'pause button',    fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*3 + G(f.coverage,.5,.18)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'home icon',       fn: f => G(f.aspectRatio,1,.25)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'lock',            fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'gear',            fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*2 + f.hSym*1 + G(f.avgCurvature,.55,.2)*3 + G(f.hollowness,.58,.2)*2 },
    { name: 'thumbs up',       fn: f => LT(f.aspectRatio,.95)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.2,.3)*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'thumbs down',     fn: f => LT(f.aspectRatio,.95)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,.8,.25)*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'speech bubble',   fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*2 + G(f.hollowness,.55,.2)*2 + G(f.topBotRatio,1.2,.3)*2 },
    { name: 'thought bubble',  fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*2 + G(f.hollowness,.55,.2)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'music symbol',    fn: f => f.vSym*3 + G(f.aspectRatio,1,.25)*2 + G(f.avgCurvature,.35,.15)*2 + GT(f.strokeCount,3)*2 },
    { name: 'copyright',       fn: f => G(f.aspectRatio,1,.18)*3 + G(f.hollowness,.62,.18)*4 + f.vSym*2 + f.hSym*2 },
    { name: 'star of David',   fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + G(f.avgCurvature,.6,.22)*4 + G(f.coverage,.3,.12)*2 },
    { name: 'wheelchair',      fn: f => LT(f.aspectRatio,.9)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.35,.15)*2 + GT(f.strokeCount,4)*2 },

    // ── More Vehicles ────────────────────────────────────────────────────────────
    { name: 'submarine',       fn: f => GT(f.aspectRatio,2.5)*5 + f.vSym*2 + G(f.topBotRatio,1,.18)*2 + G(f.avgCurvature,.15,.09)*2 },
    { name: 'hot air balloon', fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.6,.35)*3 + G(f.coverage,.62,.18)*2 },
    { name: 'tractor',         fn: f => GT(f.aspectRatio,1.3)*2 + G(f.topBotRatio,.75,.22)*2 + f.vSym*1 + GT(f.strokeCount,4)*2 },
    { name: 'ambulance',       fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.topBotRatio,.7,.22)*2 + G(f.coverage,.5,.18)*2 },
    { name: 'school bus',      fn: f => GT(f.aspectRatio,1.8)*4 + f.vSym*2 + G(f.topBotRatio,.72,.2)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'scooter',         fn: f => GT(f.aspectRatio,1.4)*2 + G(f.topBotRatio,.75,.22)*2 + f.vSym*1 + G(f.coverage,.32,.14)*2 },
    { name: 'motorcycle',      fn: f => GT(f.aspectRatio,1.5)*3 + G(f.topBotRatio,.75,.22)*2 + f.vSym*1 + G(f.coverage,.3,.12)*2 },
    { name: 'skateboard',      fn: f => GT(f.aspectRatio,2.5)*4 + G(f.topBotRatio,.5,.2)*3 + f.vSym*2 + G(f.coverage,.3,.12)*2 },
    { name: 'canoe',           fn: f => GT(f.aspectRatio,2.5)*4 + f.vSym*2 + G(f.topBotRatio,.5,.2)*3 + G(f.avgCurvature,.2,.1)*2 },
    { name: 'parachute',       fn: f => G(f.aspectRatio,1.3,.3)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'space shuttle',   fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1.8,.4)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'satellite',       fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*2 + f.hSym*1 + G(f.coverage,.28,.12)*2 + GT(f.strokeCount,3)*2 },
    { name: 'blimp',           fn: f => GT(f.aspectRatio,2)*4 + f.vSym*2 + G(f.topBotRatio,1,.18)*2 + G(f.avgCurvature,.12,.08)*3 },
    { name: 'race car',        fn: f => GT(f.aspectRatio,2)*4 + G(f.topBotRatio,.6,.2)*2 + f.vSym*2 + G(f.coverage,.48,.16)*2 },
    { name: 'rowboat',         fn: f => GT(f.aspectRatio,1.6)*3 + G(f.topBotRatio,.55,.22)*3 + f.vSym*2 + GT(f.strokeCount,3)*2 },

    // ── More Buildings & Structures ──────────────────────────────────────────────
    { name: 'pyramid',         fn: f => G(f.aspectRatio,1.2,.25)*2 + f.vSym*3 + G(f.topBotRatio,.42,.2)*4 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'igloo',           fn: f => G(f.aspectRatio,1.3,.28)*2 + f.vSym*3 + G(f.topBotRatio,.65,.22)*2 + G(f.coverage,.58,.18)*3 },
    { name: 'windmill',        fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'water tower',     fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*3 + G(f.coverage,.55,.18)*2 },
    { name: 'skyscraper',      fn: f => LT(f.aspectRatio,.4)*4 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.62,.18)*2 },
    { name: 'barn',            fn: f => GT(f.aspectRatio,1.1)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'church',          fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*3 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'pagoda',          fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.6,.35)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'stadium',         fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*3 + G(f.hollowness,.72,.2)*3 + G(f.topBotRatio,1,.22)*2 },
    { name: 'cabin',           fn: f => G(f.aspectRatio,1.1,.28)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'arch',            fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*3 + G(f.hollowness,.65,.2)*3 + G(f.avgCurvature,.25,.12)*2 },
    { name: 'fence',           fn: f => GT(f.aspectRatio,2.5)*3 + G(f.topBotRatio,1,.18)*2 + f.vSym*2 + G(f.coverage,.35,.15)*2 },
    { name: 'gate',            fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*3 + G(f.hollowness,.75,.18)*3 + G(f.topBotRatio,1,.2)*2 },
    { name: 'stairs',          fn: f => G(f.aspectRatio,1,.28)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*3 + G(f.coverage,.55,.18)*2 },
    { name: 'column',          fn: f => LT(f.aspectRatio,.45)*4 + f.vSym*3 + G(f.coverage,.5,.18)*2 + G(f.topBotRatio,1,.18)*2 },
    { name: 'tower',           fn: f => LT(f.aspectRatio,.5)*4 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'wall',            fn: f => GT(f.aspectRatio,2)*3 + f.vSym*2 + G(f.topBotRatio,1,.18)*2 + G(f.coverage,.75,.18)*3 },

    // ── More Body & People ───────────────────────────────────────────────────────
    { name: 'running man',     fn: f => LT(f.aspectRatio,.85)*2 + (f.vSym<0.62?2:0) + GT(f.strokeCount,4)*2 + G(f.coverage,.28,.12)*2 },
    { name: 'dancer',          fn: f => LT(f.aspectRatio,.85)*2 + (f.vSym<0.62?2:0) + GT(f.strokeCount,4)*2 + G(f.avgCurvature,.35,.15)*3 },
    { name: 'wizard hat',      fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.topBotRatio,.38,.18)*4 + G(f.coverage,.3,.12)*2 },
    { name: 'mask',            fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*3 + G(f.coverage,.42,.15)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'lips',            fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*3 + G(f.topBotRatio,1,.2)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'nose',            fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,.7,.22)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'ear',             fn: f => LT(f.aspectRatio,.75)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.22,.1)*3 + G(f.hollowness,.5,.2)*2 },
    { name: 'brain',           fn: f => G(f.aspectRatio,1.2,.3)*2 + f.vSym*2 + G(f.avgCurvature,.25,.12)*3 + G(f.coverage,.52,.18)*2 },
    { name: 'tooth',           fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'bone',            fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*2 + G(f.coverage,.3,.12)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'arm',             fn: f => LT(f.aspectRatio,.6)*3 + (f.vSym<0.65?2:0) + G(f.coverage,.28,.12)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'tongue',          fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.topBotRatio,.65,.22)*2 + G(f.avgCurvature,.18,.09)*3 },

    // ── More Nature ──────────────────────────────────────────────────────────────
    { name: 'coral',           fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*2 + G(f.topBotRatio,1.5,.4)*2 + G(f.avgCurvature,.42,.18)*3 },
    { name: 'seashell',        fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*2 + G(f.coverage,.42,.15)*2 + G(f.avgCurvature,.28,.14)*3 },
    { name: 'acorn',           fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.2,.28)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'pinecone',        fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.topBotRatio,1.2,.28)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'wheat stalk',     fn: f => LT(f.aspectRatio,.5)*4 + f.vSym*2 + G(f.topBotRatio,1.5,.35)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'bamboo',          fn: f => LT(f.aspectRatio,.5)*4 + f.vSym*3 + G(f.coverage,.35,.15)*2 + GT(f.strokeCount,3)*2 },
    { name: 'rainbow',         fn: f => GT(f.aspectRatio,2)*4 + G(f.topBotRatio,.5,.2)*3 + f.vSym*3 + G(f.avgCurvature,.18,.09)*2 },
    { name: 'tornado',         fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*2 + G(f.avgCurvature,.3,.14)*3 + G(f.topBotRatio,.55,.22)*2 },
    { name: 'crystal',         fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.avgCurvature,.58,.2)*4 + LT(f.strokeCount,2)*2 },
    { name: 'gem stone',       fn: f => G(f.aspectRatio,1.2,.28)*2 + f.vSym*3 + G(f.avgCurvature,.55,.2)*3 + G(f.coverage,.52,.18)*2 },
    { name: 'iceberg',         fn: f => GT(f.aspectRatio,1.3)*2 + G(f.topBotRatio,.5,.2)*3 + f.vSym*2 + G(f.avgCurvature,.42,.18)*2 },
    { name: 'waterfall',       fn: f => LT(f.aspectRatio,.7)*3 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1,.22)*1 + G(f.coverage,.38,.15)*2 },
    { name: 'fern',            fn: f => LT(f.aspectRatio,.7)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.35,.15)*3 },
    { name: 'lotus',           fn: f => G(f.aspectRatio,1.2,.28)*2 + f.vSym*3 + G(f.topBotRatio,1.2,.28)*2 + G(f.avgCurvature,.25,.12)*2 },
    { name: 'sand dune',       fn: f => GT(f.aspectRatio,2)*3 + G(f.topBotRatio,.55,.2)*3 + f.vSym*2 + G(f.avgCurvature,.15,.09)*3 },

    // ── Fantasy & Mythical ───────────────────────────────────────────────────────
    { name: 'dragon',          fn: f => GT(f.aspectRatio,1.2)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.35,.15)*3 + GT(f.strokeCount,5)*3 },
    { name: 'unicorn',         fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*2 + G(f.topBotRatio,.85,.25)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'phoenix',         fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*2 + G(f.avgCurvature,.35,.15)*3 + G(f.coverage,.38,.15)*2 },
    { name: 'mermaid',         fn: f => LT(f.aspectRatio,.7)*2 + f.vSym*2 + G(f.topBotRatio,1.5,.35)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'magic wand',      fn: f => LT(f.aspectRatio,.5)*4 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*2 + LT(f.strokeCount,3)*2 },
    { name: 'crystal ball',    fn: f => G(f.aspectRatio,1,.18)*4 + f.vSym*3 + f.hSym*2 + G(f.coverage,.62,.18)*3 },
    { name: 'potion bottle',   fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'fairy wings',     fn: f => GT(f.aspectRatio,2)*4 + f.vSym*4 + G(f.topBotRatio,1,.2)*1 + G(f.coverage,.25,.12)*2 },
    { name: 'wizard staff',    fn: f => LT(f.aspectRatio,.45)*4 + (f.vSym<0.65?2:0) + G(f.coverage,.22,.1)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'castle tower',    fn: f => LT(f.aspectRatio,.6)*3 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.coverage,.52,.18)*2 },

    // ── Sports & Activities ──────────────────────────────────────────────────────
    { name: 'baseball',        fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*2 + f.hSym*2 + G(f.coverage,.62,.18)*3 + GT(f.strokeCount,3)*2 },
    { name: 'soccer ball',     fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*2 + f.hSym*2 + G(f.coverage,.62,.18)*3 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'volleyball',      fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*2 + G(f.hollowness,.62,.18)*2 + G(f.coverage,.62,.18)*2 },
    { name: 'bowling ball',    fn: f => G(f.aspectRatio,1,.18)*4 + f.vSym*3 + f.hSym*3 + G(f.coverage,.72,.18)*3 },
    { name: 'golf club',       fn: f => LT(f.aspectRatio,.55)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.32,.15)*2 + LT(f.strokeCount,2)*3 },
    { name: 'golf ball',       fn: f => G(f.aspectRatio,1,.18)*4 + f.vSym*3 + f.hSym*3 + G(f.coverage,.72,.18)*3 },
    { name: 'hockey stick',    fn: f => LT(f.aspectRatio,.6)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.38,.15)*3 + LT(f.strokeCount,2)*3 },
    { name: 'ice skate',       fn: f => GT(f.aspectRatio,1.5)*3 + (f.vSym<0.65?2:0) + G(f.topBotRatio,.6,.22)*2 + G(f.avgCurvature,.28,.14)*2 },
    { name: 'dart',            fn: f => LT(f.aspectRatio,.5)*4 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.48,.18)*2 + LT(f.strokeCount,2)*3 },
    { name: 'archery bow',     fn: f => LT(f.aspectRatio,.7)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.25,.12)*3 + LT(f.strokeCount,3)*2 },
    { name: 'boxing glove',    fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.coverage,.62,.18)*3 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'dumbbell',        fn: f => GT(f.aspectRatio,2)*4 + f.vSym*3 + G(f.topBotRatio,1,.18)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'jump rope',       fn: f => GT(f.aspectRatio,1.5)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.22,.1)*3 + LT(f.strokeCount,3)*2 },
    { name: 'medal',           fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'baseball bat',    fn: f => LT(f.aspectRatio,.5)*4 + (f.vSym<0.65?2:0) + G(f.coverage,.38,.15)*2 + G(f.topBotRatio,.5,.2)*2 },
    { name: 'ping pong paddle',fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,.75,.22)*2 + G(f.coverage,.62,.18)*2 },
    { name: 'frisbee',         fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.hollowness,.58,.2)*2 + G(f.avgCurvature,.14,.08)*2 },
    { name: 'surfboard',       fn: f => LT(f.aspectRatio,.5)*4 + f.vSym*3 + G(f.topBotRatio,1,.18)*2 + G(f.coverage,.38,.15)*2 },

    // ── Tech & Gadgets ───────────────────────────────────────────────────────────
    { name: 'laptop',          fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*2 + G(f.coverage,.55,.18)*2 + G(f.topBotRatio,1,.22)*2 },
    { name: 'robot',           fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.avgCurvature,.52,.18)*2 + GT(f.strokeCount,4)*2 },
    { name: 'drone',           fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*3 + f.hSym*2 + G(f.coverage,.28,.12)*2 + GT(f.strokeCount,4)*2 },
    { name: 'speaker',         fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.coverage,.58,.18)*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'keyboard',        fn: f => GT(f.aspectRatio,2)*3 + G(f.coverage,.72,.18)*3 + f.vSym*2 + G(f.topBotRatio,1,.18)*2 },
    { name: 'joystick',        fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.coverage,.48,.18)*2 },
    { name: 'microscope',      fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'computer mouse',  fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.coverage,.52,.18)*2 + G(f.topBotRatio,1.2,.28)*2 },
    { name: 'USB drive',       fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*2 + G(f.coverage,.52,.18)*2 + G(f.avgCurvature,.52,.18)*1 },
    { name: 'tablet',          fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.hollowness,.72,.18)*2 + G(f.topBotRatio,1,.18)*2 },
    { name: 'smartwatch',      fn: f => G(f.aspectRatio,.85,.2)*2 + f.vSym*2 + G(f.hollowness,.62,.18)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'headset',         fn: f => GT(f.aspectRatio,1.4)*2 + G(f.topBotRatio,.6,.22)*3 + f.vSym*3 + G(f.hollowness,.55,.2)*2 },
    { name: 'printer',         fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.coverage,.58,.18)*2 + G(f.avgCurvature,.52,.18)*1 },
    { name: 'game controller', fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*3 + G(f.topBotRatio,.85,.22)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'vr headset',      fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*3 + G(f.coverage,.55,.18)*2 + G(f.avgCurvature,.22,.1)*2 },

    // ── Household Items ──────────────────────────────────────────────────────────
    { name: 'fork',            fn: f => LT(f.aspectRatio,.45)*4 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.22,.1)*2 },
    { name: 'knife',           fn: f => LT(f.aspectRatio,.4)*5 + (f.vSym<0.65?2:0) + G(f.coverage,.2,.1)*2 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'spoon',           fn: f => LT(f.aspectRatio,.45)*4 + f.vSym*3 + G(f.topBotRatio,1.6,.35)*3 + G(f.avgCurvature,.18,.09)*2 },
    { name: 'plate',           fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*3 + f.hSym*2 + G(f.hollowness,.65,.2)*3 + G(f.avgCurvature,.13,.08)*2 },
    { name: 'bowl',            fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*3 + G(f.topBotRatio,.6,.22)*3 + G(f.hollowness,.6,.2)*2 },
    { name: 'vase',            fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.2,.28)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'flower pot',      fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,.7,.22)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'watering can',    fn: f => GT(f.aspectRatio,1.3)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.45,.18)*2 + G(f.avgCurvature,.25,.12)*2 },
    { name: 'scissors',        fn: f => G(f.aspectRatio,.85,.25)*2 + f.vSym*2 + G(f.topBotRatio,.75,.22)*2 + G(f.avgCurvature,.42,.18)*2 },
    { name: 'measuring tape',  fn: f => GT(f.aspectRatio,1.5)*2 + G(f.coverage,.45,.18)*2 + f.vSym*1 + G(f.avgCurvature,.18,.09)*2 },
    { name: 'birdhouse',       fn: f => G(f.aspectRatio,.9,.25)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'piggy bank',      fn: f => G(f.aspectRatio,1.2,.28)*2 + f.vSym*3 + G(f.coverage,.55,.18)*2 + G(f.topBotRatio,1,.22)*2 },
    { name: 'dartboard',       fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*3 + f.hSym*3 + G(f.hollowness,.55,.2)*2 + GT(f.strokeCount,3)*2 },
    { name: 'picture frame',   fn: f => G(f.aspectRatio,1.2,.28)*2 + f.vSym*3 + G(f.hollowness,.78,.15)*3 + G(f.topBotRatio,1,.2)*2 },
    { name: 'trophy shield',   fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.coverage,.55,.18)*2 },

    // ── Weather & Nature Extra ───────────────────────────────────────────────────
    { name: 'hurricane',       fn: f => G(f.aspectRatio,1,.25)*2 + f.vSym*2 + G(f.avgCurvature,.2,.1)*3 + G(f.coverage,.45,.18)*3 },
    { name: 'hailstone',       fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*2 + f.hSym*2 + G(f.coverage,.62,.18)*3 },
    { name: 'thermometer',     fn: f => LT(f.aspectRatio,.4)*5 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'compass rose',    fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.avgCurvature,.6,.22)*3 },
    { name: 'weather vane',    fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*2 + G(f.avgCurvature,.52,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'hot spring',      fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*2 + G(f.avgCurvature,.22,.1)*3 + G(f.coverage,.38,.15)*2 },

    // ── Science & Education ──────────────────────────────────────────────────────
    { name: 'atom',            fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*2 + G(f.hollowness,.55,.2)*2 + GT(f.strokeCount,4)*3 },
    { name: 'DNA strand',      fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*2 + G(f.avgCurvature,.28,.14)*3 + GT(f.strokeCount,3)*2 },
    { name: 'molecule',        fn: f => G(f.aspectRatio,1.2,.3)*2 + f.vSym*1 + GT(f.strokeCount,4)*3 + G(f.coverage,.35,.15)*2 },
    { name: 'test tube',       fn: f => LT(f.aspectRatio,.45)*4 + f.vSym*3 + G(f.topBotRatio,.45,.2)*3 + G(f.coverage,.38,.15)*2 },
    { name: 'beaker',          fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*2 + G(f.topBotRatio,.75,.22)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'pi symbol',       fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*3 + G(f.topBotRatio,.65,.22)*2 + G(f.avgCurvature,.42,.18)*2 },
    { name: 'calculator',      fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.coverage,.72,.18)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'graduation cap',  fn: f => GT(f.aspectRatio,1.5)*3 + f.vSym*2 + G(f.topBotRatio,.65,.22)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'magnifier glass', fn: f => G(f.aspectRatio,.9,.25)*2 + f.vSym*2 + G(f.hollowness,.62,.18)*3 + G(f.topBotRatio,1.3,.3)*2 },

    // ── Map & Miscellaneous ──────────────────────────────────────────────────────
    { name: 'map pin',         fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*3 + G(f.coverage,.42,.15)*2 },
    { name: 'jigsaw piece',    fn: f => G(f.aspectRatio,1,.3)*2 + G(f.avgCurvature,.38,.18)*3 + G(f.coverage,.52,.18)*2 + GT(f.strokeCount,2)*2 },
    { name: 'paper airplane',  fn: f => GT(f.aspectRatio,1.4)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*3 + LT(f.strokeCount,2)*3 },
    { name: 'origami crane',   fn: f => GT(f.aspectRatio,1.3)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.48,.18)*3 + G(f.coverage,.32,.14)*2 },
    { name: 'shield',          fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.25)*2 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'badge',           fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + G(f.coverage,.58,.18)*2 + G(f.avgCurvature,.45,.18)*2 },
    { name: 'ribbon banner',   fn: f => GT(f.aspectRatio,2)*3 + f.vSym*2 + G(f.avgCurvature,.42,.18)*2 + G(f.topBotRatio,1,.22)*1 },
    { name: 'target / bullseye',fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*3 + f.hSym*3 + G(f.hollowness,.55,.2)*3 + GT(f.strokeCount,3)*2 },
    { name: 'road / path',     fn: f => LT(f.aspectRatio,.65)*3 + f.vSym*2 + G(f.avgCurvature,.18,.09)*3 + LT(f.strokeCount,3)*2 },
    { name: 'maze',            fn: f => G(f.aspectRatio,1,.25)*2 + G(f.coverage,.55,.18)*3 + G(f.avgCurvature,.52,.18)*2 + GT(f.strokeCount,6)*2 },
    { name: 'barcode',         fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*2 + G(f.coverage,.55,.18)*3 + GT(f.strokeCount,6)*4 },
    { name: 'network graph',   fn: f => G(f.aspectRatio,1.1,.3)*2 + G(f.coverage,.28,.12)*2 + GT(f.strokeCount,5)*3 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'cube 3D',         fn: f => G(f.aspectRatio,1,.2)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*3 + G(f.coverage,.48,.18)*2 },
    { name: 'sphere',          fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*2 + f.hSym*1 + G(f.hollowness,.62,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'prism',           fn: f => G(f.aspectRatio,1.1,.25)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.52,.18)*3 + G(f.coverage,.45,.15)*2 },
    { name: 'smoke',           fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*1 + G(f.avgCurvature,.2,.1)*3 + G(f.coverage,.25,.12)*2 },
    { name: 'bubble',          fn: f => G(f.aspectRatio,1,.22)*3 + G(f.hollowness,.72,.18)*4 + f.vSym*2 + f.hSym*2 },
    { name: 'explosion',       fn: f => G(f.aspectRatio,1,.3)*2 + G(f.avgCurvature,.72,.22)*5 + f.vSym*1 + G(f.coverage,.38,.15)*2 },
    { name: 'spotlight',       fn: f => GT(f.aspectRatio,1.2)*2 + f.vSym*3 + G(f.topBotRatio,.45,.2)*4 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'ribbon',          fn: f => GT(f.aspectRatio,2)*3 + f.vSym*2 + G(f.avgCurvature,.28,.14)*2 + G(f.topBotRatio,1,.2)*1 },
    { name: 'ticket',          fn: f => GT(f.aspectRatio,2)*3 + f.vSym*2 + G(f.coverage,.62,.18)*2 + G(f.hollowness,.72,.18)*2 },
    { name: 'tag label',       fn: f => G(f.aspectRatio,1.3,.28)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.55,.18)*2 + G(f.hollowness,.62,.18)*2 },
    { name: 'bookmark',        fn: f => LT(f.aspectRatio,.55)*3 + f.vSym*3 + G(f.topBotRatio,.52,.22)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'sticker',         fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*2 + f.hSym*1 + G(f.coverage,.62,.18)*3 },
    { name: 'rubber duck',     fn: f => G(f.aspectRatio,1,.28)*2 + f.vSym*3 + G(f.topBotRatio,1.1,.28)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'teddy bear',      fn: f => G(f.aspectRatio,.95,.25)*2 + f.vSym*3 + G(f.coverage,.52,.18)*2 + GT(f.strokeCount,3)*2 },
    { name: 'balloon',         fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'kite tail',       fn: f => LT(f.aspectRatio,.6)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.28,.14)*3 + LT(f.strokeCount,2)*2 },
    { name: 'paper bag',       fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.coverage,.62,.18)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'scroll',          fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*2 + G(f.coverage,.55,.18)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'diploma',         fn: f => GT(f.aspectRatio,1.4)*2 + f.vSym*2 + G(f.coverage,.62,.18)*2 + G(f.avgCurvature,.35,.15)*2 },
    { name: 'puzzle box',      fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + G(f.coverage,.72,.18)*3 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'crown jewel',     fn: f => G(f.aspectRatio,1,.28)*2 + f.vSym*3 + G(f.avgCurvature,.48,.18)*2 + G(f.coverage,.45,.15)*2 },
    { name: 'olympic rings',   fn: f => GT(f.aspectRatio,2.5)*3 + f.vSym*2 + G(f.hollowness,.68,.2)*4 + GT(f.strokeCount,5)*3 },
    { name: 'yin yang split',  fn: f => G(f.aspectRatio,1,.18)*3 + G(f.coverage,.55,.18)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.15,.08)*2 },
    { name: 'infinity loop',   fn: f => GT(f.aspectRatio,2)*4 + G(f.hollowness,.62,.2)*3 + f.vSym*3 + G(f.avgCurvature,.15,.08)*2 },
    { name: 'number 0',        fn: f => G(f.aspectRatio,.75,.2)*2 + f.vSym*3 + G(f.hollowness,.72,.18)*4 + G(f.avgCurvature,.13,.08)*2 },
    { name: 'number 8',        fn: f => LT(f.aspectRatio,.75)*3 + f.vSym*3 + G(f.hollowness,.65,.2)*4 + LT(f.strokeCount,2)*3 },
    { name: 'letter A',        fn: f => G(f.aspectRatio,.85,.22)*2 + f.vSym*3 + G(f.topBotRatio,.55,.2)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'letter B',        fn: f => LT(f.aspectRatio,.75)*3 + (f.vSym<0.65?2:0) + G(f.hollowness,.65,.2)*2 + G(f.topBotRatio,1,.22)*2 },
    { name: 'letter S',        fn: f => LT(f.aspectRatio,.75)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.22,.1)*3 + LT(f.strokeCount,2)*3 },
    { name: 'letter T',        fn: f => GT(f.aspectRatio,1.8)*2 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'letter X',        fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*3 + G(f.avgCurvature,.55,.2)*3 },
    { name: 'number 1',        fn: f => LT(f.aspectRatio,.4)*5 + f.vSym*3 + G(f.coverage,.32,.15)*2 + LT(f.strokeCount,3)*2 },
    { name: 'number 7',        fn: f => LT(f.aspectRatio,.85)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.45,.18)*2 + LT(f.strokeCount,2)*3 },
    { name: 'ampersand',       fn: f => LT(f.aspectRatio,.9)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.25,.12)*3 + G(f.coverage,.42,.15)*2 },
    { name: 'hashtag',         fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*2 + f.hSym*2 + GT(f.strokeCount,4)*4 + G(f.coverage,.38,.15)*2 },
    { name: 'asterisk',        fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*3 + f.hSym*2 + GT(f.strokeCount,5)*4 + G(f.coverage,.22,.1)*2 },

    // ── Additional Shapes to reach 500 ──────────────────────────────────────────
    { name: 'hammer and nail', fn: f => G(f.aspectRatio,1,.3)*2 + (f.vSym<0.65?2:0) + GT(f.strokeCount,3)*3 + G(f.coverage,.32,.14)*2 },
    { name: 'padlock closed',  fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.hollowness,.62,.2)*2 + G(f.coverage,.55,.18)*2 },
    { name: 'envelope open',   fn: f => GT(f.aspectRatio,1.3)*2 + f.vSym*2 + G(f.topBotRatio,1.2,.28)*2 + G(f.avgCurvature,.42,.18)*2 },
    { name: 'signpost',        fn: f => LT(f.aspectRatio,.85)*2 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'cog wheel',       fn: f => G(f.aspectRatio,1,.2)*3 + f.vSym*2 + G(f.avgCurvature,.6,.22)*4 + G(f.hollowness,.58,.2)*2 },
    { name: 'chain link',      fn: f => GT(f.aspectRatio,1.5)*2 + f.vSym*2 + G(f.hollowness,.65,.2)*3 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'fishing rod',     fn: f => LT(f.aspectRatio,.6)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.25,.12)*2 + LT(f.strokeCount,3)*2 },
    { name: 'globe',           fn: f => G(f.aspectRatio,1,.18)*3 + f.vSym*2 + G(f.hollowness,.62,.18)*2 + GT(f.strokeCount,3)*3 },
    { name: 'compass needle',  fn: f => G(f.aspectRatio,1,.25)*3 + f.vSym*4 + G(f.avgCurvature,.52,.18)*2 + LT(f.strokeCount,2)*3 },
    { name: 'funnel',          fn: f => f.vSym*3 + G(f.topBotRatio,.45,.2)*4 + G(f.avgCurvature,.48,.18)*2 + G(f.coverage,.42,.15)*2 },
    { name: 'hose',            fn: f => GT(f.aspectRatio,1.8)*2 + G(f.avgCurvature,.22,.1)*3 + LT(f.strokeCount,3)*3 + G(f.coverage,.18,.09)*2 },
    { name: 'spotlight beam',  fn: f => LT(f.aspectRatio,.85)*2 + f.vSym*3 + G(f.topBotRatio,.42,.2)*4 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'clock tower',     fn: f => LT(f.aspectRatio,.6)*3 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.coverage,.52,.18)*2 },
    { name: 'snow globe',      fn: f => G(f.aspectRatio,.9,.22)*2 + f.vSym*3 + G(f.topBotRatio,.75,.22)*2 + G(f.hollowness,.58,.2)*2 },
    { name: 'top hat',         fn: f => G(f.aspectRatio,1.1,.28)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*3 + G(f.coverage,.52,.18)*2 },
    { name: 'bow and arrow',   fn: f => GT(f.aspectRatio,1.5)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.22,.1)*3 + GT(f.strokeCount,2)*2 },
    { name: 'anchor chain',    fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.avgCurvature,.35,.15)*2 + GT(f.strokeCount,3)*2 },
    { name: 'boomerang',       fn: f => GT(f.aspectRatio,1.3)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.3,.14)*3 + LT(f.strokeCount,2)*3 },
    { name: 'pinwheel',        fn: f => G(f.aspectRatio,1,.2)*3 + G(f.avgCurvature,.5,.2)*4 + G(f.coverage,.28,.12)*2 + GT(f.strokeCount,3)*2 },
    { name: 'paper clip',      fn: f => LT(f.aspectRatio,.7)*3 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.25,.12)*3 + LT(f.strokeCount,2)*3 },
    { name: 'pushpin',         fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*3 + G(f.avgCurvature,.48,.18)*2 },
    { name: 'crayon',          fn: f => LT(f.aspectRatio,.5)*4 + f.vSym*2 + G(f.topBotRatio,.42,.2)*3 + G(f.coverage,.38,.15)*2 },
    { name: 'paintroller',     fn: f => LT(f.aspectRatio,.75)*2 + (f.vSym<0.65?2:0) + G(f.coverage,.42,.15)*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'megaphone',       fn: f => GT(f.aspectRatio,1.5)*3 + (f.vSym<0.65?2:0) + G(f.topBotRatio,1,.22)*1 + G(f.avgCurvature,.32,.15)*2 },
    { name: 'binoculars',      fn: f => GT(f.aspectRatio,1.8)*3 + f.vSym*3 + G(f.topBotRatio,.8,.22)*2 + G(f.hollowness,.62,.18)*2 },
    { name: 'trophy star',     fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.55,.2)*3 },
    { name: 'horseshoe',       fn: f => G(f.aspectRatio,1,.22)*2 + f.vSym*3 + G(f.topBotRatio,.6,.22)*3 + G(f.hollowness,.65,.2)*3 },
    { name: 'clover',          fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + G(f.coverage,.48,.18)*2 + G(f.avgCurvature,.25,.12)*2 },
    { name: 'maple leaf',      fn: f => G(f.aspectRatio,.9,.22)*2 + f.vSym*3 + G(f.avgCurvature,.52,.2)*4 + G(f.coverage,.42,.15)*2 },
    { name: 'oak leaf',        fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*3 + G(f.avgCurvature,.35,.15)*3 + G(f.coverage,.45,.15)*2 },
    { name: 'paw print',       fn: f => G(f.aspectRatio,1,.28)*2 + f.vSym*2 + G(f.coverage,.38,.15)*2 + GT(f.strokeCount,4)*3 },
    { name: 'claw mark',       fn: f => GT(f.aspectRatio,1.2)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.38,.15)*3 + GT(f.strokeCount,3)*3 },
    { name: 'eye of horus',    fn: f => GT(f.aspectRatio,1.6)*3 + f.vSym*2 + G(f.avgCurvature,.28,.14)*2 + G(f.coverage,.38,.15)*2 },
    { name: 'trident',         fn: f => LT(f.aspectRatio,.7)*3 + f.vSym*3 + G(f.topBotRatio,1.5,.35)*2 + G(f.coverage,.32,.14)*2 },
    { name: 'ankh',            fn: f => LT(f.aspectRatio,.8)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.hollowness,.55,.2)*2 },
    { name: 'Om symbol',       fn: f => LT(f.aspectRatio,.9)*2 + (f.vSym<0.65?2:0) + G(f.avgCurvature,.25,.12)*3 + G(f.coverage,.45,.15)*2 },
    { name: 'fleur de lis',    fn: f => LT(f.aspectRatio,.75)*2 + f.vSym*3 + G(f.topBotRatio,1.4,.3)*2 + G(f.avgCurvature,.38,.15)*2 },
    { name: 'trefoil',         fn: f => G(f.aspectRatio,1,.22)*3 + f.vSym*3 + G(f.coverage,.48,.18)*2 + G(f.avgCurvature,.22,.1)*2 },
    { name: 'sunflower',       fn: f => G(f.aspectRatio,1,.22)*2 + f.vSym*2 + G(f.avgCurvature,.45,.18)*4 + G(f.coverage,.42,.15)*2 },
    { name: 'dandelion',       fn: f => G(f.aspectRatio,1,.28)*2 + f.vSym*2 + GT(f.strokeCount,6)*4 + G(f.coverage,.22,.1)*2 },
    { name: 'pine tree',       fn: f => LT(f.aspectRatio,.8)*3 + f.vSym*3 + G(f.topBotRatio,1.6,.35)*2 + G(f.avgCurvature,.52,.18)*2 },
    { name: 'bonsai tree',     fn: f => LT(f.aspectRatio,.9)*2 + f.vSym*2 + G(f.topBotRatio,1.3,.3)*2 + G(f.avgCurvature,.28,.14)*2 },
  ];

  return shapes.map(s => ({ name: s.name, score: s.fn(f) }))
    .sort((a, b) => b.score - a.score);
}

function smartPredict() {
  const f = extractFeatures();
  if (!f) { clearPredictions(); return; }

  const ranked = scoreShapes(f);
  const top = ranked.slice(0, 5);

  // Normalise scores into 0-100% confidence
  const maxScore = top[0].score;
  const minScore = ranked[ranked.length - 1].score;
  const range = Math.max(1, maxScore - minScore);

  const results = top.map(s => ({
    label: s.name,
    confidence: Math.max(0.08, (s.score - minScore) / range)
  }));

  displayPredictions(results);
}

// Display Predictions
function displayPredictions(results) {
  if (!results || results.length === 0) {
    smartPredict();
    return;
  }

  const validResults = results.filter(r => (r.confidence || 0) > 0.05).slice(0, 5);
  if (validResults.length === 0) { smartPredict(); return; }

  const topGuess = validResults[0];
  const pct = Math.round((topGuess.confidence || 0) * 100);
  document.getElementById('topGuess').textContent =
    (topGuess.label || topGuess.className || 'Unknown').toUpperCase();
  document.getElementById('topConfidence').textContent =
    `${pct}% confident`;

  const list = document.getElementById('predictionsList');
  list.innerHTML = '';

  validResults.forEach((result, idx) => {
    const item = document.createElement('div');
    item.className = 'ppt-prediction-item';
    const confidence = Math.round((result.confidence || 0) * 100);
    item.innerHTML = `
      <div class="ppt-prediction-item-label">${(result.label || result.className || `Guess ${idx+1}`).toUpperCase()}</div>
      <div class="ppt-prediction-item-bar">
        <div class="ppt-prediction-item-fill" style="width:${confidence}%"></div>
      </div>
      <div class="ppt-prediction-item-pct">${confidence}%</div>
    `;
    list.appendChild(item);
  });
}

// Legacy: kept for AI model error fallback
function showFunPrediction() { smartPredict(); }

// Update Status Message
function updatePredictionStatus(message, type = 'info') {
  const status = document.getElementById('predictionStatus');
  status.textContent = message;
  status.className = `prediction-status ${type}`;
}

// Clear Predictions
function clearPredictions() {
  document.getElementById('topGuess').textContent = '—';
  document.getElementById('topConfidence').textContent = '—';
  document.getElementById('predictionsList').innerHTML = '<div class="ppt-prediction-empty">Start drawing!</div>';
}

// Submit Drawing
function submitSoloDrawing() {
  if (drawingData.length < 5) {
    alert('Please draw something first!');
    return;
  }
  
  predictSoloDrawing();
  
  // Show celebration
  showCelebration('🎉 Drawing submitted! Check the prediction above!');
}

// New Drawing
function newSoloDrawing() {
  clearAllCanvas();
}

// Celebration Animation
function showCelebration(message) {
  const celebration = document.createElement('div');
  celebration.className = 'celebration-message';
  celebration.textContent = message;
  document.body.appendChild(celebration);
  
  setTimeout(() => celebration.remove(), 3000);
}

// Responsive Canvas Resize — save pixels, resize directly (no RAF race condition)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const oldDataURL = soloCanvas.toDataURL();
    const prevW = soloCanvas.width;
    const prevH = soloCanvas.height;

    // Resize without RAF so it happens synchronously before any drawing
    applySizeToCanvas();

    // Then restore the saved drawing on top
    const img = new Image();
    img.onload = () => {
      soloCtx.drawImage(img, 0, 0, prevW, prevH, 0, 0, soloCanvas.width, soloCanvas.height);
    };
    img.src = oldDataURL;
  }, 250);
});
