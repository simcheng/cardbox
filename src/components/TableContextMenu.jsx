import React from 'react';

export default function TableContextMenu({ menu, room, playerId, canPlay = true, onAction, onClose }) {
  if (!menu) return null;
  const pile = room.piles.find((item) => item.id === menu.pileId);
  const card = pile?.cards.find((item) => item.id === menu.cardId);
  if (!pile) return null;
  const run = (type, extra = {}) => { onAction(type, { pileId: pile.id, ...(menu.cardId ? { cardId: menu.cardId } : {}), ...extra }); onClose(); };
  const handId = `hand-${playerId}`;
  return <><button className="context-dismiss" aria-label="Close card menu" onClick={onClose}/><div className="table-context-menu" role="menu" style={{ '--menu-x': `${menu.x}px`, '--menu-y': `${menu.y}px` }}>
    <b>{menu.cardId ? `${card?.rank || 'Face down'}${card?.suit || ''}` : pile.name || 'Card stack'}</b>
    {menu.cardId ? <>
      {canPlay&&<>
      <button role="menuitem" onClick={()=>run('flip')}>{card?.faceUp?'Turn face down':'Turn face up'}</button>
      {pile.kind !== 'hand' && <button role="menuitem" onClick={()=>run('move-card',{fromId:pile.id,toId:handId})}>Move to my hand</button>}
      {pile.id !== 'discard' && <button role="menuitem" onClick={()=>run('move-card',{fromId:pile.id,toId:'discard'})}>Move to discard</button>}
      {pile.id !== 'deck' && <button role="menuitem" onClick={()=>run('return-card',{fromId:pile.id})}>Return to deck</button>}
      </>}
      {!canPlay&&<span className="context-count">Host controls this table</span>}
    </> : <>
      {canPlay&&pile.kind === 'deck' && <><button role="menuitem" onClick={()=>run('draw')}>Draw a card</button><button role="menuitem" onClick={()=>run('shuffle')}>Shuffle deck</button><button role="menuitem" onClick={()=>run('cut')}>Cut deck</button></>}
      {canPlay&&pile.kind === 'tableau' && <>
        <button role="menuitem" onClick={()=>run('move-stack',{fromId:pile.id,toId:`hand-${playerId}`})}>Move whole stack to my hand</button>
        <button role="menuitem" onClick={()=>run('pile:layout',{layout:pile.layout==='fan'?'stack':'fan'})}>{pile.layout==='fan'?'Square up stack':'Fan cards'}</button>
        <button role="menuitem" onClick={()=>run('pile:layout',{layout:pile.layout==='fan-stack'?'fan':'fan-stack'})}>{pile.layout==='fan-stack'?'Show as one fan':'Layer a fan on this stack'}</button>
        {pile.layout==='fan-stack'&&pile.fanGroups?.length>1&&<button role="menuitem" onClick={()=>run('pile:split-top-fan')}>Separate top fan</button>}
        <button role="menuitem" onClick={()=>run('flip-top')}>Flip top card</button>
        <button role="menuitem" onClick={()=>run('return-stack',{toId:'deck'})}>Return whole stack to deck</button>
        <button role="menuitem" onClick={()=>run('return-stack',{toId:'discard'})}>Discard whole stack</button>
      </>}
      {canPlay&&pile.id !== 'deck' && pile.cards.length === 0 && <button role="menuitem" className="danger-action" onClick={()=>run('pile:delete')}>Delete empty {pile.kind==='tableau'?'stack':'pile'}</button>}
      {!canPlay&&<span className="context-count">Host controls this table</span>}
      {pile.cards.length > 0 && <span className="context-count">{pile.cards.length} {pile.cards.length===1?'card':'cards'}</span>}
    </>}
  </div></>;
}
