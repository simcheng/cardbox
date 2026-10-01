// Deck definitions are data-driven so other games can register different suits and ranks.
import { randomUUID } from 'node:crypto';
import { getDeck, registerDeck, standardDeck } from '../shared/deckDefinitions.js';
export { getDeck, registerDeck, standardDeck };

export function createDeck(definition = standardDeck) {
  if (typeof definition === 'string') definition = getDeck(definition);
  return definition.suits.flatMap((suit) => definition.ranks.map((rank) => ({
    // Keep the card's identity opaque in public snapshots so a hidden hand can't
    // be decoded from a deterministic id.
    id: randomUUID(), rank, suit: suit.symbol,
    color: suit.color, faceUp: false, ownerId: null,
  })));
}

export function shuffle(cards) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
