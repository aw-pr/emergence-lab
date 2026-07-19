import "katex/dist/katex.min.css";
import { mountLab } from "./mount.ts";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element in index.html.");
}

// Standalone bootstrap: default chrome (mode and asset base derive from the
// build's BASE_URL and iframe detection), hash-routed for the app's lifetime.
mountLab(root);
