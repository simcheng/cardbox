import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRoom, getRoom, getRoomCount, joinRoom, snapshot, touch } from './rooms.js';
import { applyTableAction } from './tableActions.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));
const playerSockets=new Map();
const roomCreateAttempts=new Map(),MAX_ACTIVE_ROOMS=500,ROOM_CREATES_PER_MINUTE=5;
const tableActionTypes=new Set(['chat','chat:react','deal','draw','flip','flip-cards','flip-top','hand:reorder','hand:reorder-cards','host:assign','move','move-card','move-cards','move-stack','pile:batch','pile:create','pile:delete','pile:layout','pile:move','pile:rename','pile:sort','pile:split-top-fan','place','place-cards','profile','reset-board','return-card','return-stack','selection:flip','selection:move','settings','shuffle','sort-hand','undo']);
function validActionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return false;
  if (typeof payload.type !== 'string' || !tableActionTypes.has(payload.type)) return false;
  if (payload.cards !== undefined && (!Array.isArray(payload.cards) || payload.cards.length > 500 || payload.cards.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.cardId !== 'string' || typeof item.fromId !== 'string'))) return false;
  if (payload.pileIds !== undefined && (!Array.isArray(payload.pileIds) || payload.pileIds.length > 100 || payload.pileIds.some(id => typeof id !== 'string'))) return false;
  if (payload.cardIds !== undefined && (!Array.isArray(payload.cardIds) || payload.cardIds.length > 500 || payload.cardIds.some(id => typeof id !== 'string'))) return false;
  return true;
}
function mayCreateRoom(socket) {
  const now=Date.now(),key=socket.handshake.address||'unknown',recent=(roomCreateAttempts.get(key)||[]).filter(time=>now-time<60_000);
  if(recent.length>=ROOM_CREATES_PER_MINUTE||getRoomCount()>=MAX_ACTIVE_ROOMS)return false;
  recent.push(now);roomCreateAttempts.set(key,recent);
  if(roomCreateAttempts.size>10_000)for(const [address,times] of roomCreateAttempts)if(!times.some(time=>now-time<60_000))roomCreateAttempts.delete(address);
  return true;
}
app.get('/health', (_req, res) => res.json({ ok: true }));
if (process.env.NODE_ENV === 'production') app.use(express.static(path.join(root, '../dist')));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  if (process.env.NODE_ENV === 'production') return res.sendFile(path.join(root, '../dist/index.html'));
  res.status(404).send('Use the Vite development server on port 5173.');
});

