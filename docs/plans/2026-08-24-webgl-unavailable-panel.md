# Proposal: WebGL-unavailable fallback panel

**Status:** proposed, not implemented. Working-tree changes were reverted on
2026-08-24 at the operator's request; this document is the whole record.

## Problem

When the GPU path is unavailable the lab renders a black rectangle and says
nothing. That is indistinguishable from a sim regression, and it costs a full
debugging session to tell the two apart — on 2026-08-23 it cost exactly that.

Three failure sites, all silent:

- `webglRenderer.ts` gates `orbit3d` on `getExtension("EXT_color_buffer_float")`
  and sets `this.orbit3d = null` when it is missing. Nothing draws.
- `orbit3d.ts` `draw()` returns `false` when the RGBA16F accumulation FBO cannot
  be created. Nothing draws.
- Safari can return a context object that is **already lost** — `isContextLost()`
  is true on arrival and every call returns null. `createWebGLRendererBackend`
  only checked that `getContext("webgl2")` returned something truthy, so it
  accepted that context and built a backend on top of it.

The third one is the real hazard: it is browser-side (a wedged WebKit GPU
process, cleared by restarting the browser) but presents as a lab bug.

## Proposed change

Ask the backend whether it can draw the sim's render mode, and if it cannot,
say so on the stage instead of leaving a black canvas.

1. `rendererBackend.ts` — add an optional capability query to the
   `RendererBackend` contract:
   `unsupportedReason?(mode: RenderMode): string | null`. Asking the backend
   avoids creating a second GL context just to probe.
2. `canvasRenderer.ts` — the Canvas2D fallback has no `orbit3d` path at all, so
   it returns a reason for that mode and null otherwise.
3. `webglRenderer.ts` — return a reason for `orbit3d` when `this.orbit3d` is
   null (the missing-extension case); and harden `createWebGLRendererBackend`
   to reject a born-lost context and to catch a constructor throw, so both
   degrade to Canvas2D rather than building on a dead context or crashing.
4. `renderer.ts` — compute `readonly unsupportedReason` once at construction so
   callers never re-probe.
5. **Not yet written:** `simView.ts` builds the notice element and appends it to
   `layout.stage` when `renderer.unsupportedReason` is non-null — heading
   "WebGL unavailable", body = the reason, `role="status"`. `new Renderer({...})`
   is at ~line 526; the stage is built at ~lines 1338-1352 and is already
   `position: relative`, so an absolutely-positioned card drops straight in.
6. **Not yet written:** `.sim-view__unsupported` in `styles.css`, using the
   existing `--bg-elev` / `--border` / `--fg-dim` tokens and matching the
   `.sim-view__legend` overlay treatment (line ~518).

## Remaining work after step 5-6

- `npx tsc --noEmit`, lint, `npm run verify`.
- `npm run publish:site` to re-vendor the artifacts into promo-flow.
- Run promo-flow's `tests/e2e/labs.spec.ts` — the sealed-artifact contract test,
  mandatory after every republish.
- Atomic commits in both repos on `dev`; author via `agent-whoami`; push
  verdict from `git-push-check`.

## The reverted patch

Steps 1-4 were written and are reproduced here verbatim. `git apply` this to
resume.

