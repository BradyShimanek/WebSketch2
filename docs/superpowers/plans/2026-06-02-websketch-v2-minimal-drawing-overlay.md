# WebSketch V2 Minimal Drawing Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Chrome MV3 version of WebSketch V2: a compact popup that controls a session-only drawing overlay on webpages.

**Architecture:** The content script owns the canvas overlay, drawing state, pointer handling, and pan/page mode. The popup is a compact remote control that sends messages to the active tab and shows an unavailable state when the page cannot be controlled.

**Tech Stack:** Chrome Manifest V3, vanilla HTML/CSS/JavaScript, Canvas 2D API, Chrome extension messaging.

---

## File Structure

- Rename: `manifest.JSON` -> `manifest.json`
  - Responsibility: Chrome extension metadata, popup entry, static content script registration, icon, and minimal permissions.
- Create: `content/content.css`
  - Responsibility: styles for the injected canvas overlay only.
- Modify: `content/content.js`
  - Responsibility: overlay lifecycle, canvas drawing, erasing, clear, draw/pan mode, resize handling, and popup message responses.
- Modify: `popup/popup.html`
  - Responsibility: compact toolbar markup and accessible controls.
- Modify: `popup/popup.css`
  - Responsibility: popup layout, compact controls, active/disabled/error states.
- Modify: `popup/popup.js`
  - Responsibility: query active tab, send toolbar commands, reflect returned state, and handle restricted-page failures.

## Task 1: Manifest And Content CSS

**Files:**
- Rename: `manifest.JSON` -> `manifest.json`
- Create: `content/content.css`

- [ ] **Step 1: Rename the manifest file**

Run:

```bash
mv manifest.JSON manifest.json
```

Expected: `manifest.JSON` no longer exists and `manifest.json` exists.

- [ ] **Step 2: Replace `manifest.json` with valid MV3 config**

Write this complete file:

```json
{
  "manifest_version": 3,
  "name": "WebSketch2",
  "description": "Draw on webpages with a simple session-only overlay.",
  "version": "1.0",
  "permissions": ["activeTab"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/pencil2.png",
      "48": "icons/pencil2.png",
      "128": "icons/pencil2.png"
    }
  },
  "icons": {
    "16": "icons/pencil2.png",
    "48": "icons/pencil2.png",
    "128": "icons/pencil2.png"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"],
      "css": ["content/content.css"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 3: Create `content/content.css`**

Write this complete file:

```css
#websketch-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: auto;
  touch-action: none;
}

#websketch-overlay.websketch-pan-mode {
  pointer-events: none;
}

#websketch-overlay canvas {
  display: block;
  width: 100vw;
  height: 100vh;
}

