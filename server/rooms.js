import { randomUUID } from 'node:crypto';
import { createDeck, getDeck, shuffle } from './deck.js';

const ROOM_TTL = 45 * 60 * 1000;
const rooms = new Map();
const colors = ['#e0ad74','#84b6a0','#ce8d91','#9a9dde','#d6c66f','#80a8cf'];
const animals = ['🐱','🐶','🐻','🐼','🦊','🐸','🐵','🐧','🦉','🐰'];
function uniqueName(room, requested, excludeId = '') {
  const base = String(requested || 'Guest').trim().slice(0, 24) || 'Guest';
  const used = new Set([...room.players.values()].filter(p => p.id !== excludeId).map(p => p.name.toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  for (let n = 1; n < 10000; n++) {
    const suffix = ` (${n})`, candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${base.slice(0, 16)} (${Date.now() % 100000})`;
}

function publicRoom(room, viewerId) {
  const settings = room.settings;
  return {
    id: room.id, name: room.name, hostId: room.hostId, settings, canUndo: room.undoStack?.length > 0,
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, emoji: p.emoji || '', online: p.online,
      handCount: room.piles.find((pile) => pile.kind === 'hand' && pile.ownerId === p.id)?.cards.length || 0,
    })),
    piles: room.piles.map((pile) => ({ ...pile, cards: pile.cards.map((card) => {
      const isPrivateHand = pile.kind === 'hand' && settings.privateHands && pile.ownerId !== viewerId;
      const isFaceDown = pile.kind !== 'hand' && !card.faceUp;
      if (!isPrivateHand && !isFaceDown) return card;
      // Keep the opaque card id for interactions, but never send identity data
      // for cards the viewer isn't allowed to see (including the deck order).
      return { ...card, rank: null, suit: null, color: 'back', faceUp: false, ownerId: null };
    }) })),
    chat: room.chat.slice(-100), ledger: room.ledger.slice(-500).map((entry)=>{
      const { cardItems, ...details } = entry.details || {};
      const hidden = cardItems?.some((item)=>item.privateToPlayerId==='__private__'||(settings.privateHands&&item.privateToPlayerId&&item.privateToPlayerId!==viewerId));
      const cards = cardItems?.map((item)=>item.privateToPlayerId==='__private__'||(settings.privateHands&&item.privateToPlayerId&&item.privateToPlayerId!==viewerId)?'Hidden card':item.label) || details.cards;
      const { privateDescription, ...visibleEntry }=entry;
      return { ...visibleEntry, description:hidden?(privateDescription||entry.description):entry.description, details: { ...details, ...(cards?{cards}:{}), cardItems:undefined } };
    }), updatedAt: room.updatedAt,
  };
}

export function getRoom(id) { return rooms.get(id); }
export function snapshot(room, viewerId) { return publicRoom(room, viewerId); }
export function createRoom(name, playerName, settings = {}) {
  const id = randomUUID().slice(0, 8).toUpperCase();
  const deckDefinition = getDeck(settings.deckId);
  const player = { id: randomUUID(), name: playerName.slice(0, 24), color: colors[0], emoji: animals[0], online: true };
  const room = {
    id, name: (name || 'A new table').slice(0, 36), hostId: player.id,
    settings: { privateHands: true, hostControls: false, ...settings, deckId: deckDefinition.id },
    players: new Map([[player.id, player]]),
    piles: [
      { id: 'deck', name: deckDefinition.name, kind: 'deck', x: 50, y: 47, cards: shuffle(createDeck(deckDefinition)) },
      { id: 'discard', name: 'Discard', kind: 'shared', x: 66, y: 47, cards: [] },
    ], chat: [], ledger: [], undoStack: [], updatedAt: Date.now(), timer: null,
  };
  rooms.set(id, room);
  return { room, player };
}
export function joinRoom(room, playerName, requestedId) {
  let player = room.players.get(requestedId);
  if (!player) {
    player = { id: randomUUID(), name: uniqueName(room, playerName), color: colors[room.players.size % colors.length], emoji: animals[room.players.size % animals.length], online: true };
    room.players.set(player.id, player);
  }
  player.name = uniqueName(room, playerName || player.name, player.id);
  player.online = true;
  room.updatedAt = Date.now();
  clearTimeout(room.timer);
  return player;
}
export function touch(room) { room.updatedAt = Date.now(); }
export function pruneRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if ([...room.players.values()].every((p) => !p.online) && now - room.updatedAt > ROOM_TTL) rooms.delete(id);
  }
}
setInterval(pruneRooms, 60_000).unref();
