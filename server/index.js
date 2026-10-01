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
  const oldPile = room.piles.find(p => p.id === (payload.fromId || payload.pileId));
  const priorPile = before.piles.find(p => p.id === (payload.fromId || payload.pileId));
  const card = priorPile?.cards.find(c => c.id === payload.cardId) || priorPile?.cards.at(-1);
  const cardName = (value) => value ? `${value.rank || 'Card'}${value.suit || ''}` : 'card';
  const pileName = (pile) => pile?.name || (pile?.kind === 'tableau' ? 'table stack' : 'pile');
  let description = 'Updated the table';
  let details = {};
  if (type === 'draw') { description = 'Drew 1 card'; details = { count: 1 }; }
  else if (type === 'deal') { const recipients = payload.toAll ? [...room.players.values()] : [actor]; description = `Dealt ${payload.count || 1} card${Number(payload.count || 1) === 1 ? '' : 's'} to ${payload.toAll ? 'everyone' : actor.name}`; details = { countPerPlayer: Number(payload.count || 1), recipients: recipients.map(p=>p.name) }; }
  else if (type === 'shuffle') description = `Shuffled ${pileName(priorPile)}`;
  else if (type === 'cut') description = `Cut ${pileName(priorPile)}`;
  else if (type === 'place') { description = `Placed ${cardName(card)} on the table`; details = { cards: [cardName(card)], layout: payload.mode || 'grid', stack: payload.targetId || null }; }
  else if (type === 'return-card') { description = `Returned ${cardName(card)} to the deck`; details = { cards: [cardName(card)] }; }
  else if (type === 'return-stack') { const cards = priorPile?.cards || []; description = `Returned a stack of ${cards.length} cards to ${payload.toId === 'deck' ? 'the deck' : 'discard'}`; details = { cards: cards.map(cardName), count: cards.length, destination: payload.toId }; }
  else if (type === 'move' || type === 'move-card') { const hidden = priorPile?.kind === 'hand' && room.settings.privateHands; description = `Moved ${hidden ? 'a card' : cardName(card)} from ${pileName(priorPile)} to ${pileName(room.piles.find(p=>p.id===payload.toId))}`; details = hidden ? { count: 1 } : { cards: [cardName(card)] }; }
  else if (type === 'flip' || type === 'flip-top') { const hidden = priorPile?.kind === 'hand' && room.settings.privateHands; description = `Turned ${hidden ? 'a card' : cardName(card)} in ${pileName(priorPile)}`; details = hidden ? {} : { cards: [cardName(card)] }; }
  else if (type === 'pile:layout') description = `Changed a stack to ${payload.layout} layout`;
  else if (type === 'pile:move') description = `Moved ${pileName(priorPile)}`;
  else if (type === 'pile:create') description = `Created ${payload.name || 'a shared pile'}`;
  else if (type === 'pile:delete') description = `Deleted an empty ${pileName(priorPile)}`;
  else if (type === 'reset-board') description = 'Reset the board and shuffled a fresh deck';
  else if (type === 'undo') description = 'Undid the previous table action';
  else if (type === 'chat') description = 'Sent a chat message';
  else if (type === 'chat:react') description = `Reacted ${payload.emoji || ''}`;
  else if (type === 'settings') description = 'Changed table settings';
  else if (type === 'sort-hand') description = `Sorted their hand by ${payload.mode}`;
  else if (type === 'hand:reorder') description = 'Reordered their hand';
  else if (type === 'profile') description = 'Changed their profile';
  else if (type === 'move' && oldPile) description = `Moved a card from ${pileName(oldPile)}`;
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString(), playerId, playerName: actor?.name || 'Player', type, description, details };
}
io.on('connection', (socket) => {
  socket.on('room:create', ({ name, playerName, settings }, done = () => {}) => {
    const { room, player } = createRoom(name, playerName || 'Guest', settings);
    socket.data.roomId = room.id; socket.data.playerId = player.id;
    socket.join(`room:${room.id}`); socket.join(`player:${player.id}`);
    done({ ok: true, roomId: room.id, playerId: player.id, room: snapshot(room, player.id) });
  });
  socket.on('room:join', ({ roomId, playerName, playerId }, done = () => {}) => {
    const room = getRoom(String(roomId || '').toUpperCase());
    if (!room) return done({ ok: false, error: 'That table has closed or does not exist.' });
    const player = joinRoom(room, playerName || 'Guest', playerId);
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
    io.to(`room:${room.id}`).emit('table:cue', {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      type: payload.type, playerId,
      pileId: payload.pileId || payload.fromId || (payload.type === 'place' ? payload.targetId : null),
      cardId: payload.cardId || null, toId: payload.toId || null,
      recipientIds: payload.type === 'deal' ? (payload.toAll ? [...room.players.keys()] : [playerId]) : payload.type === 'draw' ? [playerId] : [],
      message: payload.type === 'chat' ? String(payload.message || '').slice(0, 90) : '',
      emoji: payload.type === 'chat:react' ? payload.emoji : '',
      messageId: payload.type === 'chat:react' ? payload.messageId : '',
    });
    publish(room); done(result);
  });
  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomId); const player = room?.players.get(socket.data.playerId);
    if (player) { player.online = false; publish(room); }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Cardtable listening on ${PORT}`));
