import React, { useRef } from 'react';

export default function Card({ card, index = 0, small = false, selected = false, dragging = false, actionCue = false, onClick, onDragStart, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu }) {
  const press = useRef(null), longPressed = useRef(false);
  const face = card.faceUp && card.rank;
  const clearPress = () => { if (press.current?.timer) clearTimeout(press.current.timer); press.current = null; };
  const handlePointerDown = (event) => {
    onPointerDown?.(event);
    if (event.pointerType !== 'touch' || !onContextMenu) return;
    clearPress(); const target = event.currentTarget, x = event.clientX, y = event.clientY;
    press.current = { x, y, target, timer: setTimeout(() => { longPressed.current = true; onContextMenu({ clientX:x, clientY:y, currentTarget:target }); }, 520) };
  };
  const handlePointerMove = (event) => {
    if (press.current && Math.hypot(event.clientX-press.current.x,event.clientY-press.current.y)>8) clearPress();
    onPointerMove?.(event);
  };
  const handlePointerUp = (event) => { clearPress(); onPointerUp?.(event); };
  return <div data-card-id={card.id} title="Hold or right-click for card actions" aria-label={face?`${card.rank} of ${card.suit}. Hold or right-click for actions`:'Face-down card. Hold or right-click for actions'} draggable={!!onDragStart} className={`playing-card ${small?'small-card':''} ${face?'face-up':'card-back'} ${card.color==='red'?'red-card':''} ${selected?'selected-card':''} ${dragging?'drag-source':''} ${actionCue?'action-cue':''}`} style={{'--fan':index}} onClick={(e)=>{e.stopPropagation();if(longPressed.current){longPressed.current=false;return}onClick?.(e)}} onContextMenu={(e)=>{e.preventDefault();e.stopPropagation();if(!longPressed.current)onContextMenu?.(e)}} onDragStart={onDragStart} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={(e)=>{clearPress();onPointerCancel?.(e)}} role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'){e.stopPropagation();onClick?.(e)}else if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();onContextMenu?.(e)}}}>
    {face?<><span className="card-corner"><b>{card.rank}</b><i>{card.suit}</i></span><span className="card-center">{card.suit}</span><span className="card-corner bottom"><b>{card.rank}</b><i>{card.suit}</i></span></>:<span className="back-pattern">♧</span>}
  </div>;
}
