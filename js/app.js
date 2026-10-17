let wb=null, currentRows=[], currentHeaders=[], currentSheet='', summary=null, importLabel='';
const $=id=>document.getElementById(id);
const DAILY_ARCHIVE_KEY='skuAnalyzerDailySummaries';

function getDailyArchive(){
  try{
    const archive=JSON.parse(localStorage.getItem(DAILY_ARCHIVE_KEY)||'{}');
    return archive&&typeof archive==='object'&&!Array.isArray(archive)?archive:{};
  }catch{return {}}
}
function localDateKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function formatDailyDate(key){
  const [year,month,day]=key.split('-').map(Number);
  return new Date(year,month-1,day).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'});
}
function formatDailyTime(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}
function saveDailySummary(report){
  const archive=getDailyArchive();
  const reports=Array.isArray(archive[report.date])?archive[report.date]:[];
  archive[report.date]=[report,...reports];
  try{localStorage.setItem(DAILY_ARCHIVE_KEY,JSON.stringify(archive));return true}
  catch{return false}
}
function renderDailyArchive(){
  const archive=getDailyArchive();
  const query=$('dailySearch').value.trim().toLocaleLowerCase('th-TH');
  const selectedDate=$('dailyDateFilter').value;
  const availableDates=Object.keys(archive).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Array.isArray(archive[date])&&archive[date].length).sort((a,b)=>b.localeCompare(a));
  const dates=availableDates.filter(date=>{
    if(!query)return true;
    const localizedDate=formatDailyDate(date).toLocaleLowerCase('th-TH');
    return date.includes(query)||localizedDate.includes(query)||archive[date].some(report=>String(report?.file||'').toLocaleLowerCase('th-TH').includes(query));
  }).filter(date=>!selectedDate||date===selectedDate);
  if(!dates.length){
    const message=query?'ไม่พบประวัติที่ตรงกับคำค้น':selectedDate?`ไม่มีสรุปผลวันที่ ${formatDailyDate(selectedDate)}`:'ยังไม่มีประวัติสรุปผล';
    $('dailyArchive').innerHTML=`<div class="empty">${message}</div>`;return;
  }
  let html='';
  dates.forEach(date=>{
    const reports=archive[date];
    html+=`<div class="section"><div class="sectionhead"><div><h3>📅 ${formatDailyDate(date)}</h3><div class="sub">${reports.length.toLocaleString()} รายการสรุป</div></div></div><div class="sectionbody">`;
    reports.forEach((report,index)=>{
      if(!report||typeof report!=='object')return;
      html+=`<div class="archive-item"><div><b>${esc(report.file||'สรุปผลจาก Excel')}</b><small>${formatDailyTime(report.savedAt)} · ${Number(report.rows||0).toLocaleString()} แถว · ${Number(report.unique||0).toLocaleString()} SKU</small></div><button class="secondary" onclick="openDailySummary('${date}',${index})">เปิดดูสรุป</button></div>`;
    });
    html+='</div></div>';
  });
  $('dailyArchive').innerHTML=html;
}
function clearDailyDate(){$('dailyDateFilter').value='';renderDailyArchive()}
function openDailySummary(date,index){
  const report=getDailyArchive()[date]?.[index];
  if(!report){toast('ไม่พบประวัติสรุปนี้');renderDailyArchive();return}
  summary=report;
  renderResult();
  showTab('result');
}