```diff
diff --git a/src/app/canvasRenderer.ts b/src/app/canvasRenderer.ts
index bc8d415..79330f5 100644
--- a/src/app/canvasRenderer.ts
+++ b/src/app/canvasRenderer.ts
@@ -15,6 +15,12 @@ import type { SimKernel } from "./types.ts";
 export class CanvasRendererBackend implements RendererBackend {
   readonly kind = "canvas2d" as const;
 
+  unsupportedReason(mode: RenderMode): string | null {
+    return mode === "orbit3d"
+      ? "This simulation draws its attractor as a 3D point cloud on the GPU and has no 2D fallback."
+      : null;
+  }
+
   private readonly ctx: CanvasRenderingContext2D;
   private readonly buffer: HTMLCanvasElement;
   private readonly bufferCtx: CanvasRenderingContext2D;
diff --git a/src/app/renderer.ts b/src/app/renderer.ts
index 3aec46d..4caee0f 100644
--- a/src/app/renderer.ts
+++ b/src/app/renderer.ts
@@ -119,6 +119,13 @@ export class Renderer {
   private orbitAutoRotateHold = 0;
   private readonly orbitAutoRotateEnabled: boolean;
 
+  /**
+   * Why the chosen backend cannot draw this sim's render mode, or null when it
+   * can. Non-null means every frame would be blank, so the view says so rather
+   * than leaving a black canvas that reads as a bug in the sim.
+   */
+  readonly unsupportedReason: string | null;
+
   private resizeObserver: ResizeObserver | null = null;
   private resizeFrame = 0;
 
@@ -143,6 +150,8 @@ export class Renderer {
 
     this.backend =
       createWebGLRendererBackend(this.canvas) ?? new CanvasRendererBackend(this.canvas);
+    this.unsupportedReason =
+      this.backend.unsupportedReason?.(this.renderMode) ?? null;
     this.canvas.dataset.renderer = this.backend.kind;
     console.info(
       `emergence-lab renderer: ${this.backend.kind}`,
diff --git a/src/app/rendererBackend.ts b/src/app/rendererBackend.ts
index 2e2fea3..0d870eb 100644
--- a/src/app/rendererBackend.ts
+++ b/src/app/rendererBackend.ts
@@ -45,6 +45,12 @@ export interface Orbit3DMarkerSnapshot {
 export interface RendererBackend {
   readonly kind: "webgl2" | "canvas2d";
   readonly maxTextureSize?: number;
+  /**
+   * Why this backend cannot draw `mode` at all, or null when it can. A backend
+   * that returns a reason renders nothing, so the sim view shows the reason in
+   * place of a canvas that would otherwise stay black with no explanation.
+   */
+  unsupportedReason?(mode: RenderMode): string | null;
   /** True when this backend can render the current model without a CPU field. */
   supportsDirectRendering?(
     mode: RenderMode,
diff --git a/src/app/webglRenderer.ts b/src/app/webglRenderer.ts
index fbdc66e..41f2be9 100644
--- a/src/app/webglRenderer.ts
+++ b/src/app/webglRenderer.ts
@@ -1401,6 +1401,11 @@ export class WebGLRendererBackend implements RendererBackend {
     return this.kuramoto?.applyImpulse(x, y, radius, strength) ?? false;
   }
 
+  unsupportedReason(mode: RenderMode): string | null {
+    if (mode !== "orbit3d" || this.orbit3d) return null;
+    return "This simulation needs floating-point render targets (the WebGL2 EXT_color_buffer_float extension), which this browser did not provide.";
+  }
+
   orbit3dMarker(): Orbit3DMarkerSnapshot | null {
     const marker = this.orbit3d?.markerReadout;
     const projected = this.orbit3d?.projectMarker(this.displayWidth, this.displayHeight);
@@ -2589,15 +2594,37 @@ export class WebGLRendererBackend implements RendererBackend {
   }
 }
 
+/**
+ * A browser can hand back a context object that is already lost — Safari does
+ * exactly this once its GPU process is exhausted — and every call on it then
+ * returns null. Probing for the object alone therefore passes on a machine
+ * where nothing can be drawn, so ask the context whether it is alive.
+ */
+function webgl2ContextUsable(gl: WebGL2RenderingContext): boolean {
+  return !gl.isContextLost() && gl.getSupportedExtensions() !== null;
+}
+
 export function createWebGLRendererBackend(
   canvas: HTMLCanvasElement,
 ): WebGLRendererBackend | null {
   const probe = document.createElement("canvas");
-  if (!probe.getContext("webgl2")) {
+  const probeContext = probe.getContext("webgl2");
+  if (!probeContext) {
     console.warn("WebGL2 renderer unavailable; falling back to Canvas 2D.");
     return null;
   }
-  return new WebGLRendererBackend(canvas);
+  if (!webgl2ContextUsable(probeContext)) {
+    console.warn(
+      "WebGL2 context is lost on creation; falling back to Canvas 2D. Restarting the browser usually clears this.",
+    );
+    return null;
+  }
+  try {
+    return new WebGLRendererBackend(canvas);
+  } catch (error) {
+    console.warn("WebGL2 renderer setup failed; falling back to Canvas 2D.", error);
+    return null;
+  }
 }
 
 function textureFormatFor(
```
