// ==UserScript==
// @name         BigSeller → SKU Tracking Analyzer
// @namespace    sku-tracking-analyzer
// @version      0.1.0
// @description  ดึง SKU/จำนวนของออเดอร์ตามเลข Tracking จาก BigSeller (ใช้ session ที่ล็อกอินอยู่) แล้วส่งเข้า SKU Tracking Analyzer
// @match        https://www.bigseller.com/*
// @match        https://*.bigseller.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

/*
 * วิธีใช้
 * 1) เปิด BigSeller (หน้ารายการออเดอร์) ให้ล็อกอินค้างไว้
 * 2) กดปุ่ม "SKU Bridge" มุมขวาล่าง → ใส่ URL ของ SKU Tracking Analyzer
 *    (เช่น file:///C:/Users/.../index.html หรือ URL ที่โฮสต์ไว้)
 * 3) "เรียนรู้คำสั่งค้นหา": ใส่ Tracking ตัวอย่าง 1 เลข กดเริ่มเรียนรู้
 *    แล้วค้นหาเลขเดียวกันในช่องค้นหาของ BigSeller ตามปกติ สคริปต์จะจำ request ที่ใช้ค้นหา
 *    (ไม่ต้องเดา endpoint — ถ้า BigSeller เปลี่ยนระบบหลังบ้าน ก็แค่เรียนรู้ใหม่)
 * 4) วางเลข Tracking ทั้งหมด → กด "ดึงและส่งเข้า Analyzer"
 */
