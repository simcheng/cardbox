import React, { useLayoutEffect, useRef, useState } from 'react';

export default function TableContextMenu({ menu, room, playerId, canPlay = true, onAction, onClose }) {
  const menuRef=useRef(null),[position,setPosition]=useState({left:8,top:8});
  const [renaming,setRenaming]=useState(false),[name,setName]=useState('');
  const pile = menu ? room.piles.find((item) => item.id === menu.pileId) : null;
  const card = pile?.cards.find((item) => item.id === menu?.cardId);
  const run = (type, extra = {}) => { onAction(type, { pileId: pile.id, ...(menu.cardId ? { cardId: menu.cardId } : {}), ...extra }); onClose(); };
  useLayoutEffect(()=>{setRenaming(false);setName(pile?.name||'');},[menu?.pileId,menu?.cardId]);
  useLayoutEffect(()=>{
    if(!menu||!pile)return;
    const element=menuRef.current;if(!element)return;
    const place=()=>{
      const rect=element.getBoundingClientRect(),gap=8,width=Math.min(rect.width,window.innerWidth-16),height=Math.min(rect.height,window.innerHeight-16);
      const x=Number(menu.x)||8,y=Number(menu.y)||8;
      const left=Math.max(gap,Math.min(window.innerWidth-width-gap,x+width+gap>window.innerWidth?x-width-gap:x));
      const top=Math.max(gap,Math.min(window.innerHeight-height-gap,y+height+gap>window.innerHeight?y-height-gap:y));
      setPosition({left,top,right:'auto',bottom:'auto',width:'min(224px, calc(100vw - 16px))',maxHeight:`${window.innerHeight-16}px`});
    };
    place();
    const observer=new ResizeObserver(place);observer.observe(element);
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[menu?.pileId,menu?.cardId,menu?.x,menu?.y,pile?.name,renaming]);
  if (!menu || !pile) return null;
  const handId = `hand-${playerId}`;
  return <><button className="context-dismiss" aria-label="Close card menu" onClick={onClose}/><div ref={menuRef} className="table-context-menu" role="menu" style={position}>
    <b>{menu.cardId ? `${card?.rank || 'Face down'}${card?.suit || ''}` : pile.name || 'Card stack'}</b>
    {(menu.selectionCards?.length||0)+(menu.selectionPiles?.length||0)>1 ? <>
      <span className="context-count">{menu.selectionCards?.length||0} cards · {menu.selectionPiles?.length||0} piles selected</span>
      {canPlay&&<>
        <button role="menuitem" onClick={()=>{onAction('selection:flip',{cards:(menu.selectionCards||[]).map(item=>({cardId:item.card.id,fromId:item.pileId})),pileIds:menu.selectionPiles||[]});onClose();}}>Flip selection</button>
        <button role="menuitem" onClick={()=>{onAction('selection:move',{cards:(menu.selectionCards||[]).map(item=>({cardId:item.card.id,fromId:item.pileId})),pileIds:menu.selectionPiles||[],toId:handId});onClose();}}>Move selection to my hand</button>
        <button role="menuitem" onClick={()=>{onAction('selection:move',{cards:(menu.selectionCards||[]).map(item=>({cardId:item.card.id,fromId:item.pileId})),pileIds:menu.selectionPiles||[],toId:'discard'});onClose();}}>Move selection to discard</button>
        <button role="menuitem" onClick={()=>{onAction('selection:move',{cards:(menu.selectionCards||[]).map(item=>({cardId:item.card.id,fromId:item.pileId})),pileIds:menu.selectionPiles||[],toId:'deck'});onClose();}}>Return selection to deck</button>
        {!!menu.selectionPiles?.length&&<><span className="context-count">Pile actions</span><button role="menuitem" onClick={()=>{onAction('pile:batch',{pileIds:menu.selectionPiles,operation:'layout',layout:'fan'});onClose();}}>Fan selected piles</button><button role="menuitem" onClick={()=>{onAction('pile:batch',{pileIds:menu.selectionPiles,operation:'layout',layout:'stack'});onClose();}}>Stack selected piles</button><button role="menuitem" onClick={()=>{onAction('pile:batch',{pileIds:menu.selectionPiles,operation:'sort',mode:'suit'});onClose();}}>Sort piles by suit</button><button role="menuitem" onClick={()=>{onAction('pile:batch',{pileIds:menu.selectionPiles,operation:'sort',mode:'rank'});onClose();}}>Sort piles by rank</button></>}
      </>}
    </> : menu.cardId ? <>
      {canPlay&&<>
      <button role="menuitem" onClick={()=>run('flip')}>{card?.faceUp?'Turn face down':'Turn face up'}</button>
      {pile.kind !== 'hand' && <button role="menuitem" onClick={()=>run('move-card',{fromId:pile.id,toId:handId})}>Move to my hand</button>}
      {pile.id !== 'discard' && <button role="menuitem" onClick={()=>run('move-card',{fromId:pile.id,toId:'discard'})}>Move to discard</button>}
      {pile.id !== 'deck' && <button role="menuitem" onClick={()=>run('return-card',{fromId:pile.id})}>Return to deck</button>}
      </>}
      {!canPlay&&<span className="context-count">Host controls this table</span>}
    </> : <>
      {canPlay&&pile.kind === 'deck' && <><button role="menuitem" onClick={()=>run('draw')}>Draw a card</button><button role="menuitem" onClick={()=>run('shuffle')}>Shuffle deck</button></>}
      {canPlay&&pile.kind === 'tableau' && <>
        <button role="menuitem" onClick={()=>run('move-stack',{fromId:pile.id,toId:`hand-${playerId}`})}>Move whole stack to my hand</button>
        <button role="menuitem" onClick={()=>run('pile:layout',{layout:pile.layout==='fan'?'stack':'fan'})}>{pile.layout==='fan'?'Square up stack':'Fan cards'}</button>
        <button role="menuitem" onClick={()=>run('pile:layout',{layout:pile.layout==='fan-stack'?'fan':'fan-stack'})}>{pile.layout==='fan-stack'?'Show as one fan':'Layer a fan on this stack'}</button>
        {pile.layout==='fan-stack'&&pile.fanGroups?.length>1&&<button role="menuitem" onClick={()=>run('pile:split-top-fan')}>Separate top fan</button>}
        <button role="menuitem" onClick={()=>run('flip-top')}>Flip top card</button>
        <button role="menuitem" onClick={()=>run('pile:sort',{mode:'suit'})}>Sort by suit</button>
        <button role="menuitem" onClick={()=>run('pile:sort',{mode:'rank'})}>Sort by rank</button>
        <button role="menuitem" onClick={()=>run('return-stack',{toId:'deck'})}>Return whole stack to deck</button>
        <button role="menuitem" onClick={()=>run('return-stack',{toId:'discard'})}>Discard whole stack</button>
      </>}
      {canPlay&&pile.kind==='shared'&&<>
        {renaming?<form className="pile-rename-form" onSubmit={(event)=>{event.preventDefault();const next=name.trim().slice(0,24);if(next)run('pile:rename',{name:next});}}><label htmlFor="pile-rename-input">Pile name</label><input id="pile-rename-input" autoFocus maxLength={24} value={name} onChange={(event)=>setName(event.target.value)}/><div><button type="submit" disabled={!name.trim()}>Save name</button><button type="button" onClick={()=>setRenaming(false)}>Cancel</button></div></form>:<button role="menuitem" onClick={()=>setRenaming(true)}>Rename pile</button>}
      </>}
      {canPlay&&pile.id !== 'deck' && pile.cards.length === 0 && <button role="menuitem" className="danger-action" onClick={()=>run('pile:delete')}>Delete empty {pile.kind==='tableau'?'stack':'pile'}</button>}
      {!canPlay&&<span className="context-count">Host controls this table</span>}
      {pile.cards.length > 0 && <span className="context-count">{pile.cards.length} {pile.cards.length===1?'card':'cards'}</span>}
    </>}
  </div></>;
}
