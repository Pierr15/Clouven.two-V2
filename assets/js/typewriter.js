import { titleSettings } from "./title-settings.js";

// Every phrase occupies the same grid cell to reserve the tallest heading's space.
export function createTypewriter(element) {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("id", { granularity: "grapheme" }) : null;
  const split = text => segmenter ? [...segmenter.segment(text)].map(part => part.segment) : Array.from(text);
  let signature = "", phrases = [], lines = [], index = 0, count = 0, phase = "typing";
  let enabled = true, destroyed = false, timer = null, due = 0, remaining = 0, pending = null, caret = null;
  const animated = () => enabled && !motion.matches && !destroyed;
  function cancel() { clearTimeout(timer); timer = null; pending = null; }
  function schedule(callback, delay) {
    clearTimeout(timer);
    pending = callback; remaining = delay;
    if (document.hidden) return;
    due = performance.now() + delay;
    timer = setTimeout(() => { timer = null; pending = null; callback(); }, delay);
  }
  function paint() {
    lines.forEach((line, lineIndex) => line.characters.forEach((char, charIndex) => {
      char.style.visibility = lineIndex === index && charIndex < count ? "visible" : "hidden";
    }));
    caret?.removeAttribute("data-caret"); caret = null;
    const characters = lines[index]?.characters || [];
    if (animated() && characters.length) {
      caret = characters[Math.max(0, count - 1)];
      caret.dataset.caret = count ? "end" : "start";
    }
    element.dataset.typewriterPhase = phase;
    element.dataset.typewriterIndex = String(index);
    element.setAttribute("aria-label", phrases[index]?.filter(Boolean).join(" ") || "");
  }
  function tick() {
    const total = lines[index].characters.length;
    if (phase === "typing") {
      count++;
      if (count >= total) {
        count = total; phase = "idle"; paint();
        schedule(() => { phase = "deleting"; tick(); }, 5000);
      } else { paint(); schedule(tick, 75); }
    } else if (phase === "deleting") {
      count--;
      if (count <= 0) {
        count = 0; phase = "empty"; paint();
        schedule(() => { index = (index + 1) % lines.length; phase = "typing"; tick(); }, 350);
      } else { paint(); schedule(tick, 40); }
    }
  }
  function restart() {
    cancel();
    index = 0;
    element.replaceChildren();
    const displayed = animated() ? phrases : phrases.slice(0, 1);
    lines = displayed.map(parts => {
      const layer = document.createElement("span"), characters = [];
      layer.className = "typewriter-line";
      layer.setAttribute("aria-hidden", "true");
      parts.forEach((part, i) => {
        const run = document.createElement(i ? "em" : "span");
        const text = (i && parts[0] && part ? " " : "") + part;
        split(text).forEach(grapheme => {
          const char = document.createElement("span");
          char.className = "typewriter-char"; char.textContent = grapheme;
          run.append(char); characters.push(char);
        });
        layer.append(run);
      });
      element.append(layer);
      return { layer, characters };
    });
    count = animated() ? 0 : lines[0]?.characters.length || 0;
    phase = animated() ? "typing" : "static"; paint();
    if (animated() && lines[0]?.characters.length) schedule(tick, 75);
  }
  function setText(headline = "", emphasis = "", settings = {}) {
    if (destroyed) return;
    const options = titleSettings(settings);
    const base = [String(headline).trim(), String(emphasis).trim()];
    const next = JSON.stringify([base, options]);
    if (next === signature) return;
    signature = next;
    enabled = options.enabled;
    phrases = [base, ...options.phrases.map(p => [p.headline, p.emphasis])];
    // Retain a static empty heading if the entire configuration is blank.
    phrases = phrases.filter(p => p.some(Boolean));
    if (!phrases.length) phrases = [["", ""]];
    element.classList.add("typewriter-title");
    restart();
  }
  function visibilityChanged() {
    if (document.hidden) {
      if (timer !== null) { remaining = Math.max(0, due - performance.now()); clearTimeout(timer); timer = null; }
    } else if (pending) schedule(pending, remaining);
  }
  motion.addEventListener("change", restart);
  document.addEventListener("visibilitychange", visibilityChanged);
  return {
    setText,
    destroy() {
      destroyed = true; cancel();
      motion.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", visibilityChanged);
      if (phrases.length) restart();
    },
  };
}