function publish(room) {
  touch(room);
  for (const player of room.players.values()) {
    io.to(`player:${player.id}`).emit('room:update', snapshot(room, player.id));
  }
}
function detachSocket(socket) {
  const room=getRoom(socket.data.roomId),player=room?.players.get(socket.data.playerId);
  if(socket.data.roomId)socket.leave(`room:${socket.data.roomId}`);
  if(socket.data.playerId)socket.leave(`player:${socket.data.playerId}`);
  if(player){const key=`${room.id}:${player.id}`,sockets=playerSockets.get(key);sockets?.delete(socket.id);if(!sockets?.size){playerSockets.delete(key);player.online=false;player.offlineAt=Date.now();recordPresence(room,player,'Left the table');publish(room);}}
  delete socket.data.roomId;delete socket.data.playerId;
}
function attachSocket(socket,room,player){const key=`${room.id}:${player.id}`;if(!playerSockets.has(key))playerSockets.set(key,new Set());playerSockets.get(key).add(socket.id);}
function ledgerEntry(room, playerId, payload, before) {
  const actor = room.players.get(playerId);
  const type = payload.type;
  const priorPile = before.piles.find(p => p.id === (type==='shuffle'?'deck':payload.fromId || payload.pileId));
  const cardName = (value) => value ? `${value.rank || 'Card'}${value.suit || ''}` : 'card';
  const pileName = (pile) => pile?.name || (pile?.kind === 'tableau' ? 'table stack' : 'pile');
  const pileRefs=(payload.pileIds||[]).flatMap(id=>(before.piles.find(p=>p.id===id)?.cards||[]).map(card=>({cardId:card.id,fromId:id})));
  const refs=[...(payload.cards||[]),...pileRefs].length?[...(payload.cards||[]),...pileRefs]:(payload.cardId?[{cardId:payload.cardId,fromId:payload.fromId||payload.pileId}]:type==='move-stack'?(priorPile?.cards||[]).map(card=>({cardId:card.id,fromId:priorPile.id})):[]);
  if(type==='flip-top'&&!refs.length&&priorPile?.cards.length) refs.push({cardId:priorPile.cards.at(-1).id,fromId:priorPile.id});
  const destination=room.piles.find(p=>p.id===payload.toId)||(payload.toId==='hand'?room.piles.find(p=>p.id===`hand-${playerId}`):null)||(type==='return-card'?before.piles.find(p=>p.id==='deck'):null);
  const cardItems=refs.map(({cardId,fromId})=>{
    const source=before.piles.find(p=>p.id===fromId);
    const card=source?.cards.find(item=>item.id===cardId);
    const afterPile=room.piles.find(p=>p.cards.some(item=>item.id===cardId))||room.piles.find(p=>p.id===fromId);
    const afterCard=afterPile?.cards.find(item=>item.id===cardId);
    let privateToPlayerId=null;
    const wasPublic=card&&source?.kind!=='deck'&&!(source?.kind==='hand'&&room.settings.privateHands)&&card.faceUp;
    if(room.settings.privateHands&&destination?.kind==='hand')privateToPlayerId=destination.ownerId;
    else if(!wasPublic&&source?.kind==='hand'&&room.settings.privateHands&&(destination?.kind==='hand'||destination?.kind==='deck'||type==='flip'||type==='flip-top'||type==='flip-cards'||type==='selection:flip'||type==='return-card')) privateToPlayerId=source.ownerId;
    else if(!wasPublic&&!afterCard?.faceUp) privateToPlayerId='__private__';
    return card?{label:cardName(card),source:source?.name||source?.id||'pile',privateToPlayerId}:null;
  }).filter(Boolean);
  const pileItems=(pile)=>pile?.cards.map(card=>({label:cardName(card),source:pile.name||pile.id,privateToPlayerId:pile.kind==='hand'&&room.settings.privateHands?pile.ownerId:!card.faceUp?'__private__':null}))||[];
  const listedCards=()=>cardItems.map(item=>item.label);
  const cardsDescription=()=>cardItems.length===1?cardItems[0].label:`${cardItems.length} cards`;
  let description = 'Updated the table';
  let details = {};
  if (type === 'draw' || type === 'deal') {
    const recipients=type==='deal'&&payload.toAll?[...room.players.values()]:[actor];
    const count=type==='deal'?Math.min(Math.max(Number(payload.count)||1,1),13):1;
    const deck=before.piles.find(p=>p.id==='deck');
    const available=[...(deck?.cards||[])].reverse();let order=0;const dealt=[];
    for(const recipient of recipients)for(let i=0;i<count&&order<available.length;i++,order++)dealt.push({label:cardName(available[order]),privateToPlayerId:recipient.id});
    const each=type==='deal'?Math.ceil(dealt.length/Math.max(1,recipients.length)):1;
    description=type==='draw'?'Drew 1 card':`Dealt ${each} card${each===1?'':'s'} to ${payload.toAll?'everyone':actor.name}`;
    details={count:dealt.length,countPerPlayer:type==='deal'?count:undefined,recipients:recipients.map(p=>p.name),cards:dealt.map(item=>item.label),cardItems:dealt};
  }
  else if (type === 'shuffle') { description = `Shuffled ${pileName(priorPile)}`; details = { count: priorPile?.cards.length || 0 }; }
  else if (type === 'place' || type === 'place-cards') { description = `Placed ${cardsDescription()} on the table`; details = { cards:listedCards(),cardItems, count:cardItems.length, layout: payload.mode || 'grid', stack: payload.targetId || null, position:payload.mode==='grid'?{x:payload.x,y:payload.y}:undefined }; }
  else if(type==='pile:batch'){const items=pileRefs.map(ref=>{const source=before.piles.find(p=>p.id===ref.fromId),card=source?.cards.find(item=>item.id===ref.cardId);return card?{label:cardName(card),source:source.name||source.id,privateToPlayerId:source.kind==='hand'&&room.settings.privateHands?source.ownerId:!card.faceUp?'__private__':null}:null}).filter(Boolean);const names=(payload.pileIds||[]).map(id=>pileName(before.piles.find(p=>p.id===id)));description=payload.operation==='move'?`Moved ${items.length} cards from ${names.join(', ')} to ${payload.to}`:payload.operation==='sort'?`Sorted ${names.join(', ')} by ${payload.mode}`:`Changed ${names.join(', ')} to ${payload.layout} layout`;details={piles:names,cards:items.map(item=>item.label),cardItems:items,count:items.length,operation:payload.operation,layout:payload.layout,mode:payload.mode,destination:payload.to};}
  else if (type === 'return-card') { description = `Returned ${cardsDescription()} to the deck`; details = { cards:listedCards(),cardItems,count:cardItems.length }; }
  else if (type === 'return-stack') { const cards=priorPile?.cards||[]; const items=cards.map(card=>({label:cardName(card),privateToPlayerId:payload.toId==='deck'&&!card.faceUp?'__private__':null})); description = `Returned a stack of ${cards.length} cards to ${payload.toId === 'deck' ? 'the deck' : 'discard'}`; details = { cards:items.map(item=>item.label),cardItems:items,count:cards.length,destination:payload.toId,source:priorPile?.name||priorPile?.id }; }
  else if (type === 'move' || type === 'move-card' || type==='move-cards' || type==='move-stack' || type==='selection:move') { const sources=[...new Set(cardItems.map(item=>item.source))]; const sourceLabel=sources.length>1?'multiple piles':sources[0]||pileName(priorPile); description = `Moved ${cardsDescription()} from ${sourceLabel} to ${pileName(destination)}`; details = { cards:listedCards(),cardItems,count:cardItems.length,sources,destination:destination?.name||destination?.id }; }
  else if (type === 'flip' || type === 'flip-top' || type==='flip-cards' || type==='selection:flip') { const sources=[...new Set(cardItems.map(item=>item.source))];description = `Turned ${cardsDescription()} in ${sources.length>1?'multiple piles':sources[0]||pileName(priorPile)}`; details = { cards:listedCards(),cardItems,count:cardItems.length,sources }; }
  else if (type === 'pile:layout') { const items=pileItems(priorPile);description = `Changed a stack to ${payload.layout} layout`; details = { count: priorPile?.cards.length || 0, layout: payload.layout, cards:items.map(item=>item.label),cardItems:items }; }
  else if (type === 'pile:split-top-fan') { const items=pileItems(priorPile);description = 'Separated the top fan from a stack';details={count:priorPile?.fanGroups?.at(-1)?.length||0,layout:'fan',cards:items.map(item=>item.label),cardItems:items}; }
  else if (type === 'pile:move') { const items=pileItems(priorPile);description = `Moved ${pileName(priorPile)}`; details = { count: priorPile?.cards.length || 0, position: { x: payload.x, y: payload.y },cards:items.map(item=>item.label),cardItems:items }; }
  else if (type === 'pile:create') description = `Created ${payload.name || 'a shared pile'}`;
  else if (type === 'host:assign') { const target=room.players.get(payload.targetId),wasCohost=before.cohostIds?.includes(payload.targetId); description=payload.role==='host'?`Transferred host to ${target?.name||'a player'}`:`${wasCohost?'Removed':'Assigned'} ${target?.name||'a player'} ${wasCohost?'from cohost':'as cohost'}`;details={targetId:payload.targetId,targetName:target?.name,role:payload.role}; }
  else if (type === 'pile:rename') { description = `Renamed ${pileName(priorPile)} to ${payload.name}`; details = { pileId: priorPile?.id, previousName: priorPile?.name, name: payload.name }; }
  else if (type === 'pile:delete') description = `Deleted an empty ${pileName(priorPile)}`;
  else if (type === 'reset-board') { const beforeCards=before.piles.flatMap(p=>p.cards.map(card=>({label:cardName(card),privateToPlayerId:p.kind==='hand'&&room.settings.privateHands?p.ownerId:!card.faceUp?'__private__':null})));description = 'Reset the board and shuffled a fresh deck'; details = { count: room.piles.find(p=>p.id==='deck')?.cards.length || 0, cards:beforeCards.map(item=>item.label),cardItems:beforeCards,sourcePiles:before.piles.map(p=>({name:p.name||p.id,count:p.cards.length})) }; }
  else if (type === 'undo') description = 'Undid the previous table action';
  else if (type === 'chat') { description = 'Sent a chat message';details={message:String(payload.message||'').slice(0,400)}; }
  else if (type === 'chat:react') { const message=room.chat.find(item=>item.id===payload.messageId);description = `Reacted ${payload.emoji || ''}`;details={emoji:payload.emoji,messageId:payload.messageId,messageAuthor:message?.name}; }
  else if (type === 'settings') { description = 'Changed table settings';details={settings:payload.settings}; }
  else if (type === 'sort-hand') { const hand=before.piles.find(p=>p.id===`hand-${playerId}`);description = `Sorted their hand by ${payload.mode}`;details={mode:payload.mode,count:hand?.cards.length||0,cards:hand?.cards.map(cardName)||[],cardItems:hand?.cards.map(card=>({label:cardName(card),source:hand.name,privateToPlayerId:room.settings.privateHands?playerId:null}))||[]}; }
  else if (type === 'hand:reorder' || type === 'hand:reorder-cards') { const hand=before.piles.find(p=>p.id===`hand-${playerId}`);const ids=type==='hand:reorder-cards'?payload.cardIds:[payload.cardId];const items=(hand?.cards||[]).filter(card=>ids.includes(card.id)).map(card=>({label:cardName(card),source:hand.name,privateToPlayerId:room.settings.privateHands?playerId:null}));description = `Reordered ${items.length||1} card${items.length===1?'':'s'} in their hand`;details={count:items.length,cards:items.map(item=>item.label),cardItems:items,beforeCardId:payload.beforeCardId||null}; }
  else if (type === 'profile') { description = 'Changed their profile';details={emoji:payload.emoji,color:payload.color}; }
  else if (type === 'move' && oldPile) description = `Moved a card from ${pileName(oldPile)}`;
  const privateDescription=type==='return-card'?'Returned a card to the deck':type.startsWith('move')||type==='selection:move'?`Moved ${cardItems.length||1} card${cardItems.length===1?'':'s'} between piles`:type.startsWith('flip')||type==='selection:flip'?'Turned selected cards':description;
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString(), playerId, playerName: actor?.name || 'Player', type, description, privateDescription, details };
}
function recordPresence(room, player, description) {
  room.ledger.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString(), playerId: player.id, playerName: player.name, type: 'presence', description, details: {} });
  if (room.ledger.length > 1000) room.ledger.shift();
}
io.on('connection', (socket) => {
  socket.on('room:create', (payload = {}, done = () => {}) => {
    if(typeof done!=='function')done=()=>{};
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.settings!==undefined&&(!payload.settings||typeof payload.settings!=='object'||Array.isArray(payload.settings)))return done({ok:false,error:'Invalid table details.'});
    const { name, playerName, settings }=payload;
    if(name!==undefined&&typeof name!=='string'||playerName!==undefined&&typeof playerName!=='string')return done({ok:false,error:'Invalid table details.'});
    if(!mayCreateRoom(socket))return done({ok:false,error:'Too many tables are active or being created. Try again shortly.'});
    detachSocket(socket);
    const { room, player } = createRoom(name, playerName || 'Guest', settings);
    recordPresence(room, player, 'Created the table and joined');
    socket.data.roomId = room.id; socket.data.playerId = player.id;
    attachSocket(socket,room,player);
    socket.join(`room:${room.id}`); socket.join(`player:${player.id}`);
    done({ ok: true, roomId: room.id, playerId: player.id, playerToken: player.sessionToken, room: snapshot(room, player.id) });
  });
  socket.on('room:join', (payload = {}, done = () => {}) => {
    if(typeof done!=='function')done=()=>{};
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return done({ok:false,error:'Invalid table details.'});
    const { roomId, playerName, playerId, playerToken }=payload;
    if(roomId!==undefined&&typeof roomId!=='string'||playerName!==undefined&&typeof playerName!=='string'||playerId!==undefined&&typeof playerId!=='string'||playerToken!==undefined&&typeof playerToken!=='string')return done({ok:false,error:'Invalid table details.'});
    const room = getRoom(String(roomId || '').toUpperCase());
    if (!room) return done({ ok: false, error: 'That table has closed or does not exist.' });
    const currentIdentity=room.players.get(playerId);
    const validIdentity=currentIdentity?.sessionToken===playerToken;
    if(socket.data.roomId&&(socket.data.roomId!==room.id||socket.data.playerId!==playerId||!validIdentity))detachSocket(socket);
    const player = joinRoom(room, playerName || 'Guest', playerId, playerToken);
    if(!player)return done({ok:false,error:'This table has reached its player limit. Try again after a seat becomes available.'});
    recordPresence(room, player, 'Joined the table');
    socket.data.roomId = room.id; socket.data.playerId = player.id;
    attachSocket(socket,room,player);
    socket.join(`room:${room.id}`); socket.join(`player:${player.id}`);
    publish(room); done({ ok: true, roomId: room.id, playerId: player.id, playerToken: player.sessionToken, room: snapshot(room, player.id) });
  });
  socket.on('room:leave', (done=()=>{})=>{if(typeof done!=='function')done=()=>{};detachSocket(socket);done({ok:true});});
  socket.on('table:action', (payload, done = () => {}) => {
    if(typeof done!=='function')done=()=>{};
    const room = getRoom(socket.data.roomId); const playerId = socket.data.playerId;
    if (!room || !room.players.has(playerId)) return done({ ok: false, error: 'Join a table first.' });
    if(!validActionPayload(payload))return done({ok:false,error:'Invalid table action.'});
    const before = { piles: structuredClone(room.piles), settings: structuredClone(room.settings), cohostIds:[...(room.cohostIds||[])] };
    let result;
    try { result = applyTableAction(room, playerId, payload); }
    catch(error) { console.error('Rejected malformed table action:',error);return done({ok:false,error:'That table action could not be processed.'}); }
    if (!result.ok) return done(result);
    room.ledger.push(ledgerEntry(room, playerId, payload, before));
    if (room.ledger.length > 1000) room.ledger.shift();
    const drawRecipients = payload.type === 'deal'
      ? (payload.toAll ? [...room.players.keys()] : [playerId])
      : payload.type === 'draw' ? [playerId] : [];
    const drawCounts = Object.fromEntries(drawRecipients.map((recipientId) => {
      const handId = `hand-${recipientId}`;
      const beforeCount = before.piles.find((pile) => pile.id === handId)?.cards.length || 0;
      const afterCount = room.piles.find((pile) => pile.id === handId)?.cards.length || 0;
      return [recipientId, Math.max(0, afterCount - beforeCount)];
    }));
    const selectedCardIds=[...(payload.cards||[]).map(item=>item.cardId),...(payload.pileIds||[]).flatMap(id=>(before.piles.find(pile=>pile.id===id)?.cards||[]).map(card=>card.id))];
    io.to(`room:${room.id}`).emit('table:cue', {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      type: payload.type==='selection:move'?'move-cards':payload.type==='selection:flip'?'flip-cards':payload.type, playerId,
      cardIds:selectedCardIds,
      pileId: ['draw','deal','shuffle'].includes(payload.type)?'deck':payload.pileId || payload.fromId || (payload.type === 'place' ? payload.targetId : null),
      cardId: payload.cardId || null, toId: payload.toId || null,
      recipientIds: drawRecipients,
      drawCount: drawCounts[playerId] || 0,
      drawCounts,
      message: payload.type === 'chat' ? String(payload.message || '').slice(0, 90) : '',
      emoji: payload.type === 'chat:react' ? payload.emoji : '',
      messageId: payload.type === 'chat:react' ? payload.messageId : '',
    });
    publish(room); done(result);
  });
  socket.on('disconnect', () => detachSocket(socket));
});

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Cardtable listening on ${PORT}`));
