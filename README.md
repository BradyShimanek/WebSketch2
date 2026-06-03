# WebSketch V2

Quick reference for the Chrome extension structure.

- **manifest.json** — Lives at the root. This is the config file that tells Chrome everything about this extension: what scripts to load, what permissions you need, where your popup is, etc.

- **popup/** — A folder for everything related to that little toolbar. You'd have `popup.html`, `popup.css`, and `popup.js` in here. Keeps the UI stuff contained.

- **content/** — A folder for your content script. Something like `content.js` and `content.css` if you need styles for your canvas overlay. This is the code that actually gets injected into web pages.

- **icons/** — A folder for your extension icons. Chrome wants them in a few sizes (16, 48, 128 pixels). You can use simple placeholders while developing.

---

## Filling in manifest.json


manifest.json is basically your extension's resume — it tells Chrome what your extension is, what it needs, and where everything lives. Here's what you need to fill in, piece by piece:

- **The basics** — A `manifest_version` (use 3, that's the current standard), a `name`, a `version` like `"1.0"`, and a `description`. Straightforward stuff.

- **The action** — This tells Chrome that clicking your extension icon does something. For you, it opens the popup. Point it at your `popup/popup.html` and specify your icons here.

- **The content scripts** — This is where you tell Chrome "whenever the user is on a webpage, inject these files." Specify which URLs to match (you'll want all of them), then list both `content/content.js` and `content/content.css`. Chrome handles the rest.

- **Permissions** — You just need `activeTab`. That gives your extension access to whatever tab the user is currently on, and nothing more. Keep it minimal.

- **Icons** — Point to the files in your `icons/` folder at the sizes Chrome expects.

That's the whole thing. The Chrome docs for manifest V3 are a solid reference if you want to cross-check anything.
