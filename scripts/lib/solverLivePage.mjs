// Self-contained page for scripts/solver-live.mjs. pageHtml({ recording }) embeds a recording (replay /
// --export-html: no server, no solver needed); pageHtml({}) is the live page that subscribes to /events (SSE)
// and appends to the same recording structure. No external network loads.
//
// Recording shape (times in seconds since submit; ids coded):
//  { version:1,
//    meta:{ label, tag, seed, budget, startDate, endDate, dates[], weekend[], dayLabels[], residents[], hint:[flat grid],
//           stages:[names], createdAt },
//    machines:[{ name, url, workers, config, frames:[{t,status,stage,stageName,best,elapsed,inc?}],
//                incs:[{seq,t,stage,tier,objective,d:[[cellIndex,code]]}],   // d = cell changes vs previous incumbent (first: vs input)
//                final:null|{t,status,jobStatus,tiers,startTiers,verdict,wall,cellsChanged,lastImprovementT},
//                error }] }
export function pageHtml({ recording = null } = {}) {
  const embedded = recording ? JSON.stringify(recording).replace(/</g, "\\u003c") : "";
  return PAGE.replace("/*__REC__*/null", () => embedded || "null");
}

const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resident solver live</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1c2230;--mut:#667085;--line:#e3e6ec;--acc:#155e75;--ok:#1a9e63;--warn:#d9822b;--bad:#d64545;--we:rgba(120,120,140,.28);--s1:#2f6fed;--s2:#8a5cd0;--s3:#2c9d6a;--s4:#c9731f;--s5:#d64545;--s6:#5f7d8c}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--card:#1b2029;--ink:#e6e9f0;--mut:#98a2b3;--line:#2a313d;--acc:#5fb4cf;--ok:#38c488;--warn:#f0a050;--bad:#f07070;--we:rgba(0,0,0,.38);--s1:#6b9bff;--s2:#b48cf2;--s3:#5fd3a5;--s4:#f0a050;--s5:#f07070;--s6:#8fb0c0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,Segoe UI,sans-serif}
main{max-width:1600px;margin:0 auto;padding:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px;min-width:0}
h1{font-size:18px;margin:0 0 8px}h2{font-size:13px;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
.meta{display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--mut)}.meta b{color:var(--ink);font-weight:600}
.machines{display:grid;grid-template-columns:1fr;gap:12px}
@media (min-width:1000px){.machines.two,.machines.three{grid-template-columns:1fr 1fr}}@media (min-width:1500px){.machines.three{grid-template-columns:1fr 1fr 1fr}}
.machines>div{min-width:0}
.bar{height:8px;background:var(--line);border-radius:6px;overflow:hidden;margin:8px 0 4px}.bar i{display:block;height:100%;width:0;background:var(--acc)}
.state{font-weight:600}.tag{font-size:12px;color:var(--mut)}
.kv{display:flex;flex-wrap:wrap;gap:4px 16px;margin:6px 0;font-size:13px;color:var(--mut)}.kv b{color:var(--ink);font-variant-numeric:tabular-nums}
canvas{width:100%;height:130px;display:block}
.leg{display:flex;gap:12px;font-size:12px;color:var(--mut);margin-top:4px;flex-wrap:wrap}.leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.gridwrap{overflow:auto;max-width:100%;max-height:520px;border:1px solid var(--line);border-radius:8px}
table.g{border-collapse:separate;border-spacing:0;font-size:8px;line-height:1}
table.g th{position:sticky;top:0;background:var(--card);z-index:2;font-weight:600;color:var(--mut);padding:2px 0;min-width:26px;font-size:8px}
table.g th.we{background:color-mix(in srgb,var(--card) 70%,#888)}
table.g td.n{position:sticky;left:0;background:var(--card);z-index:1;padding:0 6px;font-size:10px;white-space:nowrap;font-weight:600}
table.g th:first-child{left:0;z-index:3}
table.g td.c{height:18px;min-width:26px;max-width:26px;text-align:center;color:#fff;overflow:hidden;white-space:nowrap;border:1px solid transparent;font-weight:600;letter-spacing:-.2px}
table.g td.c.we{box-shadow:inset 0 0 0 40px var(--we)}
table.g td.c.chg{outline:2px solid #ffd400;outline-offset:-2px;animation:fl 1.2s ease-out}
@keyframes fl{from{filter:brightness(1.8)}to{filter:none}}
.ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.ctl input[type=range]{flex:1 1 160px;min-width:120px}
button,select{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer}
.err{color:var(--bad);white-space:pre-wrap}.hide{display:none}
table.d{border-collapse:collapse;width:100%;font-size:13px}table.d td,table.d th{border-top:1px solid var(--line);padding:3px 6px;text-align:left}table.d td.r,table.d th.r{text-align:right;font-variant-numeric:tabular-nums}
.v-better{color:var(--ok);font-weight:600}.v-worse{color:var(--bad);font-weight:600}
label.chk{font-size:13px;color:var(--mut);display:inline-flex;gap:4px;align-items:center}
</style></head><body><main>
<div class="card"><h1>Resident solver, live</h1>
<div class="meta" id="top"></div>
<div class="ctl"><label class="chk"><input type="checkbox" id="sync" checked> Move all machines together</label>
<label class="chk"><input type="radio" name="hl" value="prev" checked> Outline cells changed since the previous incumbent</label>
<label class="chk"><input type="radio" name="hl" value="start"> since the input grid</label></div>
<div id="legend" class="leg"></div></div>
<div class="machines" id="machines"></div>
</main><script>
var EMBEDDED=/*__REC__*/null;
var REC=EMBEDDED||{meta:null,machines:[]};var LIVE=!EMBEDDED;
var $=function(id){return document.getElementById(id)};
var UI=[];var built=false;
var SCOL=['--s1','--s2','--s3','--s4','--s5','--s6'];
var SNAME={tier1_errors:'Errors',tier2_blockingWarns:'Blocking warnings',tier3_qualityRank:'Coverage rank',tier3b_restAfterCoverage:'Rest after coverage',tier4_quality:'Quality',outerLns:'Outer LNS polish'};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
var AREAC={POD:'#3b6fd8',PED:'#2c9d6a',FLEX:'#c9731f',MT:'#8a5cd0',TRAUMA:'#c04a4a',EM:'#5f7d8c'};
function areaOf(code){return code.split('-')[0]}
function areaColor(a){if(AREAC[a])return AREAC[a];var h=0;for(var i=0;i<a.length;i++)h=(h*31+a.charCodeAt(i))%360;return 'hsl('+h+',45%,40%)'}
function lastIdx(arr,t){var lo=-1;for(var i=0;i<arr.length;i++){if(arr[i].t<=t+1e-6)lo=i;else break}return lo}
function endT(m){var e=0;[m.frames,m.incs].forEach(function(a){if(a.length)e=Math.max(e,a[a.length-1].t)});if(m.final)e=Math.max(e,m.final.t);return e}
function ensureGrids(m){if(!m._g)m._g=[REC.meta.hint.slice()];
 for(var i=m._g.length-1;i<m.incs.length;i++){var g=m._g[i].slice();m.incs[i].d.forEach(function(c){g[c[0]]=c[1]});m._g.push(g)}}
function diffCount(a,b){var n=0;for(var i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n}
function sname(n){return SNAME[n]||n||''}

function build(){
 var M=REC.meta;built=true;
 var seen={},legend='';M.hint.forEach(function(c){if(c&&!seen[areaOf(c)]){seen[areaOf(c)]=1}});
 REC.machines.forEach(function(m){m.incs.forEach(function(x){x.d.forEach(function(c){if(c[1]&&!seen[areaOf(c[1])])seen[areaOf(c[1])]=1})})});
 Object.keys(seen).forEach(function(a){legend+='<span><i style="background:'+areaColor(a)+'"></i>'+esc(a)+'</span>'});
 $('legend').innerHTML=legend+'<span><i style="background:var(--we);border:1px solid var(--line)"></i>Weekend</span><span><i style="outline:2px solid #ffd400;outline-offset:-2px;background:#555"></i>Changed</span>';
 $('top').innerHTML='<span>Input <b>'+esc(M.label)+'</b></span><span>Tag <b>'+esc(M.tag)+'</b></span><span>Seed <b>'+esc(M.seed)+'</b></span><span>Budget <b>'+M.budget+' s</b></span><span>Residents <b>'+M.residents.length+'</b></span><span>Days <b>'+M.dates.length+'</b></span>'+(LIVE?'':'<span><b>Replay</b></span>');
 var box=$('machines');box.className='machines'+(REC.machines.length>2?' three':REC.machines.length>1?' two':'');box.innerHTML='';
 REC.machines.forEach(function(m,i){
  var d=document.createElement('div');d.className='card';
  d.innerHTML='<h1 id="mn'+i+'"></h1><div class="meta" id="mm'+i+'"></div><div class="bar"><i id="bar'+i+'"></i></div><div class="tag" id="el'+i+'"></div><div id="err'+i+'" class="err hide"></div>'
  +'<div class="kv" id="kv'+i+'"></div>'
  +'<h2>Best objective per step</h2><canvas id="cv'+i+'" width="900" height="130"></canvas><div class="leg" id="cl'+i+'"></div>'
  +'<div class="ctl"><button id="bb'+i+'" title="Previous improvement">&#9664;&#9664;</button><button id="nb'+i+'" title="Next improvement">&#9654;&#9654;</button><input type="range" id="sl'+i+'" min="0" max="1" step="0.1" value="0"><button id="lv'+i+'" class="hide">Jump to live</button><span class="tag" id="tt'+i+'"></span></div>'
  +'<h2>Schedule <span class="tag" id="gi'+i+'"></span></h2><div class="gridwrap" id="gw'+i+'"></div>'
  +'<div id="res'+i+'" class="hide"><h2>Result</h2><div id="resb'+i+'"></div></div>';
  box.appendChild(d);
  var u={t:0,follow:LIVE};UI[i]=u;
  var sl=$('sl'+i);
  sl.oninput=function(){u.follow=false;setT(i,Number(sl.value),true)};
  $('nb'+i).onclick=function(){stepInc(i,1)};$('bb'+i).onclick=function(){stepInc(i,-1)};
  $('lv'+i).onclick=function(){u.follow=true;renderAll()};
 });
 if(!LIVE)REC.machines.forEach(function(m,i){UI[i].t=endT(m)});
}
function setT(i,t,propagate){
 UI[i].t=t;
 if(propagate&&$('sync').checked)REC.machines.forEach(function(m,j){if(j!==i){UI[j].follow=false;UI[j].t=Math.min(t,endT(m))}});
 renderAll();
}
function stepInc(i,dir){var m=REC.machines[i],u=UI[i];u.follow=false;var ts=m.incs.map(function(x){return x.t});var t=u.t,n=null;
 if(dir>0){for(var k=0;k<ts.length;k++)if(ts[k]>t+1e-6){n=ts[k];break}if(n==null)n=endT(m)}
 else{for(var k2=ts.length-1;k2>=0;k2--)if(ts[k2]<t-1e-6){n=ts[k2];break}if(n==null)n=0}
 setT(i,n,true)}
function renderAll(){if(!REC.meta)return;if(!built)build();REC.machines.forEach(function(m,i){render(i)})}
function render(i){
 var M=REC.meta,m=REC.machines[i],u=UI[i];if(!u)return;
 var e=endT(m);var running=LIVE&&!m.final&&!m.error;
 if(u.follow)u.t=e;if(u.t>e)u.t=e;var t=u.t;
 var sl=$('sl'+i);sl.max=Math.max(e,1);sl.value=t;
 $('lv'+i).classList.toggle('hide',!(LIVE&&!u.follow&&running));
 $('tt'+i).textContent=fmt(t)+' / '+fmt(e);
 $('mn'+i).textContent=m.name;
 var fi=lastIdx(m.frames,t),fr=fi>=0?m.frames[fi]:null;
 var state=m.error?'Failed':(m.final&&t>=m.final.t-1e-6)?(m.final.status||'Done'):fr?(fr.status==='queued'?'Queued':'Solving'):'Waiting';
 $('mm'+i).innerHTML='<span>Solver <b>'+esc(m.url)+'</b></span><span>Workers <b>'+esc(m.workers==null?'?':m.workers)+'</b></span><span>State <b class="state">'+esc(state)+'</b></span>';
 $('bar'+i).style.width=Math.min(100,100*t/(M.budget||1))+'%';
 var stages=(fr&&fr.stages)||6;
 $('el'+i).textContent=fmt(t)+' / '+fmt(M.budget)+(fr&&fr.stage?'  ·  step '+fr.stage+' of '+stages+': '+sname(fr.stageName):'');
 var er=$('err'+i);er.classList.toggle('hide',!m.error);er.textContent=m.error||'';
 ensureGrids(m);var ii=lastIdx(m.incs,t);var g=m._g[ii+1];
 var ref=null;if(document.querySelector('input[name=hl]:checked').value==='start')ref=m._g[0];else if(ii>=0)ref=m._g[ii];
 var cur=ii>=0?m.incs[ii]:null;
 var changed=diffCount(m._g[0],g);
 var best=fr&&fr.best!=null?fr.best:null;
 $('kv'+i).innerHTML='<span>Cells changed vs input <b>'+changed+'</b></span><span>Incumbents <b>'+(ii+1)+'</b></span><span>Best now <b>'+(best==null?'-':best)+'</b></span>'+(m.final&&t>=m.final.t-1e-6?'<span>Last improvement <b>'+fmt(m.final.lastImprovementT||0)+'</b></span>':'');
 $('gi'+i).textContent=cur?('incumbent '+(ii+1)+' of '+m.incs.length+' at '+fmt(cur.t)+(cur.tier==='final'?' (final answer)':' during "'+esc(sname(cur.tier))+'"')):'input grid';
 var nd=M.dates.length;
 var h='<table class="g"><tr><th></th>';
 M.dates.forEach(function(d,di){h+='<th class="'+(M.weekend[di]?'we':'')+'" title="'+d+'">'+M.dayLabels[di]+'</th>'});h+='</tr>';
 M.residents.forEach(function(rid,ri){h+='<tr><td class="n">'+esc(rid)+'</td>';
  for(var di2=0;di2<nd;di2++){var ix=ri*nd+di2,c=g[ix];var chg=ref&&ref[ix]!==c;var bg='';
   if(c)bg=' style="background:'+areaColor(areaOf(c))+'"';
   h+='<td class="c'+(M.weekend[di2]?' we':'')+(chg?' chg':'')+'"'+bg+(c?' title="'+esc(rid+' '+M.dates[di2]+' '+c)+'"':'')+'>'+esc(c?c.replace(/^[A-Z]+-/,''):'')+'</td>'}
  h+='</tr>'});h+='</table>';
 var gw=$('gw'+i);var sx=gw.scrollLeft,sy=gw.scrollTop;gw.innerHTML=h;gw.scrollLeft=sx;gw.scrollTop=sy;
 draw(i,t);
 var showRes=m.final&&t>=m.final.t-1e-6;$('res'+i).classList.toggle('hide',!showRes);if(showRes)resultHtml(i,m.final);
}
function draw(i,t){var m=REC.machines[i],M=REC.meta,cv=$('cv'+i),g=cv.getContext('2d'),W=cv.width,H=cv.height;g.clearRect(0,0,W,H);
 var css=getComputedStyle(document.body);var line=css.getPropertyValue('--line'),mut=css.getPropertyValue('--mut');
 var by={};m.frames.forEach(function(f){if(f.t>t+1e-6||f.best==null||!f.stage)return;(by[f.stage]=by[f.stage]||{name:f.stageName,pts:[]}).pts.push([f.t,f.best])});
 var t1=Math.max(endT(m),M.budget*0.1,10);var X=function(x){return 30+(W-36)*x/t1};
 g.strokeStyle=line;g.fillStyle=mut;g.font='11px system-ui';g.lineWidth=1;g.beginPath();g.moveTo(30,H-14);g.lineTo(W,H-14);g.stroke();
 var leg='';
 Object.keys(by).map(Number).sort(function(a,b){return a-b}).forEach(function(s){var st=by[s],col=css.getPropertyValue(SCOL[(s-1)%6]);
  var lo=Infinity,hi=-Infinity;st.pts.forEach(function(p){lo=Math.min(lo,p[1]);hi=Math.max(hi,p[1])});var span=hi-lo||1;
  var Y=function(v){return H-18-(H-30)*(v-lo)/span};
  g.strokeStyle=col;g.lineWidth=2;g.beginPath();st.pts.forEach(function(p,k){if(k)g.lineTo(X(p[0]),Y(p[1]));else g.moveTo(X(p[0]),Y(p[1]))});g.stroke();
  g.fillStyle=col;var last=st.pts[st.pts.length-1];g.fillText(String(last[1]),Math.min(X(last[0])+3,W-40),Math.max(11,Y(last[1])-3));
  leg+='<span><i style="background:'+col+'"></i>'+s+'. '+esc(sname(st.name))+' ('+last[1]+')</span>'});
 $('cl'+i).innerHTML=leg;
 g.strokeStyle=mut;g.lineWidth=1;g.setLineDash([4,3]);g.beginPath();g.moveTo(X(t),6);g.lineTo(X(t),H-14);g.stroke();g.setLineDash([]);
 g.fillStyle=mut;g.fillText(fmt(0),30,H-1);g.fillText(fmt(t1),W-30,H-1)}
function vec(v){return v?'['+v.join(', ')+']':'-'}
function resultHtml(i,f){
 var h='<table class="d"><tr><th>Status</th><td>'+esc(f.status)+' <span class="tag">(job '+esc(f.jobStatus)+')</span></td></tr>'
 +'<tr><th>Tiers at start</th><td>'+vec(f.startTiers)+'</td></tr><tr><th>Tiers at end</th><td>'+vec(f.tiers)+'</td></tr>'
 +'<tr><th>Verdict</th><td class="v-'+esc(f.verdict)+'">'+esc(f.verdict)+'</td></tr>'
 +'<tr><th>Wall</th><td>'+Number(f.wall).toFixed(1)+' s</td></tr><tr><th>Cells changed vs input</th><td>'+f.cellsChanged+'</td></tr>'
 +'<tr><th>Last improvement</th><td>'+fmt(f.lastImprovementT||0)+'</td></tr></table>';
 $('resb'+i).innerHTML=h}

if(EMBEDDED){renderAll()}
else{var es=new EventSource('/events');
 es.addEventListener('hello',function(e){REC=JSON.parse(e.data);built=false;UI=[];renderAll()});
 es.addEventListener('meta',function(e){var j=JSON.parse(e.data);REC.meta=j.meta;REC.machines=j.machines;built=false;UI=[];renderAll()});
 es.addEventListener('ev',function(e){var x=JSON.parse(e.data),m=REC.machines[x.m];if(!m)return;
  if(x.k==='frame')m.frames.push(x.v);else if(x.k==='inc')m.incs.push(x.v);else if(x.k==='final')m.final=x.v;else if(x.k==='error')m.error=x.v;
  renderAll()});
}
document.querySelectorAll('input[name=hl]').forEach(function(r){r.onchange=renderAll});
</script></body></html>`;