function showTab(name){
  const names=['excel','manual','result','daily'];
  names.forEach(x=>{
    const panel=$(x+'Panel'), tab=$(x+'Tab'), active=name===x;
    panel.classList.toggle('active',active);
    tab.classList.toggle('active',active);
  });
  if(name==='daily')renderDailyArchive();
  // subtle motion burst when switching tabs
  const activePanel=$(name+'Panel');
  activePanel.animate(
    [{opacity:.45,transform:'translateY(12px) scale(.99)'},{opacity:1,transform:'translateY(0) scale(1)'}],
    {duration:380,easing:'cubic-bezier(.2,.8,.2,1)'}
  );
}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function normHeader(v){return String(v??'').normalize('NFKC').replace(/\uFEFF/g,'').replace(/\u00A0/g,' ').trim().toLowerCase().replace(/\s+/g,' ')}
function normalizeSKU(v){
  // สำคัญ: สำหรับ Excel ห้ามตัดเลขท้าย SKU และห้ามตัดส่วนใดของ SKU ออก
  return String(v??'').normalize('NFKC').replace(/\uFEFF/g,'').replace(/\u00A0/g,' ').trim().replace(/\s+/g,' ').toUpperCase();
}
function normalizeTracking(v){
  return String(v??'').normalize('NFKC').replace(/\uFEFF/g,'').replace(/\u00A0/g,' ').trim().replace(/\s+/g,' ').toUpperCase();
}
function qty(v){
  if(typeof v==='number' && Number.isFinite(v)) return v;
  let s=String(v??'').replace(/,/g,'').trim();
  let n=Number(s); return Number.isFinite(n)?n:0;
}
function fmt(n){return Number.isInteger(n)?String(n):String(Number(n.toFixed(6)))}

