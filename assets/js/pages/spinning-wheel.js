import { bootShell } from "../bootstrap.js";
import { showToast } from "../utils.js";

await bootShell("tools");

const DEFAULT_OPTIONS = [
  "Kelompok 1",
  "Kelompok 2",
  "Kelompok 3",
  "Kelompok 4",
  "Kelompok 5",
  "Kelompok 6",
];
const STORAGE_KEY = "clouven-spinning-wheel-options";
const COLORS = ["#e16f59", "#315d49", "#e7b75c", "#657b9b", "#cf8a72", "#729069", "#a9778c", "#4e8791"];

const canvas = document.querySelector("#wheelCanvas");
const context = canvas.getContext("2d");
const textarea = document.querySelector("#wheelOptions");
const applyButton = document.querySelector("#applyOptions");
const resetButton = document.querySelector("#resetOptions");
const spinButton = document.querySelector("#spinButton");
const optionCount = document.querySelector("#optionCount");
const editorCount = document.querySelector("#editorCount");
const optionPreview = document.querySelector("#optionPreview");
const result = document.querySelector("#wheelResult");
const removeWinner = document.querySelector("#removeWinner");

let options = loadOptions();
let rotation = 0;
let spinning = false;

function loadOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length >= 2) return saved.slice(0, 24).map(String);
  } catch {}
  return [...DEFAULT_OPTIONS];
}

function parseOptions(value = textarea.value) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean);
}

function saveOptions() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)); } catch {}
}

function randomInt(max) {
  if (!Number.isInteger(max) || max < 1) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

function fitLabel(label, max = 18) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function drawWheel() {
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 14;
  const arc = (Math.PI * 2) / options.length;
  context.clearRect(0, 0, size, size);

  options.forEach((label, index) => {
    const start = -Math.PI / 2 + index * arc;
    const end = start + arc;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();
    context.fillStyle = COLORS[index % COLORS.length];
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = "#fffaf2";
    context.stroke();

    context.save();
    context.translate(center, center);
    context.rotate(start + arc / 2);
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillStyle = "#fffdf8";
    context.shadowColor = "rgba(0, 0, 0, .25)";
    context.shadowBlur = 3;
    const fontSize = options.length > 16 ? 20 : options.length > 10 ? 24 : 29;
    context.font = `700 ${fontSize}px "DM Sans", sans-serif`;
    context.fillText(fitLabel(label, options.length > 14 ? 12 : 18), radius - 34, 0, radius * .62);
    context.restore();
  });

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.lineWidth = 12;
  context.strokeStyle = "#fffaf2";
  context.stroke();
}

function renderPreview() {
  optionCount.textContent = String(options.length);
  optionPreview.replaceChildren();
  options.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item;
    optionPreview.append(row);
  });
}

function updateEditorCount() {
  const count = parseOptions().length;
  editorCount.textContent = `${count}/24`;
  editorCount.classList.toggle("is-over", count > 24);
}

function renderResult(title, value, winner = false) {
  result.classList.toggle("is-winner", winner);
  result.innerHTML = `
    <span class="wheel-result-icon" aria-hidden="true"><i class="ti ti-${winner ? "confetti" : "sparkles"}"></i></span>
    <div><span>${title}</span><strong></strong></div>`;
  result.querySelector("strong").textContent = value;
}

function applyOptions(nextOptions = parseOptions()) {
  if (spinning) return;
  if (nextOptions.length < 2) {
    showToast("Masukkan minimal 2 pilihan untuk membuat roda.");
    textarea.focus();
    return;
  }
  if (nextOptions.length > 24) {
    showToast("Roda dapat memuat maksimal 24 pilihan.");
    textarea.focus();
    return;
  }
  options = nextOptions;
  textarea.value = options.join("\n");
  rotation = 0;
  canvas.style.transitionDuration = "0ms";
  canvas.style.transform = "rotate(0deg)";
  drawWheel();
  renderPreview();
  updateEditorCount();
  saveOptions();
  renderResult("Roda berhasil diperbarui", `${options.length} pilihan siap diputar`);
}

function removeSelected(index) {
  if (!removeWinner.checked || options.length <= 2) return;
  options.splice(index, 1);
  textarea.value = options.join("\n");
  saveOptions();
  window.setTimeout(() => {
    rotation = 0;
    canvas.style.transitionDuration = "0ms";
    canvas.style.transform = "rotate(0deg)";
    drawWheel();
    renderPreview();
    updateEditorCount();
  }, 350);
}

function spin() {
  if (spinning || options.length < 2) return;
  spinning = true;
  spinButton.disabled = true;
  textarea.disabled = true;
  applyButton.disabled = true;
  resetButton.disabled = true;
  result.classList.remove("is-winner");
  renderResult("Roda sedang berputar…", "Semoga pilihan terbaik yang keluar");

  const winnerIndex = randomInt(options.length);
  const segment = 360 / options.length;
  const target = -(winnerIndex + .5) * segment;
  const currentNormalized = ((rotation % 360) + 360) % 360;
  const targetNormalized = ((target % 360) + 360) % 360;
  const extraSpins = 6 + randomInt(4);
  rotation += extraSpins * 360 + ((targetNormalized - currentNormalized + 360) % 360);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 20 : 4600;
  canvas.style.transitionDuration = `${duration}ms`;
  requestAnimationFrame(() => { canvas.style.transform = `rotate(${rotation}deg)`; });

  window.setTimeout(() => {
    const winner = options[winnerIndex];
    renderResult("Pilihan terpilih", winner, true);
    spinning = false;
    spinButton.disabled = false;
    textarea.disabled = false;
    applyButton.disabled = false;
    resetButton.disabled = false;
    removeSelected(winnerIndex);
  }, duration + 80);
}

textarea.value = options.join("\n");
drawWheel();
renderPreview();
updateEditorCount();

textarea.addEventListener("input", updateEditorCount);
applyButton.addEventListener("click", () => applyOptions());
spinButton.addEventListener("click", spin);
resetButton.addEventListener("click", () => {
  textarea.value = DEFAULT_OPTIONS.join("\n");
  applyOptions([...DEFAULT_OPTIONS]);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && document.activeElement === document.body) {
    event.preventDefault();
    spin();
  }
});
