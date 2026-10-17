// Brightness calibration reference: a near-black panel with a symbol that should be
// "barely visible". Both are pushed through the same exposure + ACES Filmic (grey axis)
// + sRGB encode as the game, so moving the slider changes the panel like the scene.
import { brightnessScale } from '../render/lighting.js';

export const REF = { panel: 0.0, symbol: 0.008 }; // linear scene values (symbol ~ barely visible at default)
const rrt = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
export function displayValue(lin, exposure) { // -> 0..255 sRGB byte (grey axis of three's ACESFilmic)
  const v = Math.max(0, Math.min(1, rrt(lin * exposure / 0.6)));
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, s)) * 255);
}
export function drawReference(canvas, brightness, exposure = 1) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, e = exposure * brightnessScale(brightness);
  const p = displayValue(REF.panel, e), q = displayValue(REF.symbol, e);
  g.fillStyle = `rgb(${p},${p},${p})`; g.fillRect(0, 0, w, h);
  g.fillStyle = `rgb(${q},${q},${q})`; // ember-sigil stand-in: a ring + bar
  g.beginPath(); g.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2); g.lineWidth = h * 0.09; g.strokeStyle = g.fillStyle; g.stroke();
  g.fillRect(w / 2 - h * 0.045, h * 0.12, h * 0.09, h * 0.76);
  return { panel: p, symbol: q };
}
