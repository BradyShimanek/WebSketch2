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

async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/content.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content.js"]
  });
}

async function sendMessageToTab(tabId, command) {
  return chrome.tabs.sendMessage(tabId, {
    source: "websketch-popup",
    ...command
  });
}

async function sendCommand(command) {
  const tab = await getActiveTab();

  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found");
  }

  let response;
  try {
    response = await sendMessageToTab(tab.id, command);
  } catch (error) {
    await injectContentScript(tab.id);
    response = await sendMessageToTab(tab.id, command);
  }

  if (!response || !response.ok) {
    throw new Error(response?.error || "This page cannot be controlled");
  }

  return response.state;
}

if (typeof globalThis !== "undefined") {
  globalThis.WebSketchPopup = { sendCommand };
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

async function selectTool(tool) {
  try {
    setDisabled(false);
    let state = await sendCommand({ type: "set-tool", tool });

    if (state.mode === "pan") {
      state = await sendCommand({ type: "set-mode", mode: "draw" });
    }

    renderState(state);
  } catch (error) {
    setDisabled(true);
    setStatus(error.message, true);
  }
}

controls.toggleDraw.addEventListener("click", () => {
  runCommand({ type: "set-enabled", enabled: !activeState.enabled });
});

controls.penTool.addEventListener("click", () => {
  selectTool("pen");
});

controls.eraserTool.addEventListener("click", () => {
  selectTool("eraser");
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
