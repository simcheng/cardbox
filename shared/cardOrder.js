export const SUIT_ORDER = ['♠', '♥', '♣', '♦'];
export const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function sortCards(cards, mode = 'rank') {
  const suits = new Map(SUIT_ORDER.map((suit, index) => [suit, index]));
  const ranks = new Map(RANK_ORDER.map((rank, index) => [rank, index]));
  return [...cards].sort((a,b) => mode === 'suit'
    ? (suits.get(a.suit) ?? 99) - (suits.get(b.suit) ?? 99) || (ranks.get(a.rank) ?? 99) - (ranks.get(b.rank) ?? 99)
    : (ranks.get(a.rank) ?? 99) - (ranks.get(b.rank) ?? 99) || (suits.get(a.suit) ?? 99) - (suits.get(b.suit) ?? 99));
}