#websketch-overlay.websketch-hidden {
  display: none;
}
```

- [ ] **Step 4: Verify manifest shape**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

Expected:

```text
manifest ok
```

- [ ] **Step 5: Commit**

Run:

```bash
git add manifest.json content/content.css
git add -u manifest.JSON
git commit -m "chore: prepare extension manifest and overlay styles"
```

Expected: Commit succeeds with the manifest rename and new content CSS.

## Task 2: Content Script Overlay Engine

**Files:**
- Modify: `content/content.js`

- [ ] **Step 1: Replace `content/content.js` with the overlay engine**

Write this complete file:

```javascript
(function () {
  const OVERLAY_ID = "websketch-overlay";

  const state = {
    enabled: false,
    mode: "draw",
    tool: "pen",
    color: "#ef4444",
    size: 6,
    overlay: null,
    canvas: null,
    context: null,
    drawing: false,
    lastPoint: null
  };

  function ensureOverlay() {
    if (state.overlay && state.canvas && state.context) {
      return true;
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "websketch-hidden";

    const canvas = document.createElement("canvas");
    overlay.appendChild(canvas);
    document.documentElement.appendChild(overlay);

    state.overlay = overlay;
    state.canvas = canvas;
    state.context = canvas.getContext("2d");

    if (!state.context) {
      overlay.remove();
      state.overlay = null;
      state.canvas = null;
      return false;
    }

    resizeCanvas();
    overlay.addEventListener("pointerdown", handlePointerDown);
    overlay.addEventListener("pointermove", handlePointerMove);
    overlay.addEventListener("pointerup", finishStroke);
    overlay.addEventListener("pointercancel", finishStroke);
    window.addEventListener("resize", resizeCanvas);
    applyOverlayState();

    return true;
  }

  function resizeCanvas() {
    if (!state.canvas || !state.context) {
      return;
    }

    const snapshot = document.createElement("canvas");
    snapshot.width = state.canvas.width;
    snapshot.height = state.canvas.height;
    const snapshotContext = snapshot.getContext("2d");

    if (snapshotContext && state.canvas.width && state.canvas.height) {
      snapshotContext.drawImage(state.canvas, 0, 0);
    }

    const ratio = window.devicePixelRatio || 1;
    state.canvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
    state.canvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
    state.canvas.style.width = `${window.innerWidth}px`;
    state.canvas.style.height = `${window.innerHeight}px`;

    state.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.context.lineCap = "round";
    state.context.lineJoin = "round";

    if (snapshotContext && snapshot.width && snapshot.height) {
      state.context.drawImage(
        snapshot,
        0,
        0,
        snapshot.width,
        snapshot.height,
        0,
        0,
        window.innerWidth,
        window.innerHeight
      );
    }
  }

  function applyOverlayState() {
    if (!state.overlay) {
      return;
    }

    state.overlay.classList.toggle("websketch-hidden", !state.enabled);
    state.overlay.classList.toggle("websketch-pan-mode", state.mode === "pan");
  }

  function getPoint(event) {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }

  function drawSegment(from, to) {
    if (!state.context) {
      return;
    }

    state.context.save();
    state.context.lineWidth = state.size;

    if (state.tool === "eraser") {
      state.context.globalCompositeOperation = "destination-out";
      state.context.strokeStyle = "rgba(0, 0, 0, 1)";
    } else {
      state.context.globalCompositeOperation = "source-over";
      state.context.strokeStyle = state.color;
    }

    state.context.beginPath();
    state.context.moveTo(from.x, from.y);
    state.context.lineTo(to.x, to.y);
    state.context.stroke();
    state.context.restore();
  }

  function handlePointerDown(event) {
    if (!state.enabled || state.mode === "pan") {
      return;
    }

    event.preventDefault();
    state.overlay.setPointerCapture(event.pointerId);
    state.drawing = true;
    state.lastPoint = getPoint(event);
    drawSegment(state.lastPoint, state.lastPoint);
  }

  function handlePointerMove(event) {
    if (!state.drawing || !state.lastPoint) {
      return;
    }

    event.preventDefault();
    const point = getPoint(event);
    drawSegment(state.lastPoint, point);
    state.lastPoint = point;
  }

  function finishStroke(event) {
    if (!state.drawing) {
      return;
    }

    event.preventDefault();
    state.drawing = false;
    state.lastPoint = null;

    if (state.overlay.hasPointerCapture(event.pointerId)) {
      state.overlay.releasePointerCapture(event.pointerId);
    }
  }

  function clearCanvas() {
    if (!state.context) {
      return;
    }

    state.context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function getPublicState() {
    return {
      enabled: state.enabled,
      mode: state.mode,
      tool: state.tool,
      color: state.color,
      size: state.size
    };
  }

  function handleCommand(message) {
    if (!message || message.source !== "websketch-popup") {
      return { ok: false, error: "Unknown message source" };
    }

    if (!ensureOverlay()) {
      return { ok: false, error: "Could not create drawing overlay" };
    }

    switch (message.type) {
      case "get-state":
        break;
      case "set-enabled":
        state.enabled = Boolean(message.enabled);
        break;
      case "set-mode":
        state.mode = message.mode === "pan" ? "pan" : "draw";
        state.enabled = true;
        break;
      case "set-tool":
        state.tool = message.tool === "eraser" ? "eraser" : "pen";
        state.enabled = true;
        break;
      case "set-color":
        if (typeof message.color === "string" && /^#[0-9a-fA-F]{6}$/.test(message.color)) {
          state.color = message.color;
        }
        state.enabled = true;
        break;
      case "set-size":
        state.size = Math.min(48, Math.max(1, Number(message.size) || state.size));
        state.enabled = true;
        break;
      case "clear":
        clearCanvas();
        break;
      default:
        return { ok: false, error: `Unsupported command: ${message.type}` };
    }

    applyOverlayState();
    return { ok: true, state: getPublicState() };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    sendResponse(handleCommand(message));
    return false;
  });
})();
```

- [ ] **Step 2: Syntax-check the content script**

Run:

```bash
node --check content/content.js
```

Expected: No output and exit code `0`.

- [ ] **Step 3: Commit**

Run:

```bash
git add content/content.js
git commit -m "feat: add content script drawing overlay"
```

Expected: Commit succeeds with only `content/content.js` changed.

## Task 3: Compact Popup UI And Messaging

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.css`
- Modify: `popup/popup.js`

- [ ] **Step 1: Replace `popup/popup.html`**

Write this complete file:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>WebSketch2</title>
    <link rel="stylesheet" href="popup.css">
  </head>
  <body>
    <main class="toolbar" aria-label="WebSketch controls">
      <div class="row">
        <button id="toggleDraw" class="tool-button" type="button" title="Toggle drawing" aria-pressed="false">Draw</button>
        <button id="penTool" class="tool-button" type="button" title="Pen" aria-pressed="true">Pen</button>
        <button id="eraserTool" class="tool-button" type="button" title="Eraser" aria-pressed="false">Erase</button>
        <button id="panMode" class="tool-button" type="button" title="Pan/page mode" aria-pressed="false">Pan</button>
        <button id="clearCanvas" class="tool-button danger" type="button" title="Clear drawing">Clear</button>
      </div>

      <div class="row controls">
        <label class="color-control" title="Pen color">
          <span class="sr-only">Pen color</span>
          <input id="colorInput" type="color" value="#ef4444">
        </label>
        <label class="size-control">
          <span>Size</span>
          <input id="sizeInput" type="range" min="1" max="48" value="6">
          <output id="sizeOutput" for="sizeInput">6</output>
        </label>
      </div>

      <p id="status" class="status" role="status">Ready</p>
    </main>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `popup/popup.css`**

Write this complete file:

```css
:root {
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
  color: #172033;
  background: #f7f8fb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
}

.toolbar {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.controls {
  justify-content: space-between;
}

.tool-button {
  min-width: 44px;
  height: 34px;
  border: 1px solid #c8cfdb;
  border-radius: 6px;
  background: #ffffff;
  color: #172033;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.tool-button:hover:not(:disabled) {
  background: #eef3ff;
}

.tool-button[aria-pressed="true"] {
  border-color: #315fce;
  background: #315fce;
  color: #ffffff;
}

.tool-button.danger {
  color: #b42318;
}

.tool-button.danger:hover:not(:disabled) {
  background: #fff1f0;
}

.tool-button:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.color-control input {
  width: 38px;
  height: 34px;
  padding: 2px;
  border: 1px solid #c8cfdb;
  border-radius: 6px;
  background: #ffffff;
}

.size-control {
  display: grid;
  grid-template-columns: auto 120px 24px;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
}

.size-control input {
  accent-color: #315fce;
}

.status {
  min-height: 16px;
  margin: 0;
  color: #5c667a;
  font-size: 12px;
}

.status.error {
  color: #b42318;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 3: Replace `popup/popup.js`**

Write this complete file:

```javascript
const controls = {
  toggleDraw: document.getElementById("toggleDraw"),
  penTool: document.getElementById("penTool"),
  eraserTool: document.getElementById("eraserTool"),
  panMode: document.getElementById("panMode"),
  clearCanvas: document.getElementById("clearCanvas"),
  colorInput: document.getElementById("colorInput"),
  sizeInput: document.getElementById("sizeInput"),
  sizeOutput: document.getElementById("sizeOutput"),
  status: document.getElementById("status")
};

let activeState = {
  enabled: false,
  mode: "draw",
  tool: "pen",
  color: "#ef4444",
  size: 6
};

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendCommand(command) {
  const tab = await getActiveTab();

  if (!tab || !tab.id) {
    throw new Error("No active tab found");
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    source: "websketch-popup",
    ...command
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "This page cannot be controlled");
  }

  return response.state;
}

