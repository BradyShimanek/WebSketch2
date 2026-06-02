const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const popupPath = path.join(__dirname, "..", "popup", "popup.js");

function createElement() {
  return {
    disabled: false,
    value: "",
    textContent: "",
    addEventListener() {},
    setAttribute() {},
    classList: {
      toggle() {}
    }
  };
}

function loadPopup(chrome) {
  const source = fs.readFileSync(popupPath, "utf8");
  const context = vm.createContext({
    chrome,
    document: {
      addEventListener() {},
      getElementById() {
        return createElement();
      }
    }
  });

  vm.runInContext(`${source}\nglobalThis.WebSketchPopup = { sendCommand };`, context);
  return context.WebSketchPopup;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("sendCommand retries after injecting CSS and JS when the first message rejects", async () => {
  const calls = [];
  const expectedState = { enabled: true, tool: "pen" };
  const chrome = {
    tabs: {
      async query(queryInfo) {
        calls.push(["query", queryInfo]);
        return [{ id: 42 }];
      },
      async sendMessage(tabId, message) {
        calls.push(["sendMessage", tabId, message]);

        if (calls.filter(([name]) => name === "sendMessage").length === 1) {
          throw new Error("Receiving end does not exist");
        }

        return { ok: true, state: expectedState };
      }
    },
    scripting: {
      async insertCSS(details) {
        calls.push(["insertCSS", details]);
      },
      async executeScript(details) {
        calls.push(["executeScript", details]);
      }
    }
  };

  const popup = loadPopup(chrome);
  const state = await popup.sendCommand({ type: "get-state" });

  assert.deepEqual(state, expectedState);
  assert.deepEqual(plain(calls), [
    ["query", { active: true, currentWindow: true }],
    ["sendMessage", 42, { source: "websketch-popup", type: "get-state" }],
    ["insertCSS", { target: { tabId: 42 }, files: ["content/content.css"] }],
    ["executeScript", { target: { tabId: 42 }, files: ["content/content.js"] }],
    ["sendMessage", 42, { source: "websketch-popup", type: "get-state" }]
  ]);
});

test("sendCommand rejects with an error when both message send and injection fail", async () => {
  const calls = [];
  const chrome = {
    tabs: {
      async query() {
        return [{ id: 7 }];
      },
      async sendMessage(tabId, message) {
        calls.push(["sendMessage", tabId, message]);
        throw new Error("Receiving end does not exist");
      }
    },
    scripting: {
      async insertCSS(details) {
        calls.push(["insertCSS", details]);
        throw new Error("Cannot access this page");
      },
      async executeScript(details) {
        calls.push(["executeScript", details]);
      }
    }
  };

  const popup = loadPopup(chrome);

  await assert.rejects(
    () => popup.sendCommand({ type: "get-state" }),
    /Cannot access this page/
  );
  assert.deepEqual(plain(calls), [
    ["sendMessage", 7, { source: "websketch-popup", type: "get-state" }],
    ["insertCSS", { target: { tabId: 7 }, files: ["content/content.css"] }]
  ]);
});