function headerMatch(text,type){
  const h=normHeader(text);
  if(type==='sku') return h==='sku merchant'||h==='merchant sku'||h==='sku'||h.includes('sku merchant');
  if(type==='tracking') return h==='tracking'||h==='tracking number'||h==='tracking no'||h==='เลข tracking'||h==='หมายเลข tracking'||h==='เลขแทรค'||h.includes('tracking')||h.includes('แทรค');
  return h==='จำนวน'||h==='จำนวนสินค้า'||h==='qty'||h==='quantity'||h.includes('จำนวน')||h.includes('quantity')||h.includes('qty');
}
function findColInRow(row,type){
  const priority = type==='sku'
    ? ['sku merchant','merchant sku','sku']
    : type==='qty'
      ? ['จำนวน','จำนวนสินค้า','qty','quantity']
      : ['tracking number','tracking','tracking no','เลข tracking','หมายเลข tracking','เลขแทรค'];
  const hs=(row||[]).map(normHeader);
  for(const wanted of priority){
    const i=hs.findIndex(h=>h===wanted);
    if(i>=0)return i;
  }
  if(type==='sku'){
    let i=hs.findIndex(h=>h.includes('sku merchant') && !h.includes('ชื่อ sku merchant'));
    if(i>=0)return i;
  }else if(type==='tracking'){
    let i=hs.findIndex(h=>h.includes('tracking')||h.includes('แทรค'));
    if(i>=0)return i;
  }else{
    let i=hs.findIndex(h=>h.includes('จำนวน')||h.includes('quantity')||h.includes('qty'));
    if(i>=0)return i;
  }
  return -1;
}
function findHeaderInfo(rows){
  const limit=Math.min(rows.length,30);
  for(let r=0;r<limit;r++){
    const row=rows[r]||[];
    const si=findColInRow(row,'sku'), qi=findColInRow(row,'qty'), ti=findColInRow(row,'tracking');
    if(si>=0 && qi>=0 && ti>=0)return {row:r,sku:si,qty:qi,tracking:ti};
    if(si>=0 && qi>=0 && ti<0)return {row:r,sku:si,qty:qi,tracking:-1};
  }
  return {row:0,sku:-1,qty:-1,tracking:-1};
}
function actualSheetRange(sheet){
  let maxR=0,maxC=0,found=false;
  for(const key of Object.keys(sheet||{})){
    if(!/^[A-Z]+[0-9]+$/.test(key))continue;
    const cell=XLSX.utils.decode_cell(key);
    found=true; if(cell.r>maxR)maxR=cell.r; if(cell.c>maxC)maxC=cell.c;
  }
  return found ? {s:{r:0,c:0},e:{r:maxR,c:maxC}} : null;
}
function columnLabel(i){let n=i+1,s='';while(n){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}

function fillColumns(rows, preferredSku=-1, preferredQty=-1, preferredTracking=-1){
  const max=Math.max(...rows.slice(0,30).map(r=>r?.length||0),0);
  const info=findHeaderInfo(rows);
  const header=rows[info.row]||rows[0]||[];
  currentHeaders=Array.from({length:max},(_,i)=>String(header[i]??'').trim()||`คอลัมน์ ${columnLabel(i)}`);
  const choices=[['skuCol',preferredSku>=0?preferredSku:info.sku,0],['qtyCol',preferredQty>=0?preferredQty:info.qty,1],['trackingCol',preferredTracking>=0?preferredTracking:info.tracking,2]];
  choices.forEach(([id,sel,idx])=>{
    const s=$(id);s.innerHTML='';
    currentHeaders.forEach((h,i)=>{let o=document.createElement('option');o.value=i;o.textContent=`${columnLabel(i)} — ${h}`;s.appendChild(o)});
    if(s.options.length){
      let v=sel>=0?sel:Math.min(idx,s.options.length-1);
      s.value=String(v);
    }
  });
}
function updateHeaderSelect(rows){
  const h=findHeaderInfo(rows),s=$('headerRow');s.innerHTML='<option value="-1">🔎 อัตโนมัติ</option>';
  for(let i=0;i<Math.min(rows.length,20);i++){let o=document.createElement('option');o.value=i;o.textContent=`แถว ${i+1}`;s.appendChild(o)}
  s.value=String(h.row);
}
function loadSheet(){
  if(!wb)return;
  currentSheet=$('sheet').value;
  const sh=wb.Sheets[currentSheet];
  // บางไฟล์จากระบบขายมี !ref เป็น A1 ทั้งที่ข้อมูลจริงอยู่หลายร้อยแถว
  // จึงคำนวณช่วงเซลล์จริงจาก cell keys ก่อนอ่านทุกครั้ง
  const range=actualSheetRange(sh);
  currentRows=range ? XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:true,range}) : [];
  if(!currentRows.length){currentHeaders=[];$('status').textContent='⚠️ Sheet นี้ไม่มีข้อมูล';return}
  const h=findHeaderInfo(currentRows); fillColumns(currentRows,h.sku,h.qty,h.tracking); updateHeaderSelect(currentRows); preview();
}
function populateSheets(){
  const s=$('sheet');s.innerHTML='';
  wb.SheetNames.forEach(n=>{let o=document.createElement('option');o.value=n;o.textContent=n;s.appendChild(o)});
  s.onchange=loadSheet;
}
function loadFile(file){
  if(!file)return;
  if(!/\.(xlsx|xls|csv)$/i.test(file.name)){setStatus('❌ รองรับเฉพาะ .xlsx, .xls, .csv',false);return}
  $('fileName').textContent='📄 '+file.name;
  const r=new FileReader();
  r.onload=e=>{try{
    wb=XLSX.read(e.target.result,{type:'array',cellDates:false});
    if(!wb.SheetNames.length)throw Error('ไม่มี Sheet');
    populateSheets();$('options').style.display='block';loadSheet();
    setStatus(`✓ เปิดไฟล์สำเร็จ ${wb.SheetNames.length} Sheet — พร้อมตรวจ`,true);
  }catch(err){console.error(err);setStatus('❌ อ่านไฟล์ไม่ได้: '+err.message,false)}};
  r.readAsArrayBuffer(file);
}
function setStatus(t,ok=false){$('status').textContent=t;$('status').className='status '+(ok?'ok':'err')}
function preview(){
  if(!currentRows.length)return;
  const hr=Number($('headerRow').value);
  const start=hr>=0?hr:findHeaderInfo(currentRows).row;
  const rows=currentRows.slice(start,start+8),max=currentHeaders.length;
  let h='<table><thead><tr>'+currentHeaders.map((x,i)=>`<th>${columnLabel(i)} · ${esc(x)}</th>`).join('')+'</tr></thead><tbody>';
  rows.forEach(r=>{h+='<tr>';for(let c=0;c<max;c++)h+=`<td>${esc(r?.[c]??'')}</td>`;h+='</tr>'});h+='</tbody></table>';
  $('preview').innerHTML=h;
}

