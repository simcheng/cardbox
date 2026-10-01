import React, { useRef } from 'react';
import Card from './Card.jsx';

export default function HandZone({ hand, playerId, canPlay = true, selectedIds = [], contextCardId, dragCardId, cue, collapsed, onToggle, onDraw, onSort, onCardClick, onOpenContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const cardsRef = useRef(null);
  const scrollHand = (direction) => cardsRef.current?.scrollBy({ left: direction * 240, behavior: 'smooth' });
  const receivedDrawCue = (cue?.type==='draw'&&cue.playerId===playerId)||(cue?.type==='deal'&&cue.recipientIds?.includes(playerId));
  return <div className={`table-hand-zone ${collapsed?'hand-collapsed':''} ${receivedDrawCue?'action-draw':''} ${cue?.type==='sort-hand'&&cue.playerId===playerId?'action-sort-hand':''}`}>
    <div className="hand-zone-header">
      <div className="table-hand-label">YOUR HAND <b>{hand?.cards.length||0}</b></div>
      <button className="hand-visibility-toggle" onClick={onToggle}>{collapsed?'Show hand':'Hide hand'}</button>
      <div className="hand-tools">
        <button className="hand-draw" disabled={!canPlay} onClick={onDraw}>＋ Draw card</button>
        <button disabled={!hand?.cards.length} onClick={()=>onSort('suit')}>Sort suit</button>
        <button disabled={!hand?.cards.length} onClick={()=>onSort('rank')}>Sort rank</button>
        {hand?.cards.length>12&&<><button className="hand-scroll" aria-label="Scroll hand left" onClick={()=>scrollHand(-1)}>‹</button><button className="hand-scroll" aria-label="Scroll hand right" onClick={()=>scrollHand(1)}>›</button></>}
      </div>
    </div>
    {!collapsed&&<div className="table-hand-cards" ref={cardsRef}>
      {hand?.cards.length ? hand.cards.map((card,index)=><Card key={card.id} card={card} index={index} selected={selectedIds.includes(card.id)||contextCardId===card.id} dragging={dragCardId===card.id} actionCue={cue?.cardId===card.id} onClick={(event)=>onCardClick(card,hand.id,event)} onContextMenu={(event)=>onOpenContextMenu(event,{pileId:hand.id,cardId:card.id})} onPointerDown={(e)=>onPointerDown(e,card,hand.id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}/>) : <span className="empty-hand-inline">Your cards will appear here.</span>}
    </div>}
  </div>;
}
