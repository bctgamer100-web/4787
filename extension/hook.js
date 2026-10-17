// รันใน MAIN world (ทุกเฟรม): จับ request ค้นหาของหน้า BigSeller เฉพาะตอนอยู่ใน learn mode
// คุยกับ content.js ผ่าน window.postMessage
(() => {
  let target = '';
  const TAG = 'sku-bridge';
  const top_ = window.top;

  function relay(msg) { try { top_.postMessage(Object.assign({ tag: TAG }, msg), '*'); } catch {} }

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.tag !== TAG || d.type !== 'learn') return;
    target = d.target || '';
    // ส่งต่อให้ iframe ลูก เพราะ BigSeller อาจยิง request จากเฟรมอื่น
    for (let i = 0; i < window.frames.length; i++) { try { window.frames[i].postMessage(d, '*'); } catch {} }
  });

  function variants() { return [target, encodeURIComponent(target)]; }

  function report(method, url, body, text) {
    if (!target) return;
    const b = typeof body === 'string' ? body : '';
    const hay = String(url) + ' ' + b;
    const hit = variants().find(v => hay.includes(v));
    relay({ type: 'seen', url: String(url).slice(0, 120), hit: !!hit });
    if (!hit || !/^\s*[\[{]/.test(text || '')) return;
    relay({
      type: 'learned',
      tpl: {
        method: String(method || 'GET').toUpperCase(),
        url: String(url).split(hit).join('__TRACKING__'),
        body: b ? b.split(hit).join('__TRACKING__') : null,
        encoded: hit !== target
      }
    });
    target = '';
  }

  const of = window.fetch;
  window.fetch = function (input, init) {
    const p = of.apply(this, arguments);
    if (target) {
      try {
        const url = typeof input === 'string' ? input : input.url;
        const method = (init && init.method) || (input && input.method) || 'GET';
        const body = init && init.body;
        p.then(r => r.clone().text().then(t => report(method, url, body, t))).catch(() => {});
      } catch {}
    }
    return p;
  };

  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__sb = { m, u }; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (target && this.__sb) {
      this.addEventListener('load', () => { try { report(this.__sb.m, this.__sb.u, body, this.responseText); } catch {} });
    }
    return xs.apply(this, arguments);
  };
})();