function parseOneSheet(rows, skuCol, qtyCol, trackingCol, headerRow=-1){
  if(!rows.length)return {groups:new Map(),rows:0,headerRow:0,skuCol,qtyCol,trackingCol};
  const auto=findHeaderInfo(rows);
  const hr=headerRow>=0?headerRow:auto.row;
  const sc=skuCol>=0?skuCol:(auto.sku>=0?auto.sku:0);
  const qc=qtyCol>=0?qtyCol:(auto.qty>=0?auto.qty:1);
  const tc=trackingCol>=0?trackingCol:(auto.tracking>=0?auto.tracking:-1);
  const groups=new Map();
  const trackingFrequency=new Map();
  const rowData=[];
  let used=0;
  for(let r=hr+1;r<rows.length;r++){
    const raw=rows[r]?.[sc];
    const sku=normalizeSKU(raw);
    if(!sku)continue;
    if(headerMatch(sku,'sku'))continue;
    const q=qty(rows[r]?.[qc]);
    const tracking=tc>=0?normalizeTracking(rows[r]?.[tc]):'';
    rowData.push({sku,q,tracking});
    if(tracking) trackingFrequency.set(tracking,(trackingFrequency.get(tracking)||0)+1);
    used++;
  }
  for(const {sku,q,tracking} of rowData){
    if(!groups.has(sku))groups.set(sku,{sku,qty:0,count:0,trackings:new Set(),rows:0,batch:false});
    const g=groups.get(sku);
    g.qty+=q;
    g.count++;
    g.rows++;
    if(tracking){
      g.trackings.add(tracking);
      if((trackingFrequency.get(tracking)||0)>1)g.batch=true;
    }
  }
  groups.forEach(g=>{g.trackingCount=g.trackings.size; delete g.trackings;});
  return {groups,rows:used,headerRow:hr,skuCol:sc,qtyCol:qc,trackingCol:tc};
}

function readAndSummarize(){
  if(!wb&&!currentRows.length){setStatus('⚠️ กรุณาเลือกไฟล์ Excel ก่อน',false);return}
  const sheetName=$('sheet').value;
  const sc=Number($('skuCol').value),qc=Number($('qtyCol').value),tc=Number($('trackingCol').value),hr=Number($('headerRow').value);
  if(!Number.isInteger(tc) || tc<0){setStatus('⚠️ กรุณาเลือกคอลัมน์หมายเลข Tracking',false);return}
  const parsed=parseOneSheet(currentRows,sc,qc,tc,hr);
  const singles=[],batches=[];
  parsed.groups.forEach(g=>(g.batch?batches:singles).push(g));

  // เรียง SKU ในหน้าสรุปให้อ่านง่าย:
  // 1) SKU ที่ไม่มีตัวอักษร A-Z มาก่อน
  // 2) จากนั้นจัดกลุ่มตามตัวอักษรตัวแรกที่พบใน SKU
  //    เช่น W ให้ W มาครบก่อน แล้วจึงไปตัวอักษรถัดไป
  // 3) ภายในกลุ่มใช้การเรียงแบบตัวเลข/ข้อความตามธรรมชาติ
  const skuSortKey = (sku) => {
    const s = String(sku ?? '').toUpperCase().trim();
    const match = s.match(/[A-Z]/);
    return match ? match[0] : '';
  };

  const naturalSkuCompare = (a,b) => {
    const la = skuSortKey(a.sku);
    const lb = skuSortKey(b.sku);

    // ไม่มีตัวอักษร -> มาก่อนทุกกลุ่มที่มีตัวอักษร
    if(!la && lb) return -1;
    if(la && !lb) return 1;

    // ถ้ามีตัวอักษร ให้เรียงตามตัวอักษร A-Z
    if(la !== lb) return la.localeCompare(lb);

    // ภายในตัวอักษรเดียวกัน เรียง SKU แบบธรรมชาติ
    return String(a.sku).localeCompare(String(b.sku), undefined, {
      numeric:true,
      sensitivity:'base'
    });
  };

  singles.sort(naturalSkuCompare);
  batches.sort(naturalSkuCompare);

  const now=new Date();
  summary={date:localDateKey(now),savedAt:now.toISOString(),file:importLabel||$('file').files[0]?.name||'',sheet:sheetName,rows:parsed.rows,unique:parsed.groups.size,singles,batches};
  const archived=saveDailySummary(summary);
  renderResult();
  showTab('result');
  toast(archived?`✓ สรุปสำเร็จ ${parsed.unique} SKU`:'สรุปสำเร็จ แต่บันทึกประวัติไม่ได้ พื้นที่จัดเก็บอาจเต็ม');
}

