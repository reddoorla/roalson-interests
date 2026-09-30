const state = {
  bar: false,
  busy: false,
  start: performance.now(),
  frames: 0,
  last: performance.now(),
};

function toggle(id) {
  const button = document.getElementById(id);
  state[id] = !state[id];
  button.setAttribute("aria-pressed", String(state[id]));
}

function tick(now) {
  if (state.bar) {
    const progress = ((now - state.start) % 8000) / 8000;
    document.getElementById("fill").style.transform = `scaleX(${progress})`;
  }
  if (state.busy) {
    const until = performance.now() + 12;
    while (performance.now() < until);
  }
  state.frames += 1;
  if (now - state.last >= 1000) {
    document.getElementById("fps").textContent = `main thread: ${state.frames} fps`;
    state.frames = 0;
    state.last = now;
  }
  requestAnimationFrame(tick);
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("bar").addEventListener("click", () => toggle("bar"));
  document.getElementById("busy").addEventListener("click", () => toggle("busy"));
  requestAnimationFrame(tick);
});
