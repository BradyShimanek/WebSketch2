# WebSketch V2 Minimal Drawing Overlay Design

## Context

WebSketch V2 is an early Chrome extension scaffold for drawing on webpages. The current repository has a Manifest V3 configuration, a popup shell, and empty popup/content scripts. The first usable version should stay focused on a minimal drawing overlay rather than persistence, export, or presentation tools.

## Goals

- Provide a compact popup toolbar for controlling drawing.
- Let users draw on the current webpage with a pen, eraser, color, and size.
- Support a pan/page mode so users can interact with the webpage without removing the overlay.
- Clear the current drawing session on demand.
- Keep drawings session-only for V1; refresh or navigation clears them.

## Non-Goals

- Persisting drawings across refreshes or visits.
- Exporting screenshots or saved annotations.
- Undo/redo history.
- Floating in-page toolbar controls.
- Spotlight, highlighter, or presentation-specific tools.

## Architecture

The extension uses a content-script-owned overlay with popup messaging.

The content script owns page behavior. It injects and manages a fixed canvas overlay, stores active drawing state, handles pointer events, and switches between drawing and pan/page interaction. The popup acts as a compact remote control. It sends commands to the active tab and reflects local button state, but it is not the source of truth for drawing behavior.

This structure fits Chrome extension lifecycles because the popup can close at any time without losing the page overlay state.

## Components

### Manifest

Use a standard `manifest.json` file name so Chrome can load the extension without special handling. The manifest should define the popup, icon, content script, and minimal required permissions. `activeTab` is required for interacting with the active page. Add `scripting` only if implementation uses programmatic injection rather than static content scripts.

### Popup

`popup/popup.html`, `popup/popup.css`, and `popup/popup.js` define a compact toolbar UI:

- Draw on/off toggle.
- Pen and eraser controls.
- Pan/page mode toggle.
- Color input.
- Size control.
- Clear button.

Controls should be icon-first with accessible names or tooltips. The popup sends messages to the active tab and shows a disabled or error state when the current page cannot be controlled.

### Content Script

`content/content.js` manages:

- Overlay creation.
- Canvas sizing and positioning.
- Drawing state.
- Pointer event handling.
- Pen and eraser rendering.
- Pan/page mode behavior.
- Clear behavior.
- Message responses back to the popup.

`content/content.css` holds overlay-specific styles so injected UI is isolated from page CSS as much as possible.

## Data Flow

1. The user clicks a popup control.
2. `popup.js` sends a message to the active tab.
3. `content.js` receives the message and ensures the overlay exists.
4. `content.js` updates internal state or performs the requested action.
5. `content.js` returns a success or failure response.
6. `popup.js` updates visible control state or displays an error state.

## Behavior

In draw mode, the overlay captures pointer events. This prevents accidental clicks on page content while drawing.

In pan/page mode, the overlay remains visible but does not intercept page interaction. Users can scroll, click, and use the page normally. Switching back to draw mode resumes drawing on the same session canvas.

The pen draws smooth strokes using the selected color and size. The eraser removes strokes using canvas compositing. Clear wipes the current canvas.

Resize behavior should keep the overlay aligned to the viewport. Preserving drawings perfectly through every resize or page layout change is not required for V1.

## Error Handling

Restricted pages such as `chrome://` may reject popup-to-content-script messaging. The popup should show a small disabled or error state instead of failing silently.

If overlay creation or command handling fails in the content script, the content script should return a failure response. The popup should use that response to keep controls honest.

## Testing

Manual verification is sufficient for this first extension version:

- Load the unpacked extension in Chrome.
- Confirm the popup opens and controls are visible.
- Draw on a normal webpage.
- Change color and size.
- Switch between pen and eraser.
- Clear the canvas.
- Switch to pan/page mode and verify scrolling and page clicks work.
- Switch back to draw mode and verify drawing resumes.
- Refresh the page and verify drawings are cleared.
- Open a restricted page and verify the popup handles the unavailable state.

## Open Decisions

No open product decisions remain for V1. Implementation may still choose exact icons, control layout spacing, and message names as long as they support the approved behavior.
