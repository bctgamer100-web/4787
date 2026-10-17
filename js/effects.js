(() => {
  const glow = document.createElement('div');
  const dot = document.createElement('div');
  const ring = document.createElement('div');

  glow.className = 'mouse-glow';
  dot.className = 'mouse-dot';
  ring.className = 'mouse-ring';

  document.body.append(glow, ring, dot);

  let active = false;

  window.addEventListener('pointermove', e => {
    const position = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate3d(-50%, -50%, 0)`;
    glow.style.transform = position;
    ring.style.transform = position;
    dot.style.transform = position;
    if (!active) {
      active = true;
      document.body.classList.add('mouse-active');
    }

    const target = e.target;
    const interactive = target.closest?.('button, a, input, select, textarea, .tab, .drop-zone, [role="button"]');
    document.body.classList.toggle('mouse-hover', !!interactive);
  }, {passive:true});

  window.addEventListener('mouseleave', () => {
    active = false;
    document.body.classList.remove('mouse-active', 'mouse-hover');
  });

})();

(()=>{document.addEventListener('pointerdown',e=>{const el=e.target.closest('.tab, button');if(!el||e.button!==0)return;el.querySelectorAll('.water-ripple').forEach(x=>x.remove());const r=el.getBoundingClientRect(),w=document.createElement('span');w.className='water-ripple';w.style.left=(e.clientX-r.left)+'px';w.style.top=(e.clientY-r.top)+'px';el.appendChild(w);w.addEventListener('animationend',()=>w.remove(),{once:true});});})();

(()=>{
  const key='skuAnalyzerTheme';
  const btn=document.getElementById('themeToggle');
  const icon=document.getElementById('themeIcon');
  const text=document.getElementById('themeText');

  function applyTheme(mode){
    const light=mode==='light';
    document.body.classList.toggle('light-mode',light);
    icon.textContent=light?'🌙':'☀️';
    text.textContent=light?'โหมดมืด':'โหมดสว่าง';
    btn.setAttribute('aria-label',light?'เปลี่ยนเป็นโหมดมืด':'เปลี่ยนเป็นโหมดสว่าง');
  }

  let saved=localStorage.getItem(key);
  if(saved!=='light' && saved!=='dark') saved='dark';
  applyTheme(saved);

  btn.addEventListener('click',()=>{
    const next=document.body.classList.contains('light-mode')?'dark':'light';
    localStorage.setItem(key,next);
    applyTheme(next);
  });
})();