function renderResult(){
  if(!summary)return;
  const totalQty=summary.singles.reduce((a,x)=>a+x.qty,0)+summary.batches.reduce((a,x)=>a+x.qty,0);
  const batchRows=summary.batches.reduce((a,x)=>a+x.count,0);
  $('resultFile').textContent=`${summary.file} • Sheet: ${summary.sheet} • อ่าน ${summary.rows.toLocaleString()} แถว${summary.date?` • วันที่ ${formatDailyDate(summary.date)}`:''}`;
  let h=`<div class="summary">
    <div class="stat"><small>รายการ SKU ทั้งหมด</small><b>${summary.rows.toLocaleString()}</b></div>
    <div class="stat"><small>SKU ไม่ซ้ำ</small><b>${summary.unique.toLocaleString()}</b></div>
    <div class="stat single"><small>📦 SKU เดียว</small><b>${summary.singles.length.toLocaleString()}</b></div>
    <div class="stat batch"><small>🧱 SKU ก้อน</small><b>${summary.batches.length.toLocaleString()}</b></div>
  </div>`;
  h+=renderSection('single','📦 ออเดอร์เดียว','หมายเลข Tracking ปรากฏเพียง 1 ครั้ง — สรุปเฉพาะ SKU + จำนวน',summary.singles,'#4ade80');
  h+=renderSection('batch','🧱 ออเดอร์ก้อน','หมายเลข Tracking เดียวกันซ้ำมากกว่า 1 ครั้ง — รวมจำนวนทุกแถว แล้วสรุปเฉพาะ SKU + จำนวน',summary.batches,'#fb7185');
  $('result').innerHTML=h;
}
function skuSortKey(sku){
  const s=String(sku??'').trim().toUpperCase();
  const first=s.charAt(0);
  // SKU ที่ขึ้นต้นด้วยตัวเลข/สัญลักษณ์มาก่อน แล้วค่อยเรียง A-Z
  return /^[A-Z]$/.test(first) ? `1-${first}` : '0-';
}

function sortSkuGroups(arr){
  return [...arr].sort((a,b)=>{
    const ka=skuSortKey(a.sku), kb=skuSortKey(b.sku);
    if(ka!==kb) return ka.localeCompare(kb);
    return String(a.sku).localeCompare(String(b.sku),undefined,{numeric:true,sensitivity:'base'});
  });
}

