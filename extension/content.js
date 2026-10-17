// UI + ดึงข้อมูล (isolated world) — เปิดแผงด้วยการกด Ctrl สองครั้งติดกัน, Esc เพื่อปิด
(() => {
  if (window !== window.top) return;
  const TAG = 'sku-bridge';
  const PH = '__TRACKING__';
  const CONCURRENCY = 3;
  const DOUBLE_MS = 450;

  const store = {
    get: k => new Promise(r => chrome.storage.local.get(k, v => r(v[k]))),
    set: (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r))
  };

  // ---------- ดึงข้อมูลด้วย template ที่เรียนรู้ ----------
  async function queryTracking(tpl, tracking) {
    const enc = encodeURIComponent(tracking);
    const opt = { method: tpl.method, credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } };
    if (tpl.body != null && tpl.method !== 'GET') {
      const isJson = /^\s*[\[{]/.test(tpl.body);
      opt.body = tpl.body.split(PH).join(isJson ? tracking.replace(/["\\]/g, '\\$&') : enc);
      opt.headers['Content-Type'] = isJson ? 'application/json' : 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    const res = await fetch(tpl.url.split(PH).join(enc), opt);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const SKU_KEYS = ['varSku', 'merchantSku', 'skuMerchant', 'sellerSku', 'sku', 'itemSku'];
  const QTY_KEYS = ['quantity', 'qty', 'num', 'count', 'itemNum', 'amount'];
  const TRK_KEYS = ['trackingNo', 'trackingNumber', 'trackNo', 'tracking', 'shippingTrackNo'];
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '' && typeof o[k] !== 'object') return o[k]; };

  function extractRows(json, tracking) {
    const out = [];
    (function walk(node, ctx) {
      if (Array.isArray(node)) return node.forEach(n => walk(n, ctx));
      if (!node || typeof node !== 'object') return;
      const trk = pick(node, TRK_KEYS) || ctx;
      const sku = pick(node, SKU_KEYS), q = pick(node, QTY_KEYS);
      if (sku != null && q != null) out.push({ sku: String(sku), qty: Number(q) || 0, tracking: String(trk || tracking) });
      for (const k of Object.keys(node)) if (node[k] && typeof node[k] === 'object') walk(node[k], trk);
    })(json, tracking);
    const seen = new Set();
    return out.filter(r => { const k = r.tracking + '|' + r.sku + '|' + r.qty; return seen.has(k) ? false : (seen.add(k), true); });
  }

  async function runAll(trackings, log) {
    const tpl = await store.get('tpl');
    if (!tpl) throw new Error('ยังไม่ได้เรียนรู้คำสั่งค้นหา');
    const rows = [], miss = [];
    let i = 0, done = 0;
    const worker = async () => {
      while (i < trackings.length) {
        const t = trackings[i++];
        try {
          const r = extractRows(await queryTracking(tpl, t), t);
          r.length ? rows.push(...r) : miss.push(t);
        } catch (e) { miss.push(t); console.warn('[SKU Bridge]', t, e); }
        log(`ดึงแล้ว ${++done}/${trackings.length}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return { rows, miss };
  }

  // ---------- ส่งเข้า Analyzer ----------
  function sendToAnalyzer(url, rows) {
    return new Promise((resolve, reject) => {
      const win = window.open(url, 'sku-tracking-analyzer');
      if (!win) return reject(new Error('เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปให้ BigSeller'));
      const payload = { source: 'bigseller-sku-bridge', type: 'orders', rows, label: 'BigSeller ' + new Date().toLocaleString('th-TH') };
      let tries = 0;
      const onMsg = e => { if (e.data && e.data.source === 'sku-tracking-analyzer' && e.data.type === 'ack') { cleanup(); resolve(); } };
      const timer = setInterval(() => {
        try { win.postMessage(payload, '*'); } catch {}
        if (++tries > 40) { cleanup(); reject(new Error('Analyzer ไม่ตอบกลับ — ตรวจ URL (ต้องเป็น http/https ไม่ใช่ file://)')); }
      }, 500);
      function cleanup() { clearInterval(timer); window.removeEventListener('message', onMsg); }
      window.addEventListener('message', onMsg);
    });
  }

  // ---------- UI (ซ่อนอยู่จนกว่าจะกด Ctrl สองครั้ง) ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px/1.5 system-ui,sans-serif;display:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box}
      #p{width:340px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
      button{cursor:pointer;border:0;border-radius:8px;padding:8px 12px;font:inherit;background:#0284c7;color:#fff}
      button.s{background:#334155}button:disabled{opacity:.5}
      label{display:block;margin:8px 0 3px;color:#93c5fd;font-size:12px}
      input,textarea{width:100%;background:#020617;color:#fff;border:1px solid #334155;border-radius:8px;padding:7px;font:inherit}
      textarea{height:110px;resize:vertical}
      .row{display:flex;gap:6px;margin-top:8px}.row button{flex:1}.row input{flex:2}
      #log{margin-top:8px;font-size:12px;color:#94a3b8;white-space:pre-wrap;max-height:90px;overflow:auto}
      small{color:#64748b}
    </style>
    <div id="p">
      <b>SKU Bridge</b> <small>(Ctrl×2 สลับ · Esc ปิด)</small>
      <label>URL ของ SKU Tracking Analyzer (http/https)</label>
      <input id="url" placeholder="https://... หรือ http://localhost:8000/">
      <label>1) Tracking ตัวอย่างเพื่อเรียนรู้คำสั่งค้นหา <span id="tplst"></span></label>
      <div class="row"><input id="sample" placeholder="เช่น TH0123456789"><button class="s" id="learn">เรียนรู้</button></div>
      <label>2) เลข Tracking (บรรทัดละ 1 เลข)</label>
      <textarea id="trk"></textarea>
      <div class="row"><button id="go">ดึงและส่งเข้า Analyzer</button></div>
      <div id="log"></div>
    </div>`;
  const $ = id => root.getElementById(id);
  const log = t => { $('log').textContent = t; };
  const refreshTpl = async () => { $('tplst').textContent = (await store.get('tpl')) ? '✓ เรียนรู้แล้ว' : '(ยังไม่ได้เรียนรู้)'; };

  document.documentElement.appendChild(host);
  store.get('url').then(v => { $('url').value = v || ''; });
  refreshTpl();

  const toggle = force => {
    const show = force ?? host.style.display === 'none';
    host.style.display = show ? 'block' : 'none';
    if (show) $('trk').focus();
  };

  // กด Ctrl ปล่อย แล้วกด Ctrl อีกครั้งภายในเวลาที่กำหนด (ไม่นับเมื่อใช้ร่วมกับปุ่มอื่น)
  let lastTap = 0, ctrlClean = false;
  window.addEventListener('keydown', e => {
    if (e.key === 'Control') { if (!e.repeat) ctrlClean = true; }
    else { ctrlClean = false; if (e.key === 'Escape') toggle(false); }
  }, true);
  window.addEventListener('keyup', e => {
    if (e.key !== 'Control' || !ctrlClean) return;
    ctrlClean = false;
    const now = Date.now();
    if (now - lastTap < DOUBLE_MS) { lastTap = 0; toggle(); } else lastTap = now;
  }, true);

  // learn mode
  let seen = 0, learning = '';
  window.addEventListener('message', async e => {
    const d = e.data;
    if (!d || d.tag !== TAG) return;
    if (d.type === 'seen' && learning) {
      seen++;
      log(`รอจับคำสั่งค้นหา "${learning}"…\nเห็น request ${seen} รายการ (ล่าสุด: ${d.url})${d.hit ? '' : '\nยังไม่มีเลขนี้ใน request — ลองกดค้นหาด้วยเลขนี้'}`);
    } else if (d.type === 'learned') {
      learning = '';
      await store.set('tpl', d.tpl);
      refreshTpl(); log('✓ เรียนรู้สำเร็จ — กด "ดึงและส่งเข้า Analyzer" ได้เลย');
    }
  });
  $('learn').onclick = () => {
    const s = $('sample').value.trim();
    if (!s) return log('ใส่ Tracking ตัวอย่างก่อน');
    learning = s; seen = 0;
    window.postMessage({ tag: TAG, type: 'learn', target: s }, '*');
    log(`รอจับคำสั่งค้นหา… ตอนนี้ค้นหา "${s}" ในช่องค้นหาของ BigSeller`);
  };

  $('go').onclick = async () => {
    const url = $('url').value.trim(); await store.set('url', url);
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
})();
