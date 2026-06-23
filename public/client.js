const socket = io();
let code = new URLSearchParams(location.search).get('room') || '';
let meId = null;
let state = null;
let lastAnimKey = null;
const app = document.getElementById('app');
const A='/assets/';
const spellNames = {1:'振祐的遠古巨龍',2:'翠襄的暗黑幽靈',3:'翔翔甜蜜蜜的夢',4:'鼎竣的貓頭鷹',5:'超級暴風雨',6:'無敵暴風雪',7:'大火球',8:'琇琇的鼻涕'};
const soundFiles = ['dragon','ghost','sleep','owl','thunder','blizzard','fireball','slime','fail','death','win','victory','start_game','countdown'];
const sounds = {};
const soundReady = {};
soundFiles.forEach(n=>{
  sounds[n]=new Audio(`${A}sounds/${n}.mp3`);
  sounds[n].preload='auto';
  soundReady[n]=false;
  fetch(`${A}sounds/${n}.mp3`, {method:'HEAD'}).then(r=>{soundReady[n]=r.ok;}).catch(()=>{soundReady[n]=false;});
});
function play(n){ try{ if(!soundReady[n]) return false; const a=sounds[n]; if(!a) return false; a.currentTime=0; a.play().catch(()=>{}); return true; }catch(e){ return false; } }
function copyRoom(){ navigator.clipboard?.writeText(location.origin + '?room=' + code); }
function img(src, cls=''){return `<img class="${cls}" src="${src}" onerror="this.style.visibility='hidden'">`}
function home(){
  app.innerHTML = `<div class="screen home"><div class="title">出包魔法師 Online</div><div class="panel bar"><input id="name" placeholder="你的名字" value="${localStorage.name||''}"><button id="create">建立房間</button><input id="room" placeholder="房號" value="${code}"><button id="join">加入房間</button></div><div class="panel" style="width:min(980px,90vw)">先建立房間，再把連結傳給朋友。有連結才能進同一房。音效放在 <b>public/assets/sounds/</b>，沒有音效檔時不會跑長施法動畫。</div></div>`;
  document.getElementById('create').onclick=()=>{ const name=document.getElementById('name').value||'你'; localStorage.name=name; socket.emit('createRoom',{name}); };
  document.getElementById('join').onclick=()=>{ const name=document.getElementById('name').value||'你'; const r=document.getElementById('room').value.trim().toUpperCase(); localStorage.name=name; socket.emit('joinRoom',{code:r,name}); };
  if(code){ document.getElementById('room').value=code; }
}
socket.on('connect',()=>{ meId=socket.id; if(code){ socket.emit('joinRoom',{code,name:localStorage.name||'你'}); } else home(); });
socket.on('joined', data=>{ code=data.code; history.replaceState(null,'','?room='+code); });
socket.on('errorMsg', msg=>toast(msg));
socket.on('state', s=>{ state=s; render(); maybeAnimate(); });
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2500); }
function render(){ if(!state) return; if(state.phase==='lobby') return renderLobby(); return renderGame(); }
function renderLobby(){
  const me=state.players.find(p=>p.id===meId) || state.players[0];
  const humans = state.players.filter(p=>!p.isBot);
  const allReady = humans.length>=2 && humans.every(p=>p.ready);
  const takenChars = new Set(state.players.filter(p=>p.id!==meId).map(p=>p.characterId));
  const takenColors = new Set(state.players.filter(p=>p.id!==meId).map(p=>p.color));
  app.innerHTML = `<div class="screen"><div class="topbar"><div class="room">房間 ${state.code}</div><button onclick="copyRoom()">複製邀請連結</button><span class="copyLink">${location.origin}?room=${state.code}</span><div class="spacer"></div>${state.hostId===meId?`<button onclick="socket.emit('demoMode',{code})">Demo五人預覽</button><button ${allReady?'':'disabled'} onclick="socket.emit('startGame',{code})">開始遊戲</button>`:''}</div><div class="lobby"><div class="panel lobbyMain"><h2>選角色</h2><div class="choiceGrid">${state.characters.map(c=>{const taken=takenChars.has(c.id);return `<div class="choice ${me?.characterId===c.id?'selected':''} ${taken?'taken':''}" ${taken?'':'onclick="socket.emit(\'updatePlayer\',{code,characterId:\''+c.id+'\',ready:false})"'}>${img(`${A}characters/${c.id}.png`)}<b>${c.name}</b><span>${taken?'已被選走':''}</span></div>`}).join('')}</div><h2>選顏色</h2><div class="colors">${state.colors.map(c=>{const taken=takenColors.has(c);return `<div class="swatch ${taken?'takenColor':''}" style="background:${c};color:${c};${me?.color===c?'outline:4px solid white':''}" ${taken?'':'onclick="socket.emit(\'updatePlayer\',{code,color:\''+c+'\',ready:false})"'}></div>`}).join('')}</div><h2>名字 / 就緒</h2><input id="rename" value="${me?.name||''}"><button class="readyBtn" onclick="socket.emit('updatePlayer',{code,name:document.getElementById('rename').value,ready:true})">我已就緒</button><div class="small">選完角色和顏色後按「我已就緒」。房主要等所有真人玩家都就緒才能開始。只有自己測畫面請按 Demo。</div></div><div class="panel lobbyPlayers"><h2>玩家</h2>${state.players.map(p=>`<div class="playerLine"><img src="${A}characters/${p.characterId}.png"><div><b style="color:${p.color}">${p.name}</b><br><span>${p.ready?'✅ 已就緒':'等待中'}</span></div></div>`).join('')}<hr><div class="small">房主開始後：播放 start_game.mp3 約 8 秒，最後 3 秒倒數後開局。</div></div></div></div>`;
}
function clockwiseOrder(players){
  // 對應伺服器的最終出牌順序：你/房主 -> 翠襄 -> 翔翔 -> 鼎竣 -> 琇琇。
  const idxs=[0];
  if(players.length>=3) idxs.push(2);
  if(players.length>=4) idxs.push(3);
  if(players.length>=5) idxs.push(4);
  if(players.length>=2) idxs.push(1);
  return idxs.map(i=>players[i]).filter(Boolean);
}
function seatSlots(players, me){
  const order = clockwiseOrder(players);
  const i = order.findIndex(p=>p.id===me.id);
  const rotated = i>=0 ? order.slice(i+1).concat(order.slice(0,i)) : players.filter(p=>p.id!==me.id);
  // 從自己視角：左手邊/下家放左下，接著左上、右上，右手邊/上家放右下。
  const slots = ['leftBottom','leftTop','rightTop','rightBottom'];
  return rotated.map((p,i)=>({p,slot:slots[i]||'rightBottom'}));
}
function renderGame(){
  const me = state.players.find(p=>p.id===meId) || state.players.find(p=>!p.isBot) || state.players[0];
  const current = state.players[state.currentIndex];
  const isHost = state.hostId===meId;
  const myTurn = current?.id===meId && state.phase==='playing';
  const slots = me?seatSlots(state.players,me):[];
  app.innerHTML = `<div class="screen"><div class="topbar"><div class="room">房間 ${state.code}</div><button onclick="copyRoom()">複製連結</button><div class="spacer"></div>${isHost?topActionButton():''}</div><div class="table"><div class="ring"></div><div class="owlInfo panel"><b>你的貓頭鷹情報</b><div>${renderHiddenInfo(me,true)}</div></div><div class="owlReserve panel"><b>貓頭鷹預備石</b><div class="reserveRow">${[0,1,2,3].map(i=>`<div class="miniBack">${i<state.owlReserveCount?img(`${A}ui/0.png`):'<span>空</span>'}</div>`).join('')}</div><div class="small">中央固定 4 顆，被偷看會暫時少 1 顆。</div></div><div class="boardWrap"><img class="board" src="${A}board/board.png"><div class="usedLayer">${renderUsedTokens()}</div><div class="scoreLayer">${renderScoreDots()}</div></div>${slots.map(({p,slot})=>renderSeat(p,slot,current?.id===p.id,false)).join('')}${me?renderSeat(me,'self',current?.id===me.id,true):''}<div class="diceBox panel"><b>骰子</b><div class="diceFace">${state.lastDice?.value||'-'}</div><div class="small">${state.lastDice?.reason||'巨龍 / 甜夢使用'}</div></div><div class="deck panel"><b>抽牌堆</b><div class="miniBack deckBack">${state.deckCount?img(`${A}ui/0.png`):'空'}</div><b>剩 ${state.deckCount} 張</b></div><div class="log">${state.logs.map(x=>`<div>${x}</div>`).join('')}</div></div><div class="rightPanel"><h3>${state.phase==='playing'?`輪到 ${current?.name||''}｜連鎖 ≥ ${state.chainMin}`:phaseText()}</h3>${renderSpellButtons(myTurn)}${isHost && state.phase==='playing'?`<button style="width:100%;margin-top:10px" onclick="socket.emit('demoStep',{code})">Demo自動走一步</button>`:''}</div>${renderOverlay()}</div>`;
}
function topActionButton(){ if(state.phase==='roundEnd') return `<button onclick="socket.emit('nextRound',{code})">下一局</button>`; if(state.phase==='gameOver') return `<button onclick="socket.emit('nextRound',{code})">重新開始</button>`; return ''; }
function phaseText(){ return state.phase==='roundEnd'?'本局結束':state.phase==='gameOver'?'遊戲結束':state.phase==='countdown'?'準備開始':'等待中'; }
let lastCountdownSound = null;
function renderOverlay(){
 if(state.phase==='countdown'){ const n=state.countdown||8; const text=n>3?'開場準備中':(n>0?n:'開始！'); if(n===8 && lastCountdownSound!==`start-${n}`){play('start_game'); lastCountdownSound=`start-${n}`;} if(n<=3&&n>0&&lastCountdownSound!==`count-${n}`){play('countdown'); lastCountdownSound=`count-${n}`;} return `<div class="overlay"><div class="count">${text}</div><div>最後 3 秒倒數後開局</div></div>`; }
 if(state.phase==='roundEnd'){
   const ended = state.roundEndedAt || 0;
   if(Date.now() - ended > 3000) return '';
   return `<div class="overlay lightOverlay"><div class="roundBox"><h1>本局結束</h1>${summaryHtml()}<p>3秒後自動收起，右上角按「下一局」。</p></div></div>`;
 }
 if(state.phase==='gameOver'){ play('victory'); return `<div class="overlay"><div class="winText">🎉 恭喜 ${state.winner?.name||''} 🎉<br>成為<br>巨屌大魔術師</div><p>右上角按「重新開始」</p></div>`; }
 return '';
}
function summaryHtml(){ if(!state.roundSummary) return ''; return `<div>${state.roundSummary.gains?.map(g=>{const p=state.players.find(x=>x.id===g.id);return `${p?.name||''} +${g.score} 分`;}).join('<br>')||''}</div>`; }
function renderSeat(p, slot, active, self){ return `<div class="seat ${slot} ${active?'active':''}" data-player="${p.id}"><div class="avatar">${img(`${A}characters/${p.characterId}.png`)}<div><div class="pname ${self?'youMark':''}">${self?'你':p.name}</div><div>分數 ${p.score}</div></div></div><div class="hp">${'♥'.repeat(p.hp)}${'♡'.repeat(6-p.hp)}</div><div class="hand">${renderHand(p,self)}</div>${renderHiddenInfo(p,false)}</div>`; }
function renderHand(p,self){ const arr=p.hand||[]; if(!arr.length) return '<span class="small">無手牌</span>'; return arr.map(n=> self ? `<div class="stone back">${img(`${A}ui/0.png`)}</div>` : spellStone(n)).join(''); }
function spellStone(n){ return `<div class="stone"><span class="num">${n}</span>${img(`${A}spells/${n}.png`)}</div>`; }
function renderHiddenInfo(p, owner){ const list=p?.hiddenInfo||[]; if(!list.length) return owner?'尚無':''; return `<div style="margin-top:8px"><b>情報 ${list.length} 張</b><div class="hand">${list.map(n=> owner?spellStone(n):`<div class="stone back">${img(`${A}ui/0.png`)}</div>`).join('')}</div></div>`; }
function renderSpellButtons(enabled){ return [1,2,3,4,5,6,7,8].map(n=>`<button class="spellBtn" ${enabled?'':'disabled'} onclick="socket.emit('castSpell',{code,spell:${n}})">${img(`${A}spells/${n}.png`)}<span class="n">${n}</span><span>${spellNames[n]}</span></button>`).join('') + `<button style="width:100%;margin-top:8px" ${enabled?'':'disabled'} onclick="socket.emit('stopTurn',{code})">停止施法並補牌</button>`; }
function renderUsedTokens(){
 const rows={8:{y:7.5,x:26,dx:6.4},7:{y:19,x:28,dx:6.3},6:{y:31,x:30,dx:6.2},5:{y:43,x:31,dx:6.4},4:{y:55,x:32,dx:6.8},3:{y:67,x:34,dx:7.0},2:{y:78,x:36,dx:7.4},1:{y:88,x:22,dx:7.8}};
 let html=''; for(let n=1;n<=8;n++){ const c=state.boardCounts[n]||0; const r=rows[n]; for(let i=0;i<c;i++){ html += `<div class="usedToken" style="left:${r.x+i*r.dx}%;top:${r.y}%">${img(`${A}spells/${n}.png`)}</div>`; } } return html;
}
function renderScoreDots(){ const xs=[26,33,40,47,54,61,68,75,82]; return state.players.map((p,i)=>{ const s=Math.min(8,p.score||0); return `<div class="scoreDot" style="left:${xs[s]}%;top:91.5%;background:${p.color};color:${p.color};transform:translate(${i*7}px,${(i%2)*15}px)">${s}</div>`; }).join(''); }
async function maybeAnimate(){
 const a=state?.lastAnimation; if(!a) return; const key=a.ts+'-'+a.spell+'-'+a.success; if(key===lastAnimKey) return; lastAnimKey=key;
 showFloatEffects(a.effects||[]);
 if(!a.success){ play('fail'); return; }
 const didPlay = play(a.sound);
 // 喊中才跑大動畫；沒放對應音效就不跑長動畫，避免拖節奏。
 if(!didPlay) return;
 const div=document.createElement('div'); div.className='spellAnim'; div.innerHTML=`<div class="bigNum">${a.spell}</div><div class="burst"><img src="${A}spells/${a.spell}.png"></div>`; document.body.appendChild(div); setTimeout(()=>div.remove(),3800);
}
function showFloatEffects(effects){
  effects.forEach((e,i)=>{
    const p = state.players.find(x=>x.id===e.id); if(!p) return;
    const seat = document.querySelector(`[data-player="${p.id}"]`); if(!seat) return;
    const f=document.createElement('div');
    f.className='floatDelta ' + (e.delta<0?'damage':'heal');
    f.textContent=(e.delta>0?'+':'') + e.delta;
    seat.appendChild(f);
    setTimeout(()=>f.remove(),1400);
  });
}
window.copyRoom=copyRoom; home();
