const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const SPELLS = {
  1:{name:'振祐的遠古巨龍', sound:'dragon', count:1},
  2:{name:'翠襄的暗黑幽靈', sound:'ghost', count:2},
  3:{name:'翔翔甜蜜蜜的夢', sound:'sleep', count:3},
  4:{name:'鼎竣的貓頭鷹', sound:'owl', count:4},
  5:{name:'超級暴風雨', sound:'thunder', count:5},
  6:{name:'無敵暴風雪', sound:'blizzard', count:6},
  7:{name:'大火球', sound:'fireball', count:7},
  8:{name:'琇琇的鼻涕', sound:'slime', count:8}
};
const CHARACTERS = [
  {id:'11', name:'大雞雞'}, {id:'22', name:'大波霸'}, {id:'33', name:'大蛋蛋'},
  {id:'44', name:'大黑熊'}, {id:'55', name:'大跳蚤'}
];
const COLORS = ['#ff5f6d','#4cc9f0','#7cff6b','#ffd166','#d970ff'];

function roomCode(){ return Math.random().toString(36).slice(2,6).toUpperCase(); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function dice(){ return Math.floor(Math.random()*3)+1; }
function makeDeck(){ const deck=[]; for(const [n,s] of Object.entries(SPELLS)){ for(let i=0;i<s.count;i++) deck.push(Number(n)); } return shuffle(deck); }
function makeRoom(code, hostId){
  return { code, hostId, phase:'lobby', players:[], deck:[], owlReserve:[], boardCounts:{1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0},
    currentIndex:0, chainMin:1, turnsInCycle:0, roundNo:0, winner:null, lastAnimation:null, lastDice:null, logs:[], roundSummary:null, roundEndedAt:0 };
}
function log(room, msg){ room.logs.unshift(`• ${msg}`); room.logs = room.logs.slice(0,80); }
function getRoom(code){ return rooms.get(String(code||'').toUpperCase()); }
function playerById(room,id){ return room.players.find(p=>p.id===id); }
function activePlayers(room){ return room.players.filter(p=>!p.isBot); }
function alivePlayers(room){ return room.players.filter(p=>p.hp>0); }
function tableOrder(room){
  // 最終定案：順時針出牌順序，不看畫面左右，而看桌面順序。
  // 5人：你 -> 翠襄 -> 翔翔 -> 鼎竣 -> 琇琇 -> 你
  // 畫面座位：左上翔翔、右上鼎竣、左下翠襄、右下琇琇、自己下方。
  const p=room.players;
  const idxs = [0];
  if(p.length>=3) idxs.push(2);       // 左下：翠襄 = 下家 / 左手邊
  if(p.length>=4) idxs.push(3);       // 左上：翔翔
  if(p.length>=5) idxs.push(4);       // 右上：鼎竣
  if(p.length>=2) idxs.push(1);       // 右下：琇琇 = 上家 / 右手邊
  return idxs.map(i=>p[i]).filter(Boolean);
}
function nextIndex(room, from=room.currentIndex){
  if(!room.players.length) return 0;
  const order = tableOrder(room);
  const current = room.players[from] || order[0];
  let oi = Math.max(0, order.findIndex(p=>p.id===current.id));
  for(let k=0;k<order.length;k++){
    oi=(oi+1)%order.length;
    const p=order[oi];
    if(p && p.hp>0) return room.players.findIndex(x=>x.id===p.id);
  }
  return from;
}
function leftNeighbor(room, p){
  // 左手邊 = 下家 = 順時針下一位
  const order = tableOrder(room).filter(x=>x.hp>0);
  if(order.length===2) return order.find(x=>x.id!==p.id);
  const i = order.findIndex(x=>x.id===p.id);
  return order[(i+1)%order.length];
}
function rightNeighbor(room, p){
  // 右手邊 = 上家 = 順時針上一位
  const order = tableOrder(room).filter(x=>x.hp>0);
  if(order.length===2) return order.find(x=>x.id!==p.id);
  const i = order.findIndex(x=>x.id===p.id);
  return order[(i-1+order.length)%order.length];
}
function heal(p, n){ p.hp = Math.min(6, p.hp + n); }
function hurt(p, n){ if(!p || p.hp<=0) return; p.hp = Math.max(0, p.hp - n); }
function broadcast(room){ io.to(room.code).emit('state', publicState(room)); }
function publicState(room){
  return { code:room.code, hostId:room.hostId, phase:room.phase, roundNo:room.roundNo, players:room.players, deckCount:room.deck.length, owlReserveCount:room.owlReserve.length,
    boardCounts:room.boardCounts, currentIndex:room.currentIndex, currentPlayerId:room.players[room.currentIndex]?.id || null, chainMin:room.chainMin,
    turnsInCycle:room.turnsInCycle, winner:room.winner, lastAnimation:room.lastAnimation, lastDice:room.lastDice, logs:room.logs, roundSummary:room.roundSummary, roundEndedAt:room.roundEndedAt,
    spells:SPELLS, characters:CHARACTERS, colors:COLORS };
}
function resetRound(room){
  room.phase = 'playing'; room.roundNo += 1; room.deck = makeDeck(); room.owlReserve = room.deck.splice(0,4);
  room.boardCounts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0}; room.chainMin=1; room.currentIndex=0; room.turnsInCycle=0; room.roundSummary=null; room.lastAnimation=null; room.lastDice=null; room.roundEndedAt=0;
  room.players.forEach((p,idx)=>{ p.hp=6; p.hand=room.deck.splice(0,5); p.hiddenInfo=[]; p.ready=false; p.lastSpell=null; p.turnDone=false; if(!p.characterId) p.characterId=CHARACTERS[idx%5].id; if(!p.color) p.color=COLORS[idx%5]; });
  log(room, `第 ${room.roundNo} 局開始，中央放 4 顆貓頭鷹預備石。`);
}
function startCountdown(room){

  if(room.phase==='countdown' || room.phase==='playing') return;

  room.phase='countdown';
  room.countdown='';

  log(room,'房主按下開始，播放8秒開場音樂');

  broadcast(room);

  let left=8;

  const timer=setInterval(()=>{

    left--;

    if(left===3){
      room.countdown=3;
    }
    else if(left===2){
      room.countdown=2;
    }
    else if(left===1){
      room.countdown=1;
    }
    else{
      room.countdown='';
    }

    if(left<=0){
      clearInterval(timer);
      room.countdown='';
      resetRound(room);
    }

    broadcast(room);

  },1000);

}
function checkWinner(room){
  const winners = room.players.filter(p=>p.score>=8);
  if(winners.length){
    room.phase='gameOver';
    room.winner=winners.sort((a,b)=>b.score-a.score)[0];
    log(room, `恭喜 ${room.winner.name} 成為巨屌大魔術師！`);
    return true;
  }
  return false;
}
function settleOwlCycle(room){
  const returning=[];
  room.players.forEach(p=>{
    if(p.hiddenInfo?.length){ const plus=p.hiddenInfo.length; p.score += plus; returning.push(...p.hiddenInfo); log(room, `${p.name} 的貓頭鷹情報結算，+${plus} 分。`); p.hiddenInfo=[]; }
  });
  if(returning.length){ room.owlReserve.push(...returning); room.owlReserve = room.owlReserve.slice(0,4); log(room, '貓頭鷹情報回到中央，恢復預備石。'); checkWinner(room); }
}
function finishTurn(room, p, reason='停止施法'){
  if(room.phase!=='playing') return;
  const need = Math.max(0, 5 - p.hand.length); if(need>0){ const drawn=room.deck.splice(0,need); p.hand.push(...drawn); log(room, `${p.name} 補牌 ${drawn.length} 張，目前抽牌堆剩 ${room.deck.length} 張。`); }
  room.chainMin=1; room.turnsInCycle += 1;
  if(room.turnsInCycle >= alivePlayers(room).length){ room.turnsInCycle=0; settleOwlCycle(room); if(room.phase==='gameOver') return; }
  room.currentIndex = nextIndex(room); log(room, `${p.name} ${reason}，輪到 ${room.players[room.currentIndex]?.name}。`);
}
function endRound(room, mode, actor, deadPlayers=[]){
  if(room.phase!=='playing') return;
  room.roundEndedAt = Date.now();
  room.roundSummary = {mode, actorId: actor?.id, deadIds: deadPlayers.map(p=>p.id), gains:[]};
  const gains = new Map(room.players.map(p=>[p.id,0]));
  if(mode==='clear') gains.set(actor.id, (gains.get(actor.id)||0)+3);
  if(mode==='kill'){
    if(actor) gains.set(actor.id, (gains.get(actor.id)||0)+3);
    room.players.forEach(p=>{ if(p.hp>0 && (!actor || p.id!==actor.id)) gains.set(p.id,(gains.get(p.id)||0)+1); });
  }
  if(mode==='suicide') room.players.forEach(p=>{ if(p.id!==actor.id) gains.set(p.id,(gains.get(p.id)||0)+1); });
  // clear + kill can stack into +6
  if(mode==='clearKill'){
    gains.set(actor.id,(gains.get(actor.id)||0)+6);
    room.players.forEach(p=>{ if(p.hp>0 && p.id!==actor.id) gains.set(p.id,(gains.get(p.id)||0)+1); });
  }
  for(const p of room.players){ const g=gains.get(p.id)||0; if(g>0){ p.score+=g; room.roundSummary.gains.push({id:p.id, score:g}); } }
  if(checkWinner(room)) { }
  else { room.phase='roundEnd'; log(room, '本局結束，按下一局會重洗重發，分數保留。'); }
}
function applySpell(room, caster, num){
  let deadBefore = new Set(room.players.filter(p=>p.hp<=0).map(p=>p.id));
  let roll = null;
  if(num===1){ roll=dice(); room.players.forEach(p=>{ if(p.id!==caster.id) hurt(p, roll); }); log(room, `${caster.name} 召喚遠古巨龍，骰到 ${roll}，其他玩家扣 ${roll}。`); }
  if(num===2){ room.players.forEach(p=>{ if(p.id!==caster.id) hurt(p,1); }); heal(caster,1); log(room, `${caster.name} 發動暗黑幽靈，其他人 -1，自己 +1。`); }
  if(num===3){ roll=dice(); heal(caster, roll); log(room, `${caster.name} 做了甜蜜蜜的夢，骰到 ${roll}，回復生命。`); }
  if(num===4){ if(room.owlReserve.length){ const info = room.owlReserve.shift(); caster.hiddenInfo.push(info); log(room, `${caster.name} 取得 1 張貓頭鷹情報；中央預備石剩 ${room.owlReserve.length} 張。`); } else log(room, '中央沒有貓頭鷹預備石可看。'); }
  if(num===5){ const l=leftNeighbor(room,caster), r=rightNeighbor(room,caster); hurt(l,1); hurt(r,1); log(room, `${caster.name} 發動超級暴風雨：左手邊 ${l?.name||''} -1、右手邊 ${r?.name||''} -1。`); }
  if(num===6){ const l=leftNeighbor(room,caster); hurt(l,1); log(room, `${caster.name} 發動暴風雪：左手邊 ${l?.name||''} -1。`); }
  if(num===7){ const r=rightNeighbor(room,caster); hurt(r,1); log(room, `${caster.name} 發動大火球：右手邊 ${r?.name||''} -1。`); }
  if(num===8){ heal(caster,1); log(room, `${caster.name} 使用琇琇的鼻涕，自己 +1。`); }
  const newlyDead = room.players.filter(p=>p.hp<=0 && !deadBefore.has(p.id));
  return {newlyDead, roll};
}
function hpSnapshot(room){ return new Map(room.players.map(p=>[p.id,p.hp])); }
function effectDeltas(room, before){
  return room.players.map(p=>({id:p.id, delta:p.hp - (before.get(p.id)??p.hp)})).filter(x=>x.delta!==0);
}
function castSpell(room, playerId, num){
  if(room.phase!=='playing') return;
  const caster=playerById(room, playerId); if(!caster) return;
  if(room.players[room.currentIndex]?.id !== caster.id && !caster.isBot) return;
  num=Number(num);
  if(num < room.chainMin){ log(room, `${caster.name} 不能施放 ${num}，連鎖必須 ≥ ${room.chainMin}。`); return; }
  const idx = caster.hand.indexOf(num);
  if(idx === -1){
    const before = hpSnapshot(room);
    let loss = 1, roll=null;
    if(num===1){ roll=dice(); loss=roll; }
    hurt(caster, loss);
    room.lastDice = roll ? {value:roll, playerId:caster.id, reason:num===1?'巨龍失敗反噬':'', ts:Date.now()} : room.lastDice;
    room.lastAnimation = {spell:num, success:false, sound:'fail', playerId:caster.id, ts:Date.now(), roll, effects:effectDeltas(room,before)};
    log(room, `${caster.name} 施放 ${SPELLS[num].name} 失敗，扣 ${loss}。`);
    if(caster.hp<=0) endRound(room,'suicide',caster,[caster]); else finishTurn(room,caster,'施法失敗');
    return;
  }
  const before = hpSnapshot(room);
  caster.hand.splice(idx,1); room.boardCounts[num] += 1; room.chainMin=num; caster.lastSpell=num;
  const {newlyDead, roll}=applySpell(room,caster,num);
  if(roll) room.lastDice = {value:roll, playerId:caster.id, reason:num===1?'遠古巨龍':num===3?'甜蜜蜜的夢':'骰子', ts:Date.now()};
  room.lastAnimation = {spell:num, success:true, sound:SPELLS[num].sound, playerId:caster.id, ts:Date.now(), roll, effects:effectDeltas(room,before)};
  const clear = caster.hand.length===0;
  if(clear && newlyDead.length) return endRound(room,'clearKill',caster,newlyDead);
  if(clear) return endRound(room,'clear',caster,[]);
  if(newlyDead.length) return endRound(room,'kill',caster,newlyDead);
}
function addBot(room, name, charId, color){
  if(room.players.length>=5) return;
  room.players.push({id:`bot-${Date.now()}-${Math.random()}`, name, characterId:charId, color, score:0, hp:6, hand:[], hiddenInfo:[], ready:true, isBot:true});
}
function demoFill(room){
  const demo = [ ['琇琇','55',COLORS[4]], ['翠襄','33',COLORS[2]], ['翔翔','44',COLORS[1]], ['鼎竣','22',COLORS[3]] ];
  for(const [n,c,col] of demo){ if(room.players.length<5 && !room.players.find(p=>p.name===n)) addBot(room,n,c,col); }
}
function botStep(room){
  if(room.phase!=='playing') return;
  const p=room.players[room.currentIndex]; if(!p) return;
  let choices = p.hand.filter(x=>x>=room.chainMin);
  let spell = choices.length ? choices[Math.floor(Math.random()*choices.length)] : Math.max(room.chainMin, Math.floor(Math.random()*8)+1);
  castSpell(room,p.id,spell);
  if(room.phase==='playing' && Math.random()<0.55) finishTurn(room,p,'停止施法');
}