function setDisabled(disabled) {
  [
    controls.toggleDraw,
    controls.penTool,
    controls.eraserTool,
    controls.panMode,
    controls.clearCanvas,
    controls.colorInput,
    controls.sizeInput
  ].forEach((control) => {
    control.disabled = disabled;
  });
}

function setStatus(message, isError = false) {
  controls.status.textContent = message;
  controls.status.classList.toggle("error", isError);
}

function renderState(state) {
  activeState = { ...activeState, ...state };

  controls.toggleDraw.setAttribute("aria-pressed", String(activeState.enabled));
  controls.penTool.setAttribute("aria-pressed", String(activeState.tool === "pen"));
  controls.eraserTool.setAttribute("aria-pressed", String(activeState.tool === "eraser"));
  controls.panMode.setAttribute("aria-pressed", String(activeState.mode === "pan"));
  controls.colorInput.value = activeState.color;
  controls.sizeInput.value = String(activeState.size);
  controls.sizeOutput.value = String(activeState.size);

  setStatus(activeState.enabled ? "Drawing available" : "Ready");
}

async function runCommand(command, successMessage) {
  try {
    setDisabled(false);
    const state = await sendCommand(command);
    renderState(state);

    if (successMessage) {
      setStatus(successMessage);
    }
  } catch (error) {
    setDisabled(true);
    setStatus(error.message, true);
  }
}

