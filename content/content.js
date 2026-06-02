(function () {
  if (globalThis.__webSketchContentLoaded) {
    return;
  }

  globalThis.__webSketchContentLoaded = true;

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
      resizeCanvas();
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

    const documentSize = getDocumentSize();
    const snapshot = document.createElement("canvas");
    snapshot.width = state.canvas.width;
    snapshot.height = state.canvas.height;
    const snapshotContext = snapshot.getContext("2d");

    if (snapshotContext && state.canvas.width && state.canvas.height) {
      snapshotContext.drawImage(state.canvas, 0, 0);
    }

    const ratio = window.devicePixelRatio || 1;
    state.canvas.width = Math.max(1, Math.floor(documentSize.width * ratio));
    state.canvas.height = Math.max(1, Math.floor(documentSize.height * ratio));
    state.canvas.style.width = `${documentSize.width}px`;
    state.canvas.style.height = `${documentSize.height}px`;

    if (state.overlay) {
      state.overlay.style.width = `${documentSize.width}px`;
      state.overlay.style.height = `${documentSize.height}px`;
    }

    state.context.setTransform(1, 0, 0, 1, 0, 0);
    if (snapshotContext && snapshot.width && snapshot.height) {
      state.context.drawImage(snapshot, 0, 0);
    }

    state.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.context.lineCap = "round";
    state.context.lineJoin = "round";
  }

  function getDocumentSize() {
    const body = document.body;
    const element = document.documentElement;

    return {
      width: Math.max(
        element.scrollWidth,
        element.clientWidth,
        body ? body.scrollWidth : 0,
        body ? body.clientWidth : 0,
        window.innerWidth
      ),
      height: Math.max(
        element.scrollHeight,
        element.clientHeight,
        body ? body.scrollHeight : 0,
        body ? body.clientHeight : 0,
        window.innerHeight
      )
    };
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
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY
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
    resizeCanvas();
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

    resizeCanvas();

    const documentSize = getDocumentSize();
    state.context.clearRect(0, 0, documentSize.width, documentSize.height);
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