io.on('connection', socket=>{
  socket.on('createRoom', ({name})=>{
    const code=roomCode(); const room=makeRoom(code,socket.id); rooms.set(code,room); socket.join(code);
    room.players.push({id:socket.id, name:name||'你', characterId:'11', color:COLORS[0], score:0, hp:6, hand:[], hiddenInfo:[], ready:false, isBot:false});
    log(room, `${name||'你'} 建立房間。`); socket.emit('joined',{code}); broadcast(room);
  });
  socket.on('joinRoom', ({code,name})=>{
    const room=getRoom(code); if(!room) return socket.emit('errorMsg','找不到房間');
    if(room.players.length>=5 && !room.players.find(p=>p.id===socket.id)) return socket.emit('errorMsg','房間滿了');
    socket.join(room.code);
    if(!room.players.find(p=>p.id===socket.id)){
      const i=room.players.length; room.players.push({id:socket.id, name:name||`玩家${i+1}`, characterId:CHARACTERS[i%5].id, color:COLORS[i%5], score:0, hp:6, hand:[], hiddenInfo:[], ready:false, isBot:false});
      log(room, `${name||`玩家${i+1}`} 加入房間。`);
    }
    socket.emit('joined',{code:room.code}); broadcast(room);
  });
  socket.on('updatePlayer', ({code,name,characterId,color,ready})=>{
    const room=getRoom(code); if(!room) return; const p=playerById(room,socket.id); if(!p) return;
    if(name!==undefined) p.name=name;
    if(characterId){
      const taken = room.players.find(x=>x.id!==p.id && x.characterId===characterId);
      if(taken) return socket.emit('errorMsg','這個角色已經被選走了。');
      p.characterId=characterId; p.ready=false;
    }
    if(color){
      const taken = room.players.find(x=>x.id!==p.id && x.color===color);
      if(taken) return socket.emit('errorMsg','這個顏色已經被選走了。');
      p.color=color; p.ready=false;
    }
    if(ready!==undefined){
      const charTaken = room.players.find(x=>x.id!==p.id && x.characterId===p.characterId);
      const colorTaken = room.players.find(x=>x.id!==p.id && x.color===p.color);
      if(ready && (charTaken||colorTaken)) return socket.emit('errorMsg','角色或顏色重複，不能就緒。');
      p.ready=!!ready;
    }
    broadcast(room);
  });
  socket.on('startGame', ({code})=>{ const room=getRoom(code); if(!room) return; if(socket.id!==room.hostId) return; const humans=room.players.filter(p=>!p.isBot); if(humans.length<2) return socket.emit('errorMsg','至少 2 個真人玩家，自己測試請按 Demo。'); if(!humans.every(p=>p.ready)) return socket.emit('errorMsg','要所有玩家都已就緒才能開始。'); startCountdown(room); });
  socket.on('demoMode', ({code})=>{ const room=getRoom(code); if(!room) return; demoFill(room); startCountdown(room); });
  socket.on('castSpell', ({code,spell})=>{ const room=getRoom(code); if(!room) return; castSpell(room,socket.id,spell); broadcast(room); });
  socket.on('stopTurn', ({code})=>{ const room=getRoom(code); if(!room) return; const p=playerById(room,socket.id); if(p && room.players[room.currentIndex]?.id===p.id) finishTurn(room,p,'停止施法'); broadcast(room); });
  socket.on('nextRound', ({code})=>{ const room=getRoom(code); if(!room||socket.id!==room.hostId) return; if(room.phase==='gameOver'){ room.players.forEach(p=>{p.score=0;p.hp=6;p.hiddenInfo=[];}); room.winner=null; } resetRound(room); broadcast(room); });
  socket.on('demoStep', ({code})=>{ const room=getRoom(code); if(!room) return; botStep(room); broadcast(room); });
  socket.on('disconnect', ()=>{ for(const room of rooms.values()){ const p=playerById(room,socket.id); if(p){ log(room, `${p.name} 離線。`); /* keep player for refresh/rejoin preview */ broadcast(room); } } });
});

server.listen(PORT, ()=> console.log(`Abraca Online Final running: http://localhost:${PORT}`));
