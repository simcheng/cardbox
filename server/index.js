import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRoom, getRoom, joinRoom, snapshot, touch } from './rooms.js';
import { applyTableAction } from './tableActions.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));
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
function ledgerEntry(room, playerId, payload, before) {
  const actor = room.players.get(playerId);
  const type = payload.type;
  const priorPile = before.piles.find(p => p.id === (payload.fromId || payload.pileId));
  const cardName = (value) => value ? `${value.rank || 'Card'}${value.suit || ''}` : 'card';
  const pileName = (pile) => pile?.name || (pile?.kind === 'tableau' ? 'table stack' : 'pile');
  const refs=payload.cards?.length?payload.cards:(payload.cardId?[{cardId:payload.cardId,fromId:payload.fromId||payload.pileId}]:[]);
  if(type==='flip-top'&&!refs.length&&priorPile?.cards.length) refs.push({cardId:priorPile.cards.at(-1).id,fromId:priorPile.id});
  const destination=room.piles.find(p=>p.id===payload.toId)||(type==='return-card'?before.piles.find(p=>p.id==='deck'):null);
  const cardItems=refs.map(({cardId,fromId})=>{
    const source=before.piles.find(p=>p.id===fromId);
    const card=source?.cards.find(item=>item.id===cardId);
    const afterPile=room.piles.find(p=>p.cards.some(item=>item.id===cardId))||room.piles.find(p=>p.id===fromId);
    const afterCard=afterPile?.cards.find(item=>item.id===cardId);
    let privateToPlayerId=null;
    const wasPublic=card&&source?.kind!=='deck'&&!(source?.kind==='hand'&&room.settings.privateHands)&&card.faceUp;
    if(room.settings.privateHands&&destination?.kind==='hand')privateToPlayerId=destination.ownerId;
    else if(!wasPublic&&source?.kind==='hand'&&room.settings.privateHands&&(destination?.kind==='hand'||destination?.kind==='deck'||type==='flip'||type==='flip-top'||type==='flip-cards'||type==='return-card')) privateToPlayerId=source.ownerId;
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
    const deck=before.piles.find(p=>p.id===(payload.pileId||'deck'));
    const available=[...(deck?.cards||[])].reverse();let order=0;const dealt=[];
    for(const recipient of recipients)for(let i=0;i<count&&order<available.length;i++,order++)dealt.push({label:cardName(available[order]),privateToPlayerId:recipient.id});
    const each=type==='deal'?Math.ceil(dealt.length/Math.max(1,recipients.length)):1;
    description=type==='draw'?'Drew 1 card':`Dealt ${each} card${each===1?'':'s'} to ${payload.toAll?'everyone':actor.name}`;
    details={count:dealt.length,countPerPlayer:type==='deal'?count:undefined,recipients:recipients.map(p=>p.name),cards:dealt.map(item=>item.label),cardItems:dealt};
  }
  else if (type === 'shuffle') { description = `Shuffled ${pileName(priorPile)}`; details = { count: priorPile?.cards.length || 0 }; }
  else if (type === 'cut') { description = `Cut ${pileName(priorPile)}`; details = { count: priorPile?.cards.length || 0 }; }
  else if (type === 'place' || type === 'place-cards') { description = `Placed ${cardsDescription()} on the table`; details = { cards:listedCards(),cardItems, count:cardItems.length, layout: payload.mode || 'grid', stack: payload.targetId || null, position:payload.mode==='grid'?{x:payload.x,y:payload.y}:undefined }; }
  else if (type === 'return-card') { description = `Returned ${cardsDescription()} to the deck`; details = { cards:listedCards(),cardItems,count:cardItems.length }; }
  else if (type === 'return-stack') { const cards=priorPile?.cards||[]; const items=cards.map(card=>({label:cardName(card),privateToPlayerId:payload.toId==='deck'&&!card.faceUp?'__private__':null})); description = `Returned a stack of ${cards.length} cards to ${payload.toId === 'deck' ? 'the deck' : 'discard'}`; details = { cards:items.map(item=>item.label),cardItems:items,count:cards.length,destination:payload.toId,source:priorPile?.name||priorPile?.id }; }
  else if (type === 'move' || type === 'move-card' || type==='move-cards') { const sources=[...new Set(cardItems.map(item=>item.source))]; const sourceLabel=sources.length>1?'multiple piles':sources[0]||pileName(priorPile); description = `Moved ${cardsDescription()} from ${sourceLabel} to ${pileName(destination)}`; details = { cards:listedCards(),cardItems,count:cardItems.length,sources,destination:destination?.name||destination?.id }; }
  else if (type === 'flip' || type === 'flip-top' || type==='flip-cards') { const sources=[...new Set(cardItems.map(item=>item.source))];description = `Turned ${cardsDescription()} in ${sources.length>1?'multiple piles':sources[0]||pileName(priorPile)}`; details = { cards:listedCards(),cardItems,count:cardItems.length,sources }; }
  else if (type === 'pile:layout') { const items=pileItems(priorPile);description = `Changed a stack to ${payload.layout} layout`; details = { count: priorPile?.cards.length || 0, layout: payload.layout, cards:items.map(item=>item.label),cardItems:items }; }
  else if (type === 'pile:move') { const items=pileItems(priorPile);description = `Moved ${pileName(priorPile)}`; details = { count: priorPile?.cards.length || 0, position: { x: payload.x, y: payload.y },cards:items.map(item=>item.label),cardItems:items }; }
  else if (type === 'pile:create') description = `Created ${payload.name || 'a shared pile'}`;
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
  const privateDescription=type==='return-card'?'Returned a card to the deck':type.startsWith('move')?`Moved ${cardItems.length||1} card${cardItems.length===1?'':'s'} between piles`:type.startsWith('flip')?'Turned a card in a private hand':description;
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString(), playerId, playerName: actor?.name || 'Player', type, description, privateDescription, details };
}
function recordPresence(room, player, description) {
  room.ledger.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString(), playerId: player.id, playerName: player.name, type: 'presence', description, details: {} });
  if (room.ledger.length > 1000) room.ledger.shift();
}
io.on('connection', (socket) => {
  socket.on('room:create', ({ name, playerName, settings }, done = () => {}) => {
    const { room, player } = createRoom(name, playerName || 'Guest', settings);
    recordPresence(room, player, 'Created the table and joined');
    socket.data.roomId = room.id; socket.data.playerId = player.id;
    socket.join(`room:${room.id}`); socket.join(`player:${player.id}`);
    done({ ok: true, roomId: room.id, playerId: player.id, room: snapshot(room, player.id) });
  });
  socket.on('room:join', ({ roomId, playerName, playerId }, done = () => {}) => {
    const room = getRoom(String(roomId || '').toUpperCase());
    if (!room) return done({ ok: false, error: 'That table has closed or does not exist.' });
    const player = joinRoom(room, playerName || 'Guest', playerId);
    recordPresence(room, player, 'Joined the table');
    socket.data.roomId = room.id; socket.data.playerId = player.id;
    socket.join(`room:${room.id}`); socket.join(`player:${player.id}`);
    publish(room); done({ ok: true, roomId: room.id, playerId: player.id, room: snapshot(room, player.id) });
  });
  socket.on('table:action', (payload, done = () => {}) => {
    const room = getRoom(socket.data.roomId); const playerId = socket.data.playerId;
    if (!room || !room.players.has(playerId)) return done({ ok: false, error: 'Join a table first.' });
    const before = { piles: structuredClone(room.piles), settings: structuredClone(room.settings) };
    const result = applyTableAction(room, playerId, payload);
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
    io.to(`room:${room.id}`).emit('table:cue', {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      type: payload.type, playerId,
      pileId: payload.pileId || payload.fromId || (payload.type === 'place' ? payload.targetId : null),
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
  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomId); const player = room?.players.get(socket.data.playerId);
    if (player) { player.online = false; recordPresence(room, player, 'Left the table'); publish(room); }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Cardtable listening on ${PORT}`));