(function () {
  'use strict';

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const KEY_TPL = 'sb_template';
  const KEY_URL = 'sb_analyzer_url';
  const PLACEHOLDER = '__TRACKING__';
  const CONCURRENCY = 3;

  const gv = (k, d) => { try { return GM_getValue(k, d); } catch { return d; } };
  const sv = (k, v) => { try { GM_setValue(k, v); } catch {} };

  // ---------- Learn mode: จับ request ค้นหาของหน้า BigSeller ----------
  let learnTarget = '';
  let onLearned = null;

  function tryLearn(method, url, body, text) {
    if (!learnTarget) return;
    const haystack = String(url) + ' ' + (typeof body === 'string' ? body : '');
    if (!haystack.includes(learnTarget)) return;
    if (!/^\s*[\[{]/.test(text || '')) return; // ต้องเป็น JSON
    const tpl = {
      method: (method || 'GET').toUpperCase(),
      url: String(url).split(learnTarget).join(PLACEHOLDER),
      body: typeof body === 'string' ? body.split(learnTarget).join(PLACEHOLDER) : null,
      contentType: null,
    };
    sv(KEY_TPL, tpl);
    learnTarget = '';
    onLearned && onLearned(tpl);
  }

  const origFetch = W.fetch;
  W.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init && init.method) || (input && input.method) || 'GET';
      const body = init && init.body;
      if (learnTarget) p.then(r => r.clone().text().then(t => tryLearn(method, url, body, t))).catch(() => {});
    } catch {}
    return p;
  };

  const XO = W.XMLHttpRequest.prototype.open, XS = W.XMLHttpRequest.prototype.send;
  W.XMLHttpRequest.prototype.open = function (m, u) { this.__sb = { m, u }; return XO.apply(this, arguments); };
  W.XMLHttpRequest.prototype.send = function (body) {
    if (learnTarget && this.__sb) {
      this.addEventListener('load', () => {
        try { tryLearn(this.__sb.m, this.__sb.u, body, this.responseText); } catch {}
      });
    }
    return XS.apply(this, arguments);
  };

  // ---------- ดึงข้อมูลด้วย template ----------
  async function queryTracking(tpl, tracking) {
    const enc = encodeURIComponent(tracking);
    const url = tpl.url.split(PLACEHOLDER).join(enc);
    const opt = { method: tpl.method, credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } };
    if (tpl.body != null && tpl.method !== 'GET') {
      const isJson = /^\s*[\[{]/.test(tpl.body);
      opt.body = tpl.body.split(PLACEHOLDER).join(isJson ? tracking.replace(/["\\]/g, '\\$&') : enc);
      opt.headers['Content-Type'] = isJson ? 'application/json' : 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    const res = await origFetch.call(W, url, opt);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // หา object ที่มีทั้ง SKU และจำนวน จาก JSON โครงสร้างไม่แน่นอน
  const SKU_KEYS = ['varSku', 'merchantSku', 'skuMerchant', 'sellerSku', 'sku', 'itemSku'];
  const QTY_KEYS = ['quantity', 'qty', 'num', 'count', 'itemNum', 'amount'];
  const TRK_KEYS = ['trackingNo', 'trackingNumber', 'trackNo', 'tracking', 'shippingTrackNo'];
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '' && typeof o[k] !== 'object') return o[k]; };

  function extractRows(json, tracking) {
    const out = [];
    const walk = (node, ctxTrk) => {
      if (Array.isArray(node)) return node.forEach(n => walk(n, ctxTrk));
      if (!node || typeof node !== 'object') return;
      const trk = pick(node, TRK_KEYS) || ctxTrk;
      const sku = pick(node, SKU_KEYS), q = pick(node, QTY_KEYS);
      if (sku != null && q != null) out.push({ sku: String(sku), qty: Number(q) || 0, tracking: String(trk || tracking) });
      for (const k of Object.keys(node)) if (node[k] && typeof node[k] === 'object') walk(node[k], trk);
    };
    walk(json, tracking);
    // ตัดซ้ำที่เกิดจาก walk ซ้อน (object เดียวกันถูกนับ 2 ระดับ)
    const seen = new Set();
    return out.filter(r => { const k = r.tracking + '|' + r.sku + '|' + r.qty; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async function runAll(trackings, log) {
    const tpl = gv(KEY_TPL, null);
    if (!tpl) throw new Error('ยังไม่ได้เรียนรู้คำสั่งค้นหา');
    const rows = [], miss = [];
    let i = 0, done = 0;
    async function worker() {
      while (i < trackings.length) {
        const t = trackings[i++];
        try {
          const r = extractRows(await queryTracking(tpl, t), t);
          if (r.length) rows.push(...r); else miss.push(t);
        } catch (e) { miss.push(t); console.warn('[SKU Bridge]', t, e); }
        log(`ดึงแล้ว ${++done}/${trackings.length}`);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return { rows, miss };
  }

  // ---------- ส่งเข้า Analyzer ----------
  function sendToAnalyzer(url, rows) {
    return new Promise((resolve, reject) => {
      const win = W.open(url, 'sku-tracking-analyzer');
      if (!win) return reject(new Error('เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปให้ BigSeller'));
      const payload = { source: 'bigseller-sku-bridge', type: 'orders', rows, label: 'BigSeller ' + new Date().toLocaleString('th-TH') };
      let tries = 0;
      const onMsg = e => {
        if (e.data && e.data.source === 'sku-tracking-analyzer' && e.data.type === 'ack') { cleanup(); resolve(); }
      };
      const timer = setInterval(() => {
        win.postMessage(payload, '*');
        if (++tries > 40) { cleanup(); reject(new Error('Analyzer ไม่ตอบกลับ — ตรวจ URL')); }
      }, 500);
      function cleanup() { clearInterval(timer); W.removeEventListener('message', onMsg); }
      W.addEventListener('message', onMsg);
    });
  }

  // ---------- UI ----------
  function buildUI() {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px/1.5 system-ui,sans-serif';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box}
        button{cursor:pointer;border:0;border-radius:8px;padding:8px 12px;font:inherit;background:#0284c7;color:#fff}
        button.s{background:#334155}
        #fab{border-radius:99px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
        #p{display:none;width:340px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
        #p.open{display:block}
        label{display:block;margin:8px 0 3px;color:#93c5fd;font-size:12px}
        input,textarea{width:100%;background:#020617;color:#fff;border:1px solid #334155;border-radius:8px;padding:7px;font:inherit}
        textarea{height:110px;resize:vertical}
        .row{display:flex;gap:6px;margin-top:8px}.row button{flex:1}
        #log{margin-top:8px;font-size:12px;color:#94a3b8;white-space:pre-wrap;max-height:90px;overflow:auto}
      </style>
      <div id="p">
        <b>SKU Bridge</b>
        <label>URL ของ SKU Tracking Analyzer</label>
        <input id="url" placeholder="file:///.../index.html หรือ https://...">
        <label>1) Tracking ตัวอย่างสำหรับเรียนรู้คำสั่งค้นหา <span id="tplst"></span></label>
        <div class="row"><input id="sample" placeholder="เช่น TH0123456789"><button class="s" id="learn">เริ่มเรียนรู้</button></div>
        <label>2) เลข Tracking (บรรทัดละ 1 เลข)</label>
        <textarea id="trk"></textarea>
        <div class="row"><button id="go">ดึงและส่งเข้า Analyzer</button></div>
        <div id="log"></div>
      </div>
      <button id="fab">SKU Bridge</button>`;
    const $ = id => root.getElementById(id);
    const log = t => { $('log').textContent = t; };
    const refreshTpl = () => { $('tplst').textContent = gv(KEY_TPL, null) ? '✓ เรียนรู้แล้ว' : '(ยังไม่ได้เรียนรู้)'; };

    $('url').value = gv(KEY_URL, '');
    refreshTpl();
    $('fab').onclick = () => $('p').classList.toggle('open');
    $('url').onchange = () => sv(KEY_URL, $('url').value.trim());

    $('learn').onclick = () => {
      const s = $('sample').value.trim();
      if (!s) return log('ใส่ Tracking ตัวอย่างก่อน');
      learnTarget = s;
      onLearned = () => { refreshTpl(); log('✓ เรียนรู้สำเร็จ'); };
      log(`รอจับคำสั่งค้นหา… ตอนนี้ค้นหา "${s}" ในช่องค้นหาของ BigSeller`);
    };

    $('go').onclick = async () => {
      const url = $('url').value.trim(); sv(KEY_URL, url);
      const trackings = [...new Set($('trk').value.split(/[\s,]+/).map(x => x.trim()).filter(Boolean))];
      if (!url) return log('ใส่ URL ของ Analyzer ก่อน');
      if (!trackings.length) return log('ยังไม่มีเลข Tracking');
      $('go').disabled = true;
      try {
        const { rows, miss } = await runAll(trackings, log);
        if (!rows.length) throw new Error('ไม่พบข้อมูลออเดอร์เลย — ลองเรียนรู้คำสั่งค้นหาใหม่');
        await sendToAnalyzer(url, rows);
        log(`✓ ส่ง ${rows.length} แถวเข้า Analyzer แล้ว` + (miss.length ? `\n⚠ ไม่พบ ${miss.length} เลข: ${miss.slice(0, 10).join(', ')}${miss.length > 10 ? '…' : ''}` : ''));
      } catch (e) { log('❌ ' + e.message); }
      $('go').disabled = false;
    };
    document.documentElement.appendChild(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
