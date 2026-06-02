const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const contentPath = path.join(__dirname, "..", "content", "content.js");

function createClassList(element) {
  return {
    toggle(className, force) {
      if (force) {
        element.className = `${element.className} ${className}`.trim();
      } else {
        element.className = element.className
          .split(/\s+/)
          .filter((name) => name && name !== className)
          .join(" ");
      }
    }
  };
}

function createContextRecorder() {
  const calls = [];
  return {
    calls,
    save() {
      calls.push(["save"]);
    },
    restore() {
      calls.push(["restore"]);
    },
    beginPath() {
      calls.push(["beginPath"]);
    },
    moveTo(x, y) {
      calls.push(["moveTo", x, y]);
    },
    lineTo(x, y) {
      calls.push(["lineTo", x, y]);
    },
    stroke() {
      calls.push(["stroke"]);
    },
    clearRect(x, y, width, height) {
      calls.push(["clearRect", x, y, width, height]);
    },
    drawImage(...args) {
      calls.push(["drawImage", ...args]);
    },
    setTransform(...args) {
      calls.push(["setTransform", ...args]);
    }
  };
}

function createElement(tagName, document) {
  const listeners = {};
  const element = {
    tagName: tagName.toUpperCase(),
    id: "",
    className: "",
    style: {},
    children: [],
    listeners,
    parentNode: null,
    width: 0,
    height: 0,
    classList: null,
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    remove() {
      if (!element.parentNode) {
        return;
      }

      element.parentNode.children = element.parentNode.children.filter((child) => child !== element);
      element.parentNode = null;
    },
    setPointerCapture(pointerId) {
      element.capturedPointerId = pointerId;
    },
    hasPointerCapture(pointerId) {
      return element.capturedPointerId === pointerId;
    },
    releasePointerCapture(pointerId) {
      if (element.capturedPointerId === pointerId) {
        element.capturedPointerId = undefined;
      }
    }
  };

  element.classList = createClassList(element);

  if (tagName === "canvas") {
    element.context = createContextRecorder();
    element.getContext = (type) => (type === "2d" ? element.context : null);
    document.canvases.push(element);
  }

  return element;
}

function createFakeDom({ documentWidth = 1600, documentHeight = 1400, innerWidth = 800, innerHeight = 600 } = {}) {
  const document = {
    canvases: [],
    body: {
      scrollWidth: documentWidth,
      scrollHeight: documentHeight,
      clientWidth: innerWidth,
      clientHeight: innerHeight
    },
    documentElement: {
      scrollWidth: documentWidth,
      scrollHeight: documentHeight,
      clientWidth: innerWidth,
      clientHeight: innerHeight,
      children: [],
      appendChild(child) {
        child.parentNode = document.documentElement;
        document.documentElement.children.push(child);
        return child;
      }
    },
    createElement(tagName) {
      return createElement(tagName, document);
    }
  };

  return document;
}

function createContentHarness(options = {}) {
  const listeners = [];
  const document = createFakeDom(options);
  const windowListeners = {};
  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      }
    },
    document,
    window: {
      innerWidth: options.innerWidth || 800,
      innerHeight: options.innerHeight || 600,
      scrollX: options.scrollX || 0,
      scrollY: options.scrollY || 0,
      devicePixelRatio: options.devicePixelRatio || 1,
      addEventListener(type, listener) {
        windowListeners[type] = listener;
      }
    }
  });

  return {
    context,
    document,
    listeners,
    windowListeners,
    runContent() {
      const source = fs.readFileSync(contentPath, "utf8");
      vm.runInContext(source, context);
    },
    send(message) {
      let response;
      listeners.at(-1)(message, {}, (value) => {
        response = value;
      });
      return response;
    },
    get overlay() {
      return document.documentElement.children.find((child) => child.id === "websketch-overlay");
    },
    get canvas() {
      return document.canvases[0];
    }
  };
}

function createPointerEvent(init) {
  return {
    pointerId: 1,
    clientX: init.clientX,
    clientY: init.clientY,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

test("executing content script twice only registers one runtime message listener", () => {
  const harness = createContentHarness();

  harness.runContent();
  harness.runContent();

  assert.equal(harness.listeners.length, 1);
});

test("pointer drawing uses page coordinates including scroll offsets", () => {
  const harness = createContentHarness({ scrollX: 100, scrollY: 200 });

  harness.runContent();
  harness.send({ source: "websketch-popup", type: "set-enabled", enabled: true });

  harness.overlay.listeners.pointerdown(createPointerEvent({ clientX: 10, clientY: 20 }));
  harness.overlay.listeners.pointermove(createPointerEvent({ clientX: 30, clientY: 40 }));

  const calls = harness.canvas.context.calls;
  assert.deepEqual(
    calls.filter(([name]) => name === "moveTo" || name === "lineTo"),
    [
      ["moveTo", 110, 220],
      ["lineTo", 110, 220],
      ["moveTo", 110, 220],
      ["lineTo", 130, 240]
    ]
  );
});

test("clear clears the full document-sized drawing area", () => {
  const harness = createContentHarness({
    documentWidth: 1800,
    documentHeight: 2400,
    innerWidth: 800,
    innerHeight: 600
  });

  harness.runContent();
  harness.send({ source: "websketch-popup", type: "clear" });

  assert.deepEqual(
    harness.canvas.context.calls.filter(([name]) => name === "clearRect"),
    [["clearRect", 0, 0, 1800, 2400]]
  );
});
