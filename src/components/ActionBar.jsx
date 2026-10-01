import React, { useEffect, useRef, useState } from 'react';

export default function ActionBar({ deckCount, canUndo, canPlay, isHost, selectedCount, onAction, onFlipSelected, onLedger, onMoveSelection, onClearSelection }) {
  const [open, setOpen] = useState(false), [deckOpen, setDeckOpen] = useState(true), [dealCount, setDealCount] = useState(1), [opensUp, setOpensUp] = useState(true), [opensLeft,setOpensLeft]=useState(true), [menuMaxHeight,setMenuMaxHeight]=useState(360), [confirmReset, setConfirmReset] = useState(false), [offset, setOffset] = useState({x:0,y:0}), [dragging, setDragging] = useState(false);
  const toolbarRef=useRef(null),dragRef=useRef(null),moreRef=useRef(null),menuRef=useRef(null),undoRef=useRef(null);
  const toggleMore = (event) => {
    positionMenu(event.currentTarget);
    setOpen(!open);
  };
  function positionMenu(anchor=moreRef.current) {
    if(!anchor)return;
    const rect=anchor.getBoundingClientRect();
    const menuWidth=menuRef.current?.getBoundingClientRect().width||270;
    const roomRight=window.innerWidth-rect.right,roomLeft=rect.left;
    setOpensLeft(roomRight<menuWidth&&roomLeft>roomRight);
    const above=Math.max(0,rect.top-12),below=Math.max(0,window.innerHeight-rect.bottom-12);
    const showAbove=below<Math.min(220,window.innerHeight*.4)&&above>below;
    setOpensUp(showAbove);
    setMenuMaxHeight(Math.max(1,Math.min(showAbove?above:below,window.innerHeight-16)));
  }
  useEffect(()=>{
    if(!open)return;
    let frame=0;
    const reposition=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>positionMenu());};
    reposition();window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);};
  },[open,offset,deckOpen,confirmReset]);
  useEffect(()=>{
    const resize=()=>{
      const rect=toolbarRef.current?.getBoundingClientRect();if(!rect)return;
      const undo=undoRef.current?.getBoundingClientRect();
      let dx=rect.left<8?8-rect.left:rect.right>window.innerWidth-8?window.innerWidth-8-rect.right:0;
      let dy=rect.top<8?8-rect.top:rect.bottom>window.innerHeight-8?window.innerHeight-8-rect.bottom:0;
      if(undo&&rect.left<undo.right&&rect.right>undo.left&&rect.top<undo.bottom&&rect.bottom>undo.top)dx=rect.left<undo.left?undo.left-rect.right-8:undo.right-rect.left+8;
      dx=Math.min(window.innerWidth-8-rect.right,Math.max(8-rect.left,dx));
      dy=Math.min(window.innerHeight-8-rect.bottom,Math.max(8-rect.top,dy));
      if(dx||dy)setOffset(current=>({x:current.x+dx,y:current.y+dy}));
    };
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[]);
  function onGripDown(event) {
    if(event.button!==undefined&&event.button!==0)return;
    const rect=toolbarRef.current?.getBoundingClientRect();
    if(!rect)return;
    dragRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,base:offset,rect};
    event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);event.preventDefault();
  }
  function onGripMove(event) {
    const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    const originLeft=drag.rect.left-drag.base.x,originTop=drag.rect.top-drag.base.y;
    const minX=8-originLeft,maxX=window.innerWidth-8-(drag.rect.right-drag.base.x);
    const minY=8-originTop,maxY=window.innerHeight-8-(drag.rect.bottom-drag.base.y);
    const undo=undoRef.current?.getBoundingClientRect();
    let nextX=Math.min(maxX,Math.max(minX,drag.base.x+dx)),nextY=Math.min(maxY,Math.max(minY,drag.base.y+dy));
    if(undo){const nextRect={left:originLeft+nextX,right:drag.rect.right-drag.base.x+nextX,top:originTop+nextY,bottom:drag.rect.bottom-drag.base.y+nextY};if(nextRect.left<undo.right&&nextRect.right>undo.left&&nextRect.top<undo.bottom&&nextRect.bottom>undo.top){const left=undo.left-(drag.rect.right-drag.rect.left)-8-originLeft,right=undo.right+8-originLeft;nextX=Math.max(minX,Math.min(maxX,Math.abs(left-nextX)<Math.abs(right-nextX)?left:right));}}
    setOffset({x:nextX,y:nextY});
  }
  function onGripUp(event) {if(dragRef.current?.pointerId!==event.pointerId)return;dragRef.current=null;setDragging(false);}
  const offsetStyle={'--toolbar-drag-x':`${offset.x}px`,'--toolbar-drag-y':`${offset.y}px`};
  return <div className="action-dock">
    <div ref={toolbarRef} className={`toolbar ${dragging?'is-dragging':''}`} style={offsetStyle}>
      <button className="toolbar-drag-handle" aria-label="Move deck controls" title="Drag to move deck controls" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>⠿</button>
      <div className="deck-status"><span className="mini-deck">♧</span><div><b>{deckCount}</b><small>in deck</small></div></div>
      {canPlay&&<button className="deck-menu-toggle" aria-expanded={deckOpen} onClick={()=>setDeckOpen(!deckOpen)}>{deckOpen?'Deck actions ⌃':'Deck actions ⌄'}</button>}
      {canPlay&&deckOpen&&<div className="toolbar-actions">
        <button className="tool-secondary" disabled={!deckCount} onClick={()=>onAction('shuffle',{pileId:'deck'})}><span>⟳</span><label>Shuffle</label></button>
        <button className="tool-secondary" disabled={!deckCount} onClick={()=>onAction('deal',{count:1})}><span>♧</span><label>Deal one</label></button>
        <div className="tool-dropdown">
          <button ref={moreRef} className="tool-more" aria-expanded={open} aria-label="More card actions" onClick={toggleMore}>•••</button>
          {open&&<div ref={menuRef} style={{'--menu-max-height':`${menuMaxHeight}px`}} className={`popover extra-menu ${opensUp?'opens-up':'opens-down'} ${opensLeft?'opens-left':'opens-right'}`}>
            <b>More card actions</b>
            {canPlay&&<>
              <button onClick={()=>{onAction('deal',{count:5});setOpen(false)}}>Deal 5 to me</button>
              <div className="deal-all-row"><label>Cards each<input type="number" min="1" max="13" value={dealCount} onChange={(e)=>setDealCount(Math.max(1,Math.min(13,Number(e.target.value)||1)))}/></label><button onClick={()=>{onAction('deal',{count:dealCount,toAll:true});setOpen(false)}}>Deal to everyone</button></div>
              <button onClick={()=>{onAction('pile:create');setOpen(false)}}>Create a shared pile</button>
            </>}
            {canPlay&&selectedCount>0&&<>
              <div className="selection-menu-label">{selectedCount} selected</div>
              <button onClick={()=>{onFlipSelected();setOpen(false)}}>Turn selected cards</button>
              <button onClick={()=>{onMoveSelection('deck');setOpen(false)}}>Return selection to deck</button>
              <button onClick={()=>{onMoveSelection('discard');setOpen(false)}}>Move selection to discard</button>
              <button onClick={()=>{onClearSelection();setOpen(false)}}>Clear selection</button>
            </>}
            <button onClick={()=>{onLedger();setOpen(false)}}>◷ View action history</button>
            {isHost&&<>{confirmReset
              ?<div className="reset-confirm"><span>Return all cards to a fresh deck?</span><button onClick={()=>{onAction('reset-board');setConfirmReset(false);setOpen(false)}}>Reset board</button><button onClick={()=>setConfirmReset(false)}>Cancel</button></div>
              :<button onClick={()=>setConfirmReset(true)}>↻ Reset board…</button>}
            </>}
          </div>}
        </div>
      </div>}
    </div>
    {canPlay&&<button ref={undoRef} className="tool-undo" disabled={!canUndo} onClick={()=>onAction('undo')} aria-label="Undo last table action">↶ <span>Undo</span></button>}
  </div>;
}
