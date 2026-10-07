import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card.jsx';

export default function HandZone({ hand, playerId, canPlay = true, selectedIds = [], contextCardId, dragCardIds = [], cue, collapsed, onToggle, onDraw, onSort, onCardClick, onOpenContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const cardsRef = useRef(null);
  const [canScroll,setCanScroll]=useState(false);
  const selectedSet=useMemo(()=>new Set(selectedIds),[selectedIds.join('\0')]);
  const draggingSet=useMemo(()=>new Set(dragCardIds),[dragCardIds.join('\0')]);
  const scrollHand = (direction) => {const strip=cardsRef.current;if(!strip)return;strip.scrollTo({left:Math.max(0,Math.min(strip.scrollWidth-strip.clientWidth,strip.scrollLeft+direction*Math.max(200,strip.clientWidth*.72))),behavior:'smooth'});};
  const receivedDrawCue = cue?.playerId!==playerId&&((cue?.type==='draw'&&cue.recipientIds?.includes(playerId))||(cue?.type==='deal'&&cue.recipientIds?.includes(playerId)));
  useEffect(()=>{
    const strip=cardsRef.current;if(!strip){setCanScroll(false);return;}
    const measure=()=>setCanScroll(strip.scrollWidth>strip.clientWidth+2);
    measure();const observer=new ResizeObserver(measure);observer.observe(strip);
    strip.addEventListener('scroll',measure,{passive:true});window.addEventListener('resize',measure);
    return()=>{observer.disconnect();strip.removeEventListener('scroll',measure);window.removeEventListener('resize',measure);};
  },[hand?.cards.length,collapsed]);
  return <div className={`table-hand-zone ${collapsed?'hand-collapsed':''} ${receivedDrawCue?'action-draw':''} ${cue?.type==='sort-hand'&&cue.playerId===playerId?'action-sort-hand':''}`}>
    <div className="hand-zone-header">
      <div className="table-hand-label"><span>YOUR HAND <b>{hand?.cards.length||0}</b></span></div>
      <div className="hand-tools">
        <button className="hand-draw" disabled={!canPlay} onClick={onDraw}>＋ Draw card</button>
        <button disabled={!hand?.cards.length} onClick={()=>onSort('suit')}>Sort suit</button>
        <button disabled={!hand?.cards.length} onClick={()=>onSort('rank')}>Sort rank</button>
        {canScroll&&<><button className="hand-scroll" aria-label="Scroll hand left" onClick={()=>scrollHand(-1)}>‹</button><button className="hand-scroll" aria-label="Scroll hand right" onClick={()=>scrollHand(1)}>›</button></>}
      </div>
    </div>
    <button className="hand-visibility-toggle" onClick={onToggle} aria-label={collapsed?'Show hand':'Hide hand'} title={collapsed?'Show hand':'Hide hand'}>{collapsed?'↑':'↓'}</button>
    {!collapsed&&<div className="table-hand-cards" ref={cardsRef}>
      {hand?.cards.length ? hand.cards.map((card,index)=><Card key={card.id} card={card} index={index} style={{'--hand-count':hand.cards.length}} selected={selectedSet.has(card.id)||contextCardId===card.id} dragging={draggingSet.has(card.id)} actionCue={cue?.playerId!==playerId&&(cue?.cardId===card.id||cue?.cardIds?.includes(card.id))} recent={cue?.playerId!==playerId&&(cue?.cardId===card.id||cue?.cardIds?.includes(card.id))} onClick={(event)=>onCardClick(card,hand.id,event)} onContextMenu={(event)=>onOpenContextMenu(event,{pileId:hand.id,cardId:card.id})} onPointerDown={(e)=>onPointerDown(e,card,hand.id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}/>) : <span className="empty-hand-inline">Your cards will appear here.</span>}
    </div>}
  </div>;
}