controls.toggleDraw.addEventListener("click", () => {
  runCommand({ type: "set-enabled", enabled: !activeState.enabled });
});

controls.penTool.addEventListener("click", () => {
  runCommand({ type: "set-tool", tool: "pen" });
});

controls.eraserTool.addEventListener("click", () => {
  runCommand({ type: "set-tool", tool: "eraser" });
});

controls.panMode.addEventListener("click", () => {
  runCommand({ type: "set-mode", mode: activeState.mode === "pan" ? "draw" : "pan" });
});

controls.clearCanvas.addEventListener("click", () => {
  runCommand({ type: "clear" }, "Drawing cleared");
});

controls.colorInput.addEventListener("input", () => {
  runCommand({ type: "set-color", color: controls.colorInput.value });
});

controls.sizeInput.addEventListener("input", () => {
  controls.sizeOutput.value = controls.sizeInput.value;
  runCommand({ type: "set-size", size: Number(controls.sizeInput.value) });
});

document.addEventListener("DOMContentLoaded", () => {
  runCommand({ type: "get-state" });
});
```

- [ ] **Step 4: Syntax-check popup JavaScript**

Run:

```bash
node --check popup/popup.js
```

Expected: No output and exit code `0`.

- [ ] **Step 5: Commit**

Run:

```bash
git add popup/popup.html popup/popup.css popup/popup.js
git commit -m "feat: add compact popup controls"
```

Expected: Commit succeeds with the popup files changed.

## Task 4: Manual Extension Verification

**Files:**
- Read: `manifest.json`
- Read: `popup/popup.html`
- Read: `content/content.js`

- [ ] **Step 1: Confirm repository status before manual testing**

Run:

```bash
git status --short
```

Expected: No output.

- [ ] **Step 2: Load the extension in Chrome**

Manual steps:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `/Users/bradyshimanek/Documents/Programming/WebSketchV2`.

Expected: Chrome loads `WebSketch2` without manifest errors.

- [ ] **Step 3: Verify normal page drawing**

Manual steps:

1. Open `https://example.com`.
2. Open the WebSketch2 popup.
3. Click `Draw`.
4. Drag on the page.
5. Change the color.
6. Change the size.
7. Drag again.

Expected: The page shows strokes with the selected color and size. Page links are not accidentally clicked while drawing.

- [ ] **Step 4: Verify eraser and clear**

Manual steps:

1. Open the popup.
2. Click `Erase`.
3. Drag over existing strokes.
4. Click `Clear`.

Expected: Eraser removes part of the drawing. Clear removes all visible strokes.

- [ ] **Step 5: Verify pan/page mode**

Manual steps:

1. Draw a visible stroke.
2. Open the popup.
3. Click `Pan`.
4. Scroll the page or click page content.
5. Open the popup again.
6. Click `Pan` to return to draw mode.
7. Draw another stroke.

Expected: Pan mode allows normal page interaction while the existing drawing stays visible. Returning to draw mode allows drawing again.

- [ ] **Step 6: Verify session-only behavior**

Manual steps:

1. Draw a visible stroke.
2. Refresh the page.

Expected: The previous drawing is gone after refresh.

- [ ] **Step 7: Verify restricted page handling**

Manual steps:

1. Open `chrome://extensions`.
2. Open the WebSketch2 popup.

Expected: The popup shows an unavailable/error status and disables controls instead of silently failing.

- [ ] **Step 8: Commit verification note if fixes were required**

If manual testing required code fixes, commit those fixes:

```bash
git add manifest.json content/content.css content/content.js popup/popup.html popup/popup.css popup/popup.js
git commit -m "fix: address manual WebSketch verification issues"
```

Expected: Commit succeeds if fixes were made. If no fixes were made, skip this step.

## Self-Review

- Spec coverage: The plan covers compact popup controls, content-script-owned overlay, pen, eraser, color, size, clear, pan/page mode, session-only behavior, restricted-page error handling, and manual testing.
- Placeholder scan: The plan contains no unresolved implementation placeholders.
- Type consistency: Popup command names match content script message handling: `get-state`, `set-enabled`, `set-mode`, `set-tool`, `set-color`, `set-size`, and `clear`.