function renderSection(type,title,note,arr,color){
  const sorted=sortSkuGroups(arr);
  const all=sorted.map(x=>`${x.sku}\t${fmt(x.qty)}`).join('\n');
  let h=`<div class="section"><div class="sectionhead"><div><h3>${title} <span class="badge">${sorted.length.toLocaleString()} SKU</span></h3><div class="sub">${note}</div></div>
  <button class="copyall" onclick='copyText(${JSON.stringify(all)})'>📋 คัดลอกทั้งหมด</button></div><div class="sectionbody">`;
  if(!sorted.length) return h+'<div class="empty">ไม่พบรายการในกลุ่มนี้</div></div></div>';
  h+='<div class="scroll"><table class="resulttable"><thead><tr><th>SKU Merchant</th><th>จำนวน</th><th>คัดลอก</th></tr></thead><tbody>';
  sorted.forEach(x=>h+=`<tr><td>${esc(x.sku)}</td><td>${fmt(x.qty)}</td><td><button class="copymini" onclick='copyText(${JSON.stringify(x.sku+"\t"+fmt(x.qty))})'>SKU + จำนวน</button></td></tr>`);
  return h+'</tbody></table></div></div></div>';
}
function copyText(t){navigator.clipboard?.writeText(t).then(()=>toast('✓ คัดลอกแล้ว')).catch(()=>fallback(t))}
function fallback(t){let a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();toast('✓ คัดลอกแล้ว')}
function resetExcel(){wb=null;summary=null;currentRows=[];importLabel='';$('file').value='';$('fileName').textContent='ยังไม่ได้เลือกไฟล์';$('options').style.display='none';$('preview').innerHTML='';$('result').innerHTML='';setStatus('เลือกไฟล์ Excel เพื่อเริ่มต้น',false)}
function manualCheck(){
  const a=new Set($('manual1').value.split(/\n|,/).map(normalizeSKU).filter(Boolean));
  const b=new Set($('manual2').value.split(/\n|,/).map(normalizeSKU).filter(Boolean));
  const m=[...a].filter(x=>b.has(x));
  const total1=a.size,total2=b.size,match=m.length,unique=new Set([...a,...b]).size;
  const all=m.join('\n');

  if(!match){
    $('manualResult').innerHTML=`
      <div class="manual-result-wrap">
        <div class="manual-result-head">
          <div class="manual-result-title"><span class="pulse"></span>ผลตรวจ SKU</div>
          <span class="manual-count">0 รายการ</span>
        </div>
        <div class="manual-empty">
          <div class="empty-icon">🔎</div>
          ไม่พบ SKU ที่ตรงกัน
        </div>
      </div>`;
    return;
  }

  const rows=m.map((x,i)=>`
    <div class="manual-match-row" style="animation-delay:${Math.min(i,12)*.035}s">
      <div><span class="manual-no">#${i+1}</span>&nbsp;&nbsp;<span class="manual-sku">${esc(x)}</span></div>
      <span class="badge">ตรงกัน</span>
    </div>`).join('');

  $('manualResult').innerHTML=`
    <div class="manual-result-wrap">
      <div class="manual-result-head">
        <div class="manual-result-title"><span class="pulse"></span>ผลตรวจ SKU ที่ตรงกัน</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="manual-count">${match} รายการ</span>
          <button class="copyall manual-copy" onclick='copyText(${JSON.stringify(all)})'>📋 คัดลอกทั้งหมด</button>
        </div>
      </div>
      <div class="manual-summary">
        <div class="manual-stat"><small>ชุดที่ 1</small><b>${total1}</b></div>
        <div class="manual-stat"><small>ชุดที่ 2</small><b>${total2}</b></div>
        <div class="manual-stat match"><small>SKU ที่ตรงกัน</small><b>${match}</b></div>
      </div>
      <div class="manual-list">
        <div class="manual-list-head"><span>SKU ที่พบตรงกัน</span><span>สถานะ</span></div>
        ${rows}
      </div>
    </div>`;
}

// รับข้อมูลออเดอร์จากสคริปต์ Tampermonkey (userscript/bigseller-sku-bridge.user.js)
// รูปแบบ: {source:'bigseller-sku-bridge', type:'orders', rows:[{sku,qty,tracking}]}
function importRows(list,label){
  const rows=[['SKU Merchant','จำนวน','Tracking Number']];
  list.forEach(r=>{if(r&&r.sku)rows.push([r.sku,Number(r.qty)||0,r.tracking||''])});
  if(rows.length<2){setStatus('⚠️ ไม่มีข้อมูลออเดอร์ที่ได้รับ',false);return}
  wb=null;importLabel=label||'BigSeller';
  currentRows=rows;
  $('fileName').textContent='🔌 '+importLabel;
  $('sheet').innerHTML='<option value="BigSeller">BigSeller</option>';
  $('options').style.display='block';
  fillColumns(rows,0,1,2);updateHeaderSelect(rows);preview();
  setStatus(`✓ รับข้อมูลจาก BigSeller ${rows.length-1} แถว`,true);
  readAndSummarize();
}
window.addEventListener('message',e=>{
  const d=e.data;
  if(!d||d.source!=='bigseller-sku-bridge'||d.type!=='orders'||!Array.isArray(d.rows))return;
  importRows(d.rows,d.label||('BigSeller '+localDateKey()));
  if(e.source)e.source.postMessage({source:'sku-tracking-analyzer',type:'ack',count:d.rows.length},'*');
});
if(window.opener)window.opener.postMessage({source:'sku-tracking-analyzer',type:'ready'},'*');

$('file').addEventListener('change',e=>loadFile(e.target.files?.[0]));
$('headerRow').addEventListener('change',preview);
const drop=$('drop');['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files?.[0]));
