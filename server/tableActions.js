import { createDeck, getDeck, shuffle } from './deck.js';
import { sortCards } from '../shared/cardOrder.js';
const findPile = (room, id) => room.piles.find((pile) => pile.id === id);
const emojiSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const isEmojiReaction = (value) => typeof value === 'string' && value.length <= 16 && [...emojiSegments.segment(value)].length === 1 && /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(value);
const reject = (error = 'That table action is not available.') => ({ ok: false, error });
const cleanupEmptyPile = (room, pile) => {
  if (!pile || pile.cards.length || pile.kind === 'deck' || pile.kind === 'hand' || pile.id === 'discard') return;
  const index = room.piles.indexOf(pile);
  if (index >= 0) room.piles.splice(index, 1);
};
function pruneFanGroups(pile, removedIds) {
  if (!Array.isArray(pile?.fanGroups)) return;
  const removed = new Set(removedIds);
  pile.fanGroups = pile.fanGroups.map((group) => group.filter((id) => !removed.has(id))).filter((group) => group.length);
  if (!pile.fanGroups.length) delete pile.fanGroups;
}
function ensureHand(room, ownerId) {
  return findPile(room, `hand-${ownerId}`) || (() => {
    const owner = room.players.get(ownerId);
    const hand = { id:`hand-${ownerId}`, name:`${owner.name}'s hand`, kind:'hand', ownerId, x:50, y:82, cards:[] };
    room.piles.push(hand);
    return hand;
  })();
}
function takeCards(room, playerId, selections) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 500) return null;
  const unique = new Set();
  const cards = [];
  for (const selection of selections) {
    if (!selection?.cardId || unique.has(selection.cardId)) return null;
    unique.add(selection.cardId);
    const from = findPile(room, selection.fromId);
    if (!from || (from.kind==='hand' && from.ownerId!==playerId)) return null;
    const card = from.cards.find(item=>item.id===selection.cardId);
    if (!card) return null;
    cards.push({ card, from });
  }
  for (const {card,from} of cards) from.cards.splice(from.cards.findIndex(item=>item.id===card.id),1);
  for (const from of new Set(cards.map(item=>item.from))) pruneFanGroups(from,cards.filter(item=>item.from===from).map(item=>item.card.id));
  return { cards:cards.map(item=>item.card), sources:[...new Set(cards.map(item=>item.from))] };
}

