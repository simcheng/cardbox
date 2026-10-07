import { createDeck, getDeck, shuffle } from './deck.js';
import { sortCards } from '../shared/cardOrder.js';
const findPile = (room, id) => room.piles.find((pile) => pile.id === id);
const isDiscardPile = (pile) => pile?.id === 'discard' || pile?.pileType === 'discard';
const emojiSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const isEmojiReaction = (value) => typeof value === 'string' && value.length <= 16 && [...emojiSegments.segment(value)].length === 1 && /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(value);
const reject = (error = 'That table action is not available.') => ({ ok: false, error });
const cleanupEmptyPile = (room, pile) => {
  if (!pile || pile.cards.length || pile.kind === 'deck' || pile.kind === 'hand' || isDiscardPile(pile)) return;
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
    if(from.kind==='deck'&&(from.cards.at(-1)?.id!==card.id||cards.some(item=>item.from===from)))return null;
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
  room.cohostIds ||= new Set();
  const isCohost = room.cohostIds.has(playerId);
  const isModerator = isHost || isCohost;
  const mayMoveCards = !room.settings.hostControls || isModerator;
  if (!['chat', 'chat:react', 'settings', 'sort-hand', 'hand:reorder', 'hand:reorder-cards', 'profile', 'host:assign', 'player:kick'].includes(type) && !mayMoveCards) return reject('Only the host or a cohost can move cards at this table.');

  if (type === 'undo') {
    const previous = room.undoStack?.pop();
    if (!previous) return reject('There is nothing to undo.');
    room.piles = previous.piles;
    if(previous.settings)room.settings = previous.settings;
    return { ok: true };
  }
  if (type === 'reset-board' && !isModerator) return reject('Only the host or a cohost can reset the board.');
  const undoState = ['chat', 'chat:react', 'profile', 'settings', 'host:assign', 'player:kick'].includes(type) ? null : { piles: structuredClone(room.piles) };

  if (type === 'shuffle') {
    const pile = findPile(room, 'deck'); if (!pile) return reject();
    pile.cards = shuffle(pile.cards);
  } else if (type === 'draw' || type === 'deal') {
    const deck = findPile(room, 'deck'); if (!deck?.cards.length) return reject('The deck is empty.');
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
  } else if (type === 'pile:sort') {
    const pile=findPile(room,payload.pileId);
    if(pile?.kind!=='tableau'||!['suit','rank'].includes(payload.mode))return reject('Choose a card stack and sort order.');
    if(pile.layout==='fan-stack'&&pile.fanGroups?.length){
      pile.fanGroups=pile.fanGroups.map(group=>sortCards(group.map(id=>pile.cards.find(card=>card.id===id)).filter(Boolean),payload.mode).map(card=>card.id));
      const orderedIds=pile.fanGroups.flat();pile.cards=orderedIds.map(id=>pile.cards.find(card=>card.id===id)).filter(Boolean);
    }else pile.cards=sortCards(pile.cards,payload.mode);
  } else if(type==='selection:flip'){
    if(payload.cards!==undefined&&!Array.isArray(payload.cards)||payload.pileIds!==undefined&&!Array.isArray(payload.pileIds))return reject('Choose available selected cards and piles.');
    const cards=payload.cards||[],pileIds=[...new Set(payload.pileIds||[])],piles=pileIds.map(id=>findPile(room,id));
    if(!cards.length&&!pileIds.length||pileIds.length!==(payload.pileIds||[]).length||piles.some(pile=>pile?.kind!=='tableau'))return reject('Choose available selected cards and piles.');
    const pileCardIds=new Set(piles.flatMap(pile=>pile.cards.map(card=>card.id)));
    if(cards.some(item=>pileCardIds.has(item.cardId))||new Set(cards.map(item=>item.cardId)).size!==cards.length)return reject('A selected card can only be flipped once.');
    const selected=cards.map(selection=>({selection,pile:findPile(room,selection.fromId)}));
    if(selected.some(({selection,pile})=>!pile||(pile.kind==='hand'&&pile.ownerId!==playerId)||!pile.cards.some(card=>card.id===selection.cardId)||(pile.kind==='deck'&&(pile.cards.at(-1)?.id!==selection.cardId||cards.filter(item=>item.fromId===pile.id).length>1))))return reject('One or more selected cards are no longer available.');
    for(const {selection,pile} of selected){const card=pile.cards.find(item=>item.id===selection.cardId);card.faceUp=!card.faceUp;}
    for(const pile of piles)for(const card of pile.cards)card.faceUp=!card.faceUp;
  } else if(type==='selection:move'){
    if(payload.cards!==undefined&&!Array.isArray(payload.cards)||payload.pileIds!==undefined&&!Array.isArray(payload.pileIds))return reject('Choose available selected cards and piles.');
    const cards=payload.cards||[],pileIds=[...new Set(payload.pileIds||[])],piles=pileIds.map(id=>findPile(room,id));
    if(!cards.length&&!pileIds.length||pileIds.length!==(payload.pileIds||[]).length||piles.some(pile=>pile?.kind!=='tableau'))return reject('Choose available selected cards and piles.');
    const pileCardIds=new Set(piles.flatMap(pile=>pile.cards.map(card=>card.id)));
    if(cards.some(item=>pileCardIds.has(item.cardId)))return reject('A selected pile already contains one of the selected cards.');
    if(payload.toId!==`hand-${playerId}`&&!['deck','discard'].includes(payload.toId))return reject('Choose your hand, the deck, or discard.');
    const taken=cards.length?takeCards(room,playerId,cards):{cards:[],sources:[]};
    if(!taken)return reject('One or more selected cards are no longer available.');
    const to=payload.toId===`hand-${playerId}`?ensureHand(room,playerId):findPile(room,payload.toId);
    if(!to)return reject('Choose your hand, the deck, or discard.');
    const moving=[...taken.cards,...piles.flatMap(pile=>pile.cards)];
    for(const card of moving){if(to.kind==='hand'){card.ownerId=to.ownerId;card.faceUp=true;}else if(to.kind==='deck'){card.ownerId=null;card.faceUp=false;}else{card.ownerId=null;card.faceUp=true;}}
    to.cards.push(...moving);
    for(const source of taken.sources)if(source!==to)cleanupEmptyPile(room,source);
    for(const pile of piles){pile.cards=[];delete pile.fanGroups;cleanupEmptyPile(room,pile);}
  } else if(type==='pile:batch'){
    const ids=[...new Set(payload.pileIds||[])],piles=ids.map(id=>findPile(room,id));
    if(!ids.length||ids.length!==payload.pileIds?.length||piles.some(pile=>pile?.kind!=='tableau'))return reject('Choose valid selected card piles.');
    if(payload.operation==='layout'&&['fan','stack'].includes(payload.layout)){
      for(const pile of piles){pile.layout=payload.layout;delete pile.fanGroups;}
    }else if(payload.operation==='sort'&&['suit','rank'].includes(payload.mode)){
      for(const pile of piles){if(pile.layout==='fan-stack'&&pile.fanGroups?.length){pile.fanGroups=pile.fanGroups.map(group=>sortCards(group.map(id=>pile.cards.find(card=>card.id===id)).filter(Boolean),payload.mode).map(card=>card.id));pile.cards=pile.fanGroups.flat().map(id=>pile.cards.find(card=>card.id===id)).filter(Boolean);}else pile.cards=sortCards(pile.cards,payload.mode);}
    }else if(payload.operation==='move'&&['hand','discard','deck'].includes(payload.to)){
      const to=payload.to==='hand'?ensureHand(room,playerId):findPile(room,payload.to);
      const cards=piles.flatMap(pile=>pile.cards);
      for(const card of cards){card.ownerId=payload.to==='hand'?playerId:null;card.faceUp=payload.to!=='deck';}
      to.cards.push(...cards);
      for(const pile of piles){pile.cards=[];delete pile.fanGroups;cleanupEmptyPile(room,pile);}
    }else return reject('Choose a valid action for the selected piles.');
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
    if (!card||(pile.kind==='hand'&&pile.ownerId!==playerId)||(pile.kind==='deck'&&pile.cards.at(-1)?.id!==card.id)) return reject('That card is no longer available.');
    card.faceUp = !card.faceUp;
  } else if (type === 'flip-top') {
    const pile = findPile(room, payload.pileId); const card = pile?.cards.at(-1);
    if (!card||(pile.kind==='hand'&&pile.ownerId!==playerId)) return reject('That pile is empty or unavailable.');
    card.faceUp = !card.faceUp;
  } else if (type === 'flip-cards') {
    if (!Array.isArray(payload.cards)||!payload.cards.length) return reject('Choose one or more cards first.');
    if(new Set(payload.cards.map(item=>item.cardId)).size!==payload.cards.length)return reject('A selected card can only be flipped once.');
    const selected=payload.cards.map(selection=>({selection,pile:findPile(room,selection.fromId)}));
    if (selected.some(({selection,pile})=>!pile||(pile.kind==='hand'&&pile.ownerId!==playerId)||!pile.cards.some(card=>card.id===selection.cardId)||(pile.kind==='deck'&&pile.cards.at(-1)?.id!==selection.cardId)||payload.cards.filter(item=>item.fromId===pile?.id).length>1)) return reject('One or more selected cards are no longer available.');
    for (const {selection,pile} of selected) pile.cards.find(card=>card.id===selection.cardId).faceUp=!pile.cards.find(card=>card.id===selection.cardId).faceUp;
  } else if (type === 'pile:layout') {
    const pile = findPile(room, payload.pileId);
    if (pile?.kind !== 'tableau' || !['stack', 'fan', 'fan-stack', 'grid'].includes(payload.layout)) return reject('Choose a card stack and layout.');
    pile.layout = payload.layout;
    if(Number.isFinite(Number(payload.x)))pile.x=Math.min(94,Math.max(6,Number(payload.x)));
    if(Number.isFinite(Number(payload.y)))pile.y=Math.min(78,Math.max(18,Number(payload.y)));
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
    const index = room.piles.findIndex((pile) => pile.id === payload.pileId && pile.kind !== 'deck' && pile.kind !== 'hand' && pile.id !== 'discard');
    if (index < 0) return reject('That pile cannot be deleted.');
    if (room.piles[index].cards.length) return reject('Only an empty pile can be deleted.');
    room.piles.splice(index, 1);
  } else if (type === 'return-card') {
    const from = findPile(room, payload.fromId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    const deck = findPile(room, 'deck');
    if (index < 0 || !deck||(from.kind==='hand'&&from.ownerId!==playerId)||(from.kind==='deck'&&index!==from.cards.length-1)) return reject('That card is no longer available.');
    const [card] = from.cards.splice(index, 1); pruneFanGroups(from,[card.id]); card.ownerId = null; card.faceUp = false; deck.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'move-stack') {
    const from=findPile(room,payload.fromId);let to=findPile(room,payload.toId);
    if(from?.kind!=='tableau'||!from.cards.length||to===from)return reject('Choose a non-empty card stack and destination.');
    if(!to&&payload.toId===`hand-${playerId}`)to=ensureHand(room,playerId);
    if(!to||to.kind==='hand'&&to.ownerId!==playerId)return reject('You can only move a stack into your own hand.');
    const cards=[...from.cards],sourceGroups=from.layout==='fan-stack'&&from.fanGroups?.length?from.fanGroups.map(group=>[...group]):[cards.map(card=>card.id)];
    if(to.kind==='hand'){for(const card of cards){card.ownerId=to.ownerId;card.faceUp=true;}}
    else if(to.kind==='deck'){for(const card of cards){card.ownerId=null;card.faceUp=false;}}
    else if(isDiscardPile(to)){for(const card of cards){card.ownerId=null;card.faceUp=true;}}
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
    if (from?.kind !== 'tableau' || !from.cards.length || !(to?.id==='deck'||isDiscardPile(to))) return reject('Choose a stack and the deck or discard pile.');
    for (const card of from.cards) { card.ownerId = null; card.faceUp = isDiscardPile(to); }
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
    if (index < 0 || (from?.kind==='hand'&&from.ownerId!==playerId)||(from?.kind==='deck'&&index!==from.cards.length-1)) return reject('Choose an available card and destination.');
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
    if (index < 0||(from.kind==='hand'&&from.ownerId!==playerId)||(from.kind==='deck'&&index!==from.cards.length-1)) return reject('That card is no longer available.');
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
      else if (isDiscardPile(to)) { card.ownerId=null; card.faceUp=true; }
      else if (card.ownerId) card.ownerId=null;
    }
    to.cards.push(...cards);
    for (const source of taken.sources) if (source!==to) cleanupEmptyPile(room,source);
  } else if (type === 'place-cards') {
    const mode=['stack','fan','fan-stack','insert'].includes(payload.mode)?payload.mode:'grid';
    const target=payload.targetId?findPile(room,payload.targetId):null;
    if (mode!=='grid'&&target?.kind!=='tableau') return reject('Choose a card pile to stack onto.');
    if(mode==='insert'&&(!['fan','fan-stack'].includes(target.layout)))return reject('Choose a fan to insert cards into.');
    if (mode==='grid'&&(!Number.isFinite(Number(payload.x))||!Number.isFinite(Number(payload.y)))) return reject('Choose a place on the table first.');
    const priorTargetCards=target?[...target.cards.map(card=>card.id)]:[];
    const priorGroups=target?.layout==='fan-stack'?(target.fanGroups||[priorTargetCards]):null;
    const requestedGroup=priorGroups?.[Math.max(0,Number(payload.fanGroup)||0)]||priorTargetCards;
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
    } else if(mode==='insert'&&target.layout==='fan-stack'){
      target.fanGroups ||= priorGroups?.map(group=>group.filter(id=>target.cards.some(card=>card.id===id))).filter(group=>group.length)||[];
      let groupIndex=target.fanGroups.findIndex(group=>group.some(id=>requestedGroup.includes(id)));
      if(groupIndex<0){groupIndex=Math.min(target.fanGroups.length,Math.max(0,Number(payload.fanGroup)||0));target.fanGroups.splice(groupIndex,0,[]);}
      const group=target.fanGroups[groupIndex];
      const at=Math.min(group.length,Math.max(0,Number(payload.insertAt)||0));
      const beforeId=group[at];const lastGroupIndex=target.cards.findIndex(card=>card.id===group.at(-1));const nextGroup=target.fanGroups[groupIndex+1]||[];const nextGroupIndex=target.cards.findIndex(card=>card.id===nextGroup[0]);const flatIndex=beforeId?target.cards.findIndex(card=>card.id===beforeId):lastGroupIndex<0?(nextGroupIndex<0?target.cards.length:nextGroupIndex):lastGroupIndex+1;
      group.splice(at,0,...cards.map(card=>card.id));target.cards.splice(Math.max(0,flatIndex),0,...cards);
    } else if(mode==='insert'){
      const at=Math.min(destination.cards.length,Math.max(0,Number(payload.insertAt)||0));destination.cards.splice(at,0,...cards);
    } else if(mode==='fan-stack'){
      destination.fanGroups ||= destination.cards.length?[destination.cards.map(card=>card.id)]:[];
      destination.layout='fan-stack';destination.fanGroups.push(cards.map(card=>card.id));
    } else {destination.layout=mode;delete destination.fanGroups;}
    if(mode!=='insert')destination.cards.push(...cards);
    for (const source of taken.sources) if (source!==destination) cleanupEmptyPile(room,source);
  } else if (type === 'move') {
    const from = findPile(room, payload.fromId); let to = findPile(room, payload.toId);
    const index = from?.cards.findIndex((card) => card.id === payload.cardId) ?? -1;
    if (index < 0 || (from?.kind==='hand'&&from.ownerId!==playerId)||(from?.kind==='deck'&&index!==from.cards.length-1)) return reject('Choose an available card and pile.');
    if (from === to) return reject('That card is already in this pile.');
    if (to?.kind==='tableau') return reject('Use placement to add cards to a table stack.');
    if(to?.kind==='hand'&&to.ownerId!==playerId)return reject('You can only move cards into your own hand.');
    if (!to && payload.toId===`hand-${playerId}`) to=ensureHand(room,playerId);
    if (!to) return reject('Choose an available card and pile.');
    const [card] = from.cards.splice(index, 1); pruneFanGroups(from,[card.id]);
    if (to.kind === 'hand') { card.ownerId = to.ownerId; card.faceUp = true; }
    else if (to.kind === 'deck') { card.ownerId = null; card.faceUp = false; }
    else if(isDiscardPile(to)){card.ownerId=null;card.faceUp=true;}
    else if (from.kind === 'hand') card.ownerId = null;
    to.cards.push(card); cleanupEmptyPile(room, from);
  } else if (type === 'pile:create') {
    const index = room.piles.filter((pile) => pile.kind === 'shared').length;
    const pileType=payload.pileType==='discard'?'discard':'cards';
    room.piles.push({ id: `pile-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: (payload.name || (pileType==='discard'?`Discard ${index}`:`Pile ${index}`)).slice(0,24), kind: 'shared', pileType, x: 30 + (index % 5) * 10, y: 47 + (index % 2) * 12, cards: [] });
  } else if (type === 'pile:absorb-to-discard') {
    const requested=payload.pileId?findPile(room,payload.pileId):null;if(payload.pileId&&!isDiscardPile(requested))return reject('Choose a discard pile.');
    const discard=requested||findPile(room,'discard');if(!discard)return reject('The discard pile is unavailable.');
    const sources=room.piles.filter(pile=>pile.kind!=='deck'&&pile.kind!=='hand'&&!isDiscardPile(pile)&&pile.cards.length);
    if(!sources.length)return reject('There are no table cards to absorb.');
    const cards=sources.flatMap(pile=>pile.cards);
    for(const card of cards){card.ownerId=null;card.faceUp=true;}
    discard.cards.push(...cards);
    for(const pile of sources){pile.cards=[];delete pile.fanGroups;cleanupEmptyPile(room,pile);}
  } else if (type === 'pile:rename') {
    const pile=findPile(room,payload.pileId),name=String(payload.name||'').trim().slice(0,24);
    if(!pile||pile.kind!=='shared'||!name)return reject('Choose a valid name for this pile.');
    pile.name=name;
  } else if (type === 'pile:move') {
    const pile = findPile(room, payload.pileId);
    if (!pile || pile.kind === 'hand' || !Number.isFinite(Number(payload.x)) || !Number.isFinite(Number(payload.y))) return reject('Choose a movable pile and a table position.');
    pile.x = Math.min(94, Math.max(6, Number(payload.x))); pile.y = Math.min(78, Math.max(18, Number(payload.y)));
  } else if (type === 'player:kick') {
    if (!isModerator) return reject('Only the host or a cohost can kick players.');
    const target=room.players.get(payload.targetId);
    if (!target || target.id===room.hostId || target.id===playerId) return reject('Choose a non-host player to kick.');
    const hand=room.piles.find(pile=>pile.kind==='hand'&&pile.ownerId===target.id),discard=findPile(room,'discard');
    if(hand&&discard){for(const card of hand.cards){card.ownerId=null;card.faceUp=true;}discard.cards.push(...hand.cards);room.piles.splice(room.piles.indexOf(hand),1);}
    room.cohostIds.delete(target.id);room.players.delete(target.id);return {ok:true,kickedPlayerId:target.id};
  } else if (type === 'host:assign') {
    if (!isHost) return reject('Only the primary host can assign host roles.');
    const target=room.players.get(payload.targetId);
    if(!target)return reject('Choose a player at this table.');
    if(!target.online)return reject('That player must be online to change host roles.');
    if(payload.role==='cohost'){
      if(target.id===room.hostId)return reject('The primary host cannot be a cohost.');
      if(room.cohostIds.has(target.id))room.cohostIds.delete(target.id);else room.cohostIds.add(target.id);
    }else if(payload.role==='host'){
      if(target.id===room.hostId)return reject('That player is already the host.');
      room.cohostIds.add(room.hostId);
      room.cohostIds.delete(target.id);
      room.hostId=target.id;
    }else return reject('Choose a valid host role.');
  } else if (type === 'settings') {
    if (!isModerator) return reject('Only the host or a cohost can change table settings.');
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
    if(room.chat.length>300)room.chat.splice(0,room.chat.length-300);
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
