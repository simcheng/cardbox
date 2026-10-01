import React, { useState } from 'react';

export default function ActionBar({ deckCount, canUndo, canPlay, isHost, onAction, onFlipSelected, onLedger }) {
  const [open, setOpen] = useState(false), [deckOpen, setDeckOpen] = useState(true), [dealCount, setDealCount] = useState(1), [opensUp, setOpensUp] = useState(true), [confirmReset, setConfirmReset] = useState(false);
  const toggleMore = (event) => {
    const rect=event.currentTarget.getBoundingClientRect();
    setOpensUp(rect.top > window.innerHeight-250);
    setOpen(!open);
  };
  return <div className="toolbar">
    <div className="deck-status"><span className="mini-deck">♧</span><div><b>{deckCount}</b><small>in deck</small></div></div><button className="deck-menu-toggle" aria-expanded={deckOpen} onClick={()=>setDeckOpen(!deckOpen)}>{deckOpen?'Deck actions ⌃':'Deck actions ⌄'}</button>
    {deckOpen&&<div className="toolbar-actions">
      <button className="tool-secondary" disabled={!canPlay||!deckCount} onClick={()=>onAction('shuffle',{pileId:'deck'})}><span>⟳</span><label>Shuffle</label></button>
      <button className="tool-secondary cut-tool" disabled={!canPlay||!deckCount} onClick={()=>onAction('cut',{pileId:'deck'})}><span>⌁</span><label>Cut</label></button>
      <button className="tool-secondary" disabled={!canPlay||!deckCount} onClick={()=>onAction('deal',{count:1})}><span>♧</span><label>Deal one</label></button>
      <div className="tool-dropdown"><button className="tool-more" aria-expanded={open} aria-label="More card actions" onClick={toggleMore}>•••</button>{open&&<div className={`popover extra-menu ${opensUp?'opens-up':'opens-down'}`}><b>More card actions</b><button onClick={()=>{onAction('deal',{count:5});setOpen(false)}}>Deal 5 to me</button><div className="deal-all-row"><label>Cards each<input type="number" min="1" max="13" value={dealCount} onChange={(e)=>setDealCount(Math.max(1,Math.min(13,Number(e.target.value)||1)))}/></label><button onClick={()=>{onAction('deal',{count:dealCount,toAll:true});setOpen(false)}}>Deal to everyone</button></div><button onClick={()=>{onAction('pile:create');setOpen(false)}}>Create a shared pile</button><button onClick={()=>{onFlipSelected();setOpen(false)}}>Turn selected card</button><button onClick={()=>{onLedger();setOpen(false)}}>◷ View action history</button>{confirmReset?<div className="reset-confirm"><span>Return all cards to a fresh deck?</span><button onClick={()=>{onAction('reset-board');setConfirmReset(false);setOpen(false)}}>Reset board</button><button onClick={()=>setConfirmReset(false)}>Cancel</button></div>:<button disabled={!isHost} onClick={()=>setConfirmReset(true)}>↻ Reset board…</button>}</div>}</div>
    </div>}
    <button className="tool-undo" disabled={!canPlay||!canUndo} onClick={()=>onAction('undo')} aria-label="Undo last table action">↶ <span>Undo</span></button>
  </div>;
}
