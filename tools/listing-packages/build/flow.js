(function () {
  function flow(srcSel, kind, tailSel) {
    const src = document.querySelector(srcSel);
    const shells = [...document.querySelectorAll(`section[data-flow="${kind}"]`)];
    if (!src) { shells.forEach((s) => s.remove()); return; }
    const items = [...src.children];
    let i = 0;
    let body = shells[0].querySelector('.flow');
    const over = (b) => b.scrollHeight > b.clientHeight + 1;
    const place = (it) => {
      body.appendChild(it);
      if (over(body) && body.children.length > 1) {
        i += 1;
        body = shells[i].querySelector('.flow');
        body.appendChild(it);
      }
    };
    items.forEach(place);
    if (tailSel) {
      const tail = document.querySelector(tailSel);
      if (tail) place(tail.firstElementChild);
      if (i > 0 && body.children.length === 1) {
        const prev = shells[i - 1].querySelector('.flow');
        const last = prev.lastElementChild;
        if (last) body.insertBefore(last, body.firstChild);
      }
    }
    shells.slice(i + 1).forEach((s) => s.remove());
    src.remove();
  }
  flow('#spec-src', 'spec', '#contact-src');
  flow('#demo-src', 'demo');
  const cs = document.querySelector('#contact-src'); if (cs) cs.remove();
  const pages = [...document.querySelectorAll('section.page')];
  const total = pages.length + 1;
  pages.forEach((p, n) => p.querySelectorAll('.pg, .pgc').forEach((el) => { el.textContent = `${n + 1} of ${total}`; }));
  window.__overlays = [...document.querySelectorAll('[data-overlay]')].map((el) => {
    const r = el.getBoundingClientRect();
    const page = pages.indexOf(el.closest('section.page'));
    const pr = pages[page].getBoundingClientRect();
    return { key: el.dataset.overlay, page, x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height };
  });
  window.__overflow = [...document.querySelectorAll('.flow')].filter((b) => b.scrollHeight > b.clientHeight + 1).length;
  window.__pages = pages.length;
  window.__ready = true;
})();
