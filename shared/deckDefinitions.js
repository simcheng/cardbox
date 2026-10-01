export const standardDeck = Object.freeze({
  id: 'standard-52', name: 'Standard 52',
  suits: [
    { id: 'spades', symbol: '♠', color: 'black' },
    { id: 'hearts', symbol: '♥', color: 'red' },
    { id: 'clubs', symbol: '♣', color: 'black' },
    { id: 'diamonds', symbol: '♦', color: 'red' },
  ],
  ranks: ['A','2','3','4','5','6','7','8','9','10','J','Q','K'],
});

const definitions = new Map([[standardDeck.id, standardDeck]]);
export function registerDeck(definition) {
  if (!definition?.id || !Array.isArray(definition.suits) || !Array.isArray(definition.ranks)) throw new Error('A deck needs an id, suits, and ranks.');
  definitions.set(definition.id, Object.freeze(definition));
  return definition;
}
export function getDeck(id = standardDeck.id) { return definitions.get(id) || standardDeck; }
export function listDecks() { return [...definitions.values()]; }
