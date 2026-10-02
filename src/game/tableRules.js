export const TABLE_GRID = Object.freeze({ x: 3.5, y: 7.5 });
export const TABLE_BOUNDS = Object.freeze({ x: [6, 94], y: [18, 78] });
export const PILE_SNAP_DISTANCE = 66;

export function snapToTable(clientX, clientY, rect) {
  const x = Math.min(TABLE_BOUNDS.x[1], Math.max(TABLE_BOUNDS.x[0], (clientX - rect.left) / rect.width * 100));
  const y = Math.min(TABLE_BOUNDS.y[1], Math.max(TABLE_BOUNDS.y[0], (clientY - rect.top) / rect.height * 100));
  return { x: Math.round(x / TABLE_GRID.x) * TABLE_GRID.x, y: Math.round(y / TABLE_GRID.y) * TABLE_GRID.y, mode: 'grid' };
}

export function resolveTablePlacement(clientX, clientY, rect, nearbyPiles = [], preferredPileId = null) {
  const nearby = nearbyPiles.map((pile) => ({ ...pile, distance: Math.hypot(clientX - (pile.rect.left + pile.rect.width / 2), clientY - (pile.rect.top + pile.rect.height / 2)) })).sort((a,b) => a.distance - b.distance)[0];
  const target = preferredPileId ? nearbyPiles.find((pile) => pile.id === preferredPileId) : nearby?.distance < PILE_SNAP_DISTANCE ? nearby : null;
  if (target) {
    if (['fan', 'fan-stack'].includes(target.layout)) {
      const progress = Math.min(1, Math.max(0, (clientX - target.rect.left) / Math.max(1, target.rect.width)));
      const groupCount = target.layout === 'fan-stack' ? Math.max(1, target.fanGroups?.length || 1) : 1;
      const group = target.layout === 'fan-stack' ? Math.min(groupCount - 1, Math.floor(progress * groupCount)) : 0;
      const groupIds = target.layout === 'fan-stack' ? (target.fanGroups?.[group] || []) : target.cards.map(card => card.id);
      const index = Math.min(groupIds.length, Math.max(0, Math.round(progress * groupIds.length)));
      return { x: target.x, y: target.y, targetId: target.id, mode: 'insert', insertAt: index, fanGroup: group, previewX: target.rect.left + progress * target.rect.width, previewY: target.rect.top + target.rect.height / 2 };
    }
    const progress = (clientX-target.rect.left)/Math.max(1,target.rect.width);
    const mode = progress > .7 ? 'fan' : progress > .42 ? 'fan-stack' : 'stack';
    return { x: mode==='fan'?target.x+3:target.x, y: target.y, targetId: target.id, mode };
  }
  return snapToTable(clientX, clientY, rect);
}
