import { createDeck, getDeck, shuffle } from './deck.js';
import { sortCards } from '../shared/cardOrder.js';
const findPile = (room, id) => room.piles.find((pile) => pile.id === id);
const reject = (error = 'That table action is not available.') => ({ ok: false, error });
const cleanupEmptyPile = (room, pile) => {
  if (!pile || pile.cards.length || pile.kind === 'deck' || pile.kind === 'hand' || pile.id === 'discard') return;
  const index = room.piles.indexOf(pile);
  if (index >= 0) room.piles.splice(index, 1);
};

export function applyTableAction(room, playerId, payload = {}) {
  if (!room?.players.has(playerId)) return reject('Join a table first.');
  const { type } = payload;
  const isHost = room.hostId === playerId;
  const mayMoveCards = !room.settings.hostControls || isHost;
  if (!['chat', 'chat:react', 'settings', 'sort-hand', 'hand:reorder', 'profile'].includes(type) && !mayMoveCards) return reject('Only the host can move cards at this table.');

  if (type === 'undo') {
    const previous = room.undoStack?.pop();
    if (!previous) return reject('There is nothing to undo.');
    room.piles = previous.piles; room.settings = previous.settings;
    return { ok: true };
  }
  if (type === 'reset-board' && !isHost) return reject('Only the host can reset the board.');
  const undoState = ['chat', 'chat:react', 'profile'].includes(type) ? null : { piles: structuredClone(room.piles), settings: structuredClone(room.settings) };

  if (type === 'shuffle') {
    const pile = findPile(room, payload.pileId || 'deck'); if (!pile) return reject();
    pile.cards = shuffle(pile.cards);
  } else if (type === 'cut') {
    const pile = findPile(room, payload.pileId || 'deck'); if (!pile || pile.cards.length < 2) return reject('There are not enough cards to cut.');
    const midpoint = Math.floor(pile.cards.length / 2); pile.cards = [...pile.cards.slice(midpoint), ...pile.cards.slice(0, midpoint)];
  } else if (type === 'draw' || type === 'deal') {
    const deck = findPile(room, payload.pileId || 'deck'); if (!deck?.cards.length) return reject('The deck is empty.');
    const count = type === 'deal' ? Math.min(Math.max(Number(payload.count) || 1, 1), 13) : 1;
    const recipients = type === 'deal' && payload.toAll ? [...room.players.values()] : [room.players.get(playerId)];
    for (const recipient of recipients) {
      const hand = room.piles.find((pile) => pile.kind === 'hand' && pile.ownerId === recipient.id) || (() => {
        const pile = { id: `hand-${recipient.id}`, name: `${recipient.name}'s hand`, kind: 'hand', ownerId: recipient.id, x: 50, y: 82, cards: [] };
        room.piles.push(pile); return pile;
      })();
      for (let i = 0; i < count && deck.cards.length; i++) {
        const card = deck.cards.pop(); card.ownerId = recipient.id; card.faceUp = true; hand.cards.push(card);
      }
    }
  } else if (type === 'sort-hand') {
    const hand = findPile(room, `hand-${playerId}`); if (!hand) return reject('Your hand is empty.');
    hand.cards = sortCards(hand.cards, payload.mode);
  } else if (type === 'hand:reorder') {
    const hand = findPile(room, `hand-${playerId}`);
    if (!hand) return reject('Your hand is empty.');
    const index = hand.cards.findIndex((card) => card.id === payload.cardId);
    if (index < 0) return reject('That card is no longer in your hand.');
    const [card] = hand.cards.splice(index, 1);
    const beforeIndex = payload.beforeCardId ? hand.cards.findIndex((item) => item.id === payload.beforeCardId) : -1;
    hand.cards.splice(beforeIndex < 0 ? hand.cards.length : beforeIndex, 0, card);
  } else if (type === 'flip') {
    const pile = findPile(room, payload.pileId); const card = pile?.cards.find((item) => item.id === payload.cardId);
    if (!card) return reject('That card is no longer there.');
    card.faceUp = !card.faceUp;
  } else if (type === 'flip-top') {
    const pile = findPile(room, payload.pileId); const card = pile?.cards.at(-1);
    if (!card) return reject('That pile is empty.');
    card.faceUp = !card.faceUp;
  } else if (type === 'pile:layout') {
    const pile = findPile(room, payload.pileId);
    if (pile?.kind !== 'tableau' || !['stack', 'fan', 'grid'].includes(payload.layout)) return reject('Choose a card stack and layout.');
    pile.layout = payload.layout;
  } else if (type === 'pile:delete') {
    const index = room.piles.findIndex((pile) => pile.id === payload.pileId && pile.kind !== 'deck' && pile.kind !== 'hand');
    if (index < 0) return reject('That pile cannot be deleted.');
    if (room.piles[index].cards.length) return reject('Only an empty pile can be deleted.');
    room.piles.splice(index, 1);
  } else if (type === 'return-card') {
    const from = findPile(room, payload.fromId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    const deck = findPile(room, 'deck');
    if (index < 0 || !deck) return reject('That card is no longer there.');
    const [card] = from.cards.splice(index, 1); card.ownerId = null; card.faceUp = false; deck.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'return-stack') {
    const from = findPile(room, payload.pileId), to = findPile(room, payload.toId);
    if (from?.kind !== 'tableau' || !from.cards.length || !['deck', 'discard'].includes(to?.id)) return reject('Choose a stack and the deck or discard pile.');
    for (const card of from.cards) { card.ownerId = null; card.faceUp = to.id === 'discard'; }
    to.cards.push(...from.cards); from.cards = []; cleanupEmptyPile(room, from);
  } else if (type === 'reset-board') {
    const deckDefinition = getDeck(room.settings.deckId);
    room.piles = [
      { id: 'deck', name: deckDefinition.name, kind: 'deck', x: 50, y: 47, cards: shuffle(createDeck(deckDefinition)) },
      { id: 'discard', name: 'Discard', kind: 'shared', x: 66, y: 47, cards: [] },
    ];
  } else if (type === 'move-card') {
    const from = findPile(room, payload.fromId); const to = findPile(room, payload.toId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0 || !to) return reject('Choose an available card and destination.');
    const [card] = from.cards.splice(index, 1);
    if (to.kind === 'hand') { card.ownerId = to.ownerId; card.faceUp = true; }
    else if (to.kind === 'deck') { card.ownerId = null; card.faceUp = false; }
    else if (from.kind === 'hand') card.ownerId = null;
    to.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'place') {
    const from = findPile(room, payload.fromId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0) return reject('That card is no longer there.');
    const mode = ['stack', 'fan'].includes(payload.mode) ? payload.mode : 'grid';
    const target = payload.targetId ? findPile(room, payload.targetId) : null;
    if (mode !== 'grid' && target?.kind !== 'tableau') return reject('Choose a card pile to stack onto.');
    if (mode === 'grid' && (!Number.isFinite(Number(payload.x)) || !Number.isFinite(Number(payload.y)))) return reject('Choose a place on the table first.');
    const [card] = from.cards.splice(index, 1); card.ownerId = null; card.faceUp = true;
    let destination = target;
    if (mode === 'grid') {
      const x = Math.min(94, Math.max(6, Math.round(Number(payload.x) / 3.5) * 3.5));
      const y = Math.min(78, Math.max(18, Math.round(Number(payload.y) / 7.5) * 7.5));
      destination = { id: `table-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: '', kind: 'tableau', layout: 'grid', x, y, cards: [] };
      room.piles.push(destination);
    } else destination.layout = mode;
    destination.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'move') {
    const from = findPile(room, payload.fromId); const to = findPile(room, payload.toId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0 || !to) return reject('Choose an available card and pile.');
    const [card] = from.cards.splice(index, 1);
    if (to.kind === 'hand') { card.ownerId = to.ownerId; card.faceUp = true; }
    else if (to.kind === 'deck') { card.ownerId = null; card.faceUp = false; }
    else if (from.kind === 'hand') card.ownerId = null;
    to.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'pile:create') {
    const index = room.piles.filter((pile) => pile.kind === 'shared').length;
    room.piles.push({ id: `pile-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: (payload.name || `Pile ${index}`).slice(0,24), kind: 'shared', x: 30 + (index % 5) * 10, y: 47 + (index % 2) * 12, cards: [] });
  } else if (type === 'pile:move') {
    const pile = findPile(room, payload.pileId);
    if (!pile || pile.kind === 'hand' || !Number.isFinite(Number(payload.x)) || !Number.isFinite(Number(payload.y))) return reject('Choose a movable pile and a table position.');
    pile.x = Math.min(94, Math.max(6, Number(payload.x))); pile.y = Math.min(78, Math.max(18, Number(payload.y)));
  } else if (type === 'settings') {
    if (!isHost) return reject('Only the host can change table settings.');
    room.settings = { ...room.settings, ...payload.settings };
  } else if (type === 'profile') {
    const player = room.players.get(playerId);
    const palette = ['#e0ad74','#84b6a0','#ce8d91','#9a9dde','#d6c66f','#80a8cf','#c48e59','#7697a8'];
    const animals = ['🐱','🐶','🐻','🐼','🦊','🐸','🐵','🐧','🦉','🐰'];
    if (payload.emoji && !animals.includes(payload.emoji)) return reject('Choose one of the available animal avatars.');
    if (payload.color && !palette.includes(payload.color)) return reject('Choose one of the available profile colors.');
    if (payload.emoji) player.emoji = payload.emoji;
    if (payload.color) player.color = payload.color;
  } else if (type === 'chat') {
    const message = String(payload.message || '').trim().slice(0, 400); if (!message) return reject();
    const player = room.players.get(playerId);
    room.chat.push({ id: `${Date.now()}-${Math.random()}`, playerId, name: player.name, color: player.color, message, time: Date.now(), reactions: {} });
  } else if (type === 'chat:react') {
    const message = room.chat.find((item) => item.id === payload.messageId);
    const emoji = typeof payload.emoji === 'string' && payload.emoji.length <= 16 && /\p{Extended_Pictographic}/u.test(payload.emoji) && !/[\p{Cc}\s]/u.test(payload.emoji) ? payload.emoji : null;
    if (!message || !emoji) return reject('Choose a message and a reaction.');
    message.reactions ||= {};
    const players = message.reactions[emoji] ||= [];
    const existing = players.indexOf(playerId);
    if (existing >= 0) players.splice(existing, 1); else players.push(playerId);
    if (!players.length) delete message.reactions[emoji];
  } else return reject('Unknown table action.');

  if (undoState) { room.undoStack ||= []; room.undoStack.push(undoState); if (room.undoStack.length > 30) room.undoStack.shift(); }
  return { ok: true };
}