export function applyTableAction(room, playerId, payload = {}) {
  if (!room?.players.has(playerId)) return reject('Join a table first.');
  const { type } = payload;
  const isHost = room.hostId === playerId;
  const mayMoveCards = !room.settings.hostControls || isHost;
  if (!['chat', 'chat:react', 'settings', 'sort-hand', 'hand:reorder', 'hand:reorder-cards', 'profile'].includes(type) && !mayMoveCards) return reject('Only the host can move cards at this table.');

  if (type === 'undo') {
    const previous = room.undoStack?.pop();
    if (!previous) return reject('There is nothing to undo.');
    room.piles = previous.piles;
    if(previous.settings)room.settings = previous.settings;
    return { ok: true };
  }
  if (type === 'reset-board' && !isHost) return reject('Only the host can reset the board.');
  const undoState = ['chat', 'chat:react', 'profile', 'settings'].includes(type) ? null : { piles: structuredClone(room.piles) };

  if (type === 'shuffle') {
    const pile = findPile(room, payload.pileId || 'deck'); if (!pile) return reject();
    pile.cards = shuffle(pile.cards);
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
  } else if (type === 'hand:reorder-cards') {
    const hand=findPile(room,`hand-${playerId}`),ids=payload.cardIds;
    if(!hand||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!hand.cards.some(card=>card.id===id)))return reject('One or more selected cards are no longer in your hand.');
    const moving=new Set(ids),ordered=hand.cards.filter(card=>moving.has(card.id));
    if(payload.beforeCardId&&moving.has(payload.beforeCardId))return {ok:true};
    const remaining=hand.cards.filter(card=>!moving.has(card.id));
    const beforeIndex=payload.beforeCardId?remaining.findIndex(card=>card.id===payload.beforeCardId):-1;
    remaining.splice(beforeIndex<0?remaining.length:beforeIndex,0,...ordered);hand.cards=remaining;
  } else if (type === 'flip') {
    const pile = findPile(room, payload.pileId); const card = pile?.cards.find((item) => item.id === payload.cardId);
    if (!card||(pile.kind==='hand'&&pile.ownerId!==playerId)) return reject('That card is no longer available.');
    card.faceUp = !card.faceUp;
  } else if (type === 'flip-top') {
    const pile = findPile(room, payload.pileId); const card = pile?.cards.at(-1);
    if (!card||(pile.kind==='hand'&&pile.ownerId!==playerId)) return reject('That pile is empty or unavailable.');
    card.faceUp = !card.faceUp;
  } else if (type === 'flip-cards') {
    if (!Array.isArray(payload.cards)||!payload.cards.length) return reject('Choose one or more cards first.');
    if(new Set(payload.cards.map(item=>item.cardId)).size!==payload.cards.length)return reject('A selected card can only be flipped once.');
    const selected=payload.cards.map(selection=>({selection,pile:findPile(room,selection.fromId)}));
    if (selected.some(({selection,pile})=>!pile||(pile.kind==='hand'&&pile.ownerId!==playerId)||!pile.cards.some(card=>card.id===selection.cardId))) return reject('One or more selected cards are no longer available.');
    for (const {selection,pile} of selected) pile.cards.find(card=>card.id===selection.cardId).faceUp=!pile.cards.find(card=>card.id===selection.cardId).faceUp;
  } else if (type === 'pile:layout') {
    const pile = findPile(room, payload.pileId);
    if (pile?.kind !== 'tableau' || !['stack', 'fan', 'fan-stack', 'grid'].includes(payload.layout)) return reject('Choose a card stack and layout.');
    pile.layout = payload.layout;
    if (payload.layout === 'fan-stack') pile.fanGroups ||= pile.cards.length ? [pile.cards.map(card=>card.id)] : [];
    else delete pile.fanGroups;
  } else if (type === 'pile:split-top-fan') {
    const pile=findPile(room,payload.pileId);
    if(pile?.kind!=='tableau'||pile.layout!=='fan-stack'||!Array.isArray(pile.fanGroups)||pile.fanGroups.length<2)return reject('This stack needs at least two fans to separate.');
    const ids=pile.fanGroups.pop(),moving=new Set(ids),cards=ids.map(id=>pile.cards.find(card=>card.id===id)).filter(Boolean);
    if(!cards.length)return reject('That fan is empty.');
    pile.cards=pile.cards.filter(card=>!moving.has(card.id));
    room.piles.push({id:`table-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:'',kind:'tableau',layout:'fan',x:Math.min(94,pile.x+4),y:Math.min(78,pile.y+4),cards});
    if(pile.fanGroups.length<2){pile.layout='fan';delete pile.fanGroups;}
  } else if (type === 'pile:delete') {
    const index = room.piles.findIndex((pile) => pile.id === payload.pileId && pile.kind !== 'deck' && pile.kind !== 'hand');
    if (index < 0) return reject('That pile cannot be deleted.');
    if (room.piles[index].cards.length) return reject('Only an empty pile can be deleted.');
    room.piles.splice(index, 1);
  } else if (type === 'return-card') {
    const from = findPile(room, payload.fromId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    const deck = findPile(room, 'deck');
    if (index < 0 || !deck||(from.kind==='hand'&&from.ownerId!==playerId)) return reject('That card is no longer available.');
    const [card] = from.cards.splice(index, 1); pruneFanGroups(from,[card.id]); card.ownerId = null; card.faceUp = false; deck.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'move-stack') {
    const from=findPile(room,payload.fromId);let to=findPile(room,payload.toId);
    if(from?.kind!=='tableau'||!from.cards.length||to===from)return reject('Choose a non-empty card stack and destination.');
    if(!to&&payload.toId===`hand-${playerId}`)to=ensureHand(room,playerId);
    if(!to||to.kind==='hand'&&to.ownerId!==playerId)return reject('You can only move a stack into your own hand.');
    const cards=[...from.cards],sourceGroups=from.layout==='fan-stack'&&from.fanGroups?.length?from.fanGroups.map(group=>[...group]):[cards.map(card=>card.id)];
    if(to.kind==='hand'){for(const card of cards){card.ownerId=to.ownerId;card.faceUp=true;}}
    else if(to.kind==='deck'){for(const card of cards){card.ownerId=null;card.faceUp=false;}}
    else if(to.id==='discard'){for(const card of cards){card.ownerId=null;card.faceUp=true;}}
    else if(to.kind==='tableau'){
      if(payload.mode==='fan-stack'){
        to.layout='fan-stack';to.fanGroups ||= to.cards.length?[to.cards.map(card=>card.id)]:[];to.fanGroups.push(...sourceGroups);
      }else if(payload.mode==='fan'){to.layout='fan';delete to.fanGroups;}
      else{to.layout='stack';delete to.fanGroups;}
      for(const card of cards){card.ownerId=null;card.faceUp=true;}
    }else for(const card of cards){card.ownerId=null;card.faceUp=true;}
    to.cards.push(...cards);from.cards=[];delete from.fanGroups;cleanupEmptyPile(room,from);
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
    const from = findPile(room, payload.fromId); let to = findPile(room, payload.toId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0 || (from?.kind==='hand'&&from.ownerId!==playerId)) return reject('Choose an available card and destination.');
    if (from === to) return reject('That card is already in this pile.');
    if (to?.kind==='tableau') return reject('Use placement to add cards to a table stack.');
    if(to?.kind==='hand'&&to.ownerId!==playerId)return reject('You can only move cards into your own hand.');
    if (!to && payload.toId===`hand-${playerId}`) to=ensureHand(room,playerId);
    if (!to) return reject('Choose an available card and destination.');
    const [card] = from.cards.splice(index, 1); pruneFanGroups(from,[card.id]);
    if (to.kind === 'hand') { card.ownerId = to.ownerId; card.faceUp = true; }
    else if (to.kind === 'deck') { card.ownerId = null; card.faceUp = false; }
    else if (from.kind === 'hand') card.ownerId = null;
    to.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'place') {
    const from = findPile(room, payload.fromId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0||(from.kind==='hand'&&from.ownerId!==playerId)) return reject('That card is no longer available.');
    const mode = ['stack', 'fan', 'fan-stack'].includes(payload.mode) ? payload.mode : 'grid';
    const target = payload.targetId ? findPile(room, payload.targetId) : null;
    if (mode !== 'grid' && target?.kind !== 'tableau') return reject('Choose a card pile to stack onto.');
    if (mode === 'grid' && (!Number.isFinite(Number(payload.x)) || !Number.isFinite(Number(payload.y)))) return reject('Choose a place on the table first.');
    const [card] = from.cards.splice(index, 1); pruneFanGroups(from,[card.id]); card.ownerId = null; card.faceUp = true;
    let destination = target;
    if (mode === 'grid') {
      const x = Math.min(94, Math.max(6, Math.round(Number(payload.x) / 3.5) * 3.5));
      const y = Math.min(78, Math.max(18, Math.round(Number(payload.y) / 7.5) * 7.5));
      destination = { id: `table-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: '', kind: 'tableau', layout: 'grid', x, y, cards: [] };
      room.piles.push(destination);
    } else if(mode==='fan-stack'){
      destination.fanGroups ||= destination.cards.length?[destination.cards.map(item=>item.id)]:[];
      destination.layout='fan-stack';destination.fanGroups.push([card.id]);
    } else { destination.layout = mode; delete destination.fanGroups; }
    destination.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'move-cards') {
    let to=findPile(room,payload.toId);
    if (!to && payload.toId!==`hand-${playerId}`) return reject('Choose an available destination.');
    if(to?.kind==='tableau')return reject('Use placement to add cards to a table stack.');
    if(to?.kind==='hand'&&to.ownerId!==playerId)return reject('You can only move cards into your own hand.');
    if (payload.cards?.every(selection=>selection.fromId===payload.toId)) return reject('Those cards are already there.');
    const taken=takeCards(room,playerId,payload.cards);
    if (!taken) return reject('One or more selected cards are no longer available.');
    if (!to) to=ensureHand(room,playerId);
    const cards=taken.cards;
    for (const card of cards) {
      if (to.kind==='hand') { card.ownerId=to.ownerId; card.faceUp=true; }
      else if (to.kind==='deck') { card.ownerId=null; card.faceUp=false; }
      else if (to.id==='discard') { card.ownerId=null; card.faceUp=true; }
      else if (card.ownerId) card.ownerId=null;
    }
    to.cards.push(...cards);
    for (const source of taken.sources) if (source!==to) cleanupEmptyPile(room,source);
  } else if (type === 'place-cards') {
    const mode=['stack','fan','fan-stack'].includes(payload.mode)?payload.mode:'grid';
    const target=payload.targetId?findPile(room,payload.targetId):null;
    if (mode!=='grid'&&target?.kind!=='tableau') return reject('Choose a card pile to stack onto.');
    if (mode==='grid'&&(!Number.isFinite(Number(payload.x))||!Number.isFinite(Number(payload.y)))) return reject('Choose a place on the table first.');
    const taken=takeCards(room,playerId,payload.cards);
    if (!taken) return reject('One or more selected cards are no longer available.');
    const cards=taken.cards;
    for (const card of cards) { card.ownerId=null;card.faceUp=true; }
    let destination=target;
    if (mode==='grid') {
      const x=Math.min(94,Math.max(6,Math.round(Number(payload.x)/3.5)*3.5));
      const y=Math.min(78,Math.max(18,Math.round(Number(payload.y)/7.5)*7.5));
      const fromHand=taken.sources.length>0&&taken.sources.every(source=>source.kind==='hand');
      const layout=cards.length>1?(fromHand?'fan':'stack'):'grid';
      destination={id:`table-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:'',kind:'tableau',layout,x,y,cards:[]};
      room.piles.push(destination);
    } else if(mode==='fan-stack'){
      destination.fanGroups ||= destination.cards.length?[destination.cards.map(card=>card.id)]:[];
      destination.layout='fan-stack';destination.fanGroups.push(cards.map(card=>card.id));
    } else {destination.layout=mode;delete destination.fanGroups;}
    destination.cards.push(...cards);
    for (const source of taken.sources) if (source!==destination) cleanupEmptyPile(room,source);
  } else if (type === 'move') {
    const from = findPile(room, payload.fromId); let to = findPile(room, payload.toId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0 || (from?.kind==='hand'&&from.ownerId!==playerId)) return reject('Choose an available card and pile.');
    if (from === to) return reject('That card is already in this pile.');
    if (to?.kind==='tableau') return reject('Use placement to add cards to a table stack.');
    if(to?.kind==='hand'&&to.ownerId!==playerId)return reject('You can only move cards into your own hand.');
    if (!to && payload.toId===`hand-${playerId}`) to=ensureHand(room,playerId);
    if (!to) return reject('Choose an available card and pile.');
    const [card] = from.cards.splice(index, 1); pruneFanGroups(from,[card.id]);
    if (to.kind === 'hand') { card.ownerId = to.ownerId; card.faceUp = true; }
    else if (to.kind === 'deck') { card.ownerId = null; card.faceUp = false; }
    else if (from.kind === 'hand') card.ownerId = null;
    to.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'pile:create') {
    const index = room.piles.filter((pile) => pile.kind === 'shared').length;
    room.piles.push({ id: `pile-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: (payload.name || `Pile ${index}`).slice(0,24), kind: 'shared', x: 30 + (index % 5) * 10, y: 47 + (index % 2) * 12, cards: [] });
  } else if (type === 'pile:rename') {
    const pile=findPile(room,payload.pileId),name=String(payload.name||'').trim().slice(0,24);
    if(!pile||pile.kind!=='shared'||!name)return reject('Choose a valid name for this pile.');
    pile.name=name;
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
    const emoji = isEmojiReaction(payload.emoji) ? payload.emoji : null;
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
