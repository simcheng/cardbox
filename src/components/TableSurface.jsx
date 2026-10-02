import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card.jsx';

export default function TableSurface({
  room, playerId, tableRef, selectedIds = [], selectedPileIds = [], preview, previewCard, previewCount = 1, dragCount = 1, pileDrag, selectionBox,
  handZone, onSurfaceClick, onCardClick, onPileClick,
  onPilePointerDown, onPilePointerMove, onPilePointerUp, onPilePointerCancel,
  onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardPointerCancel,
  onOpenContextMenu, dragCardId, dragPosition, dragOverHand, contextCardId, cue,
  onConfirmPlacement, onCancelPlacement, pendingPlacement, dragGhostRef, onSurfacePointerDown, onSurfacePointerMove, onSurfacePointerUp, onSurfacePointerCancel, draggedCardIds = [],
}) {
  const [drawFlight,setDrawFlight]=useState(null);
  const [surfaceSize,setSurfaceSize]=useState({width:0,height:0});
  useEffect(()=>{
    const surface=tableRef.current;
    if(!surface)return;
    const measure=()=>{
      const next={width:surface.clientWidth,height:surface.clientHeight};
      setSurfaceSize(current=>current.width===next.width&&current.height===next.height?current:next);
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(surface);
    return()=>observer.disconnect();
  },[tableRef]);
  useEffect(()=>{
    if(!['draw','deal'].includes(cue?.type)||!(cue.playerId===playerId||cue.recipientIds?.includes(playerId))){setDrawFlight(null);return;}
    setDrawFlight(null);
    let frame=requestAnimationFrame(()=>{
      const surface=tableRef.current,deck=surface?.querySelector('[data-place-id="deck"]'),hand=surface?.querySelector('.table-hand-zone');
      if(!surface||!deck||!hand)return;
      const s=surface.getBoundingClientRect(),d=deck.getBoundingClientRect(),h=hand.getBoundingClientRect();
      const dealt=cue.drawCounts?.[playerId] ?? cue.drawCount ?? 1;
      if(dealt<1)return;
      setDrawFlight({id:cue.id,x:d.left+d.width/2-s.left-28.5,y:d.top+d.height/2-s.top-40,dx:h.left+h.width/2-(d.left+d.width/2),dy:h.top+h.height/2-(d.top+d.height/2),count:Math.min(3,dealt)});
    });
    return()=>cancelAnimationFrame(frame);
  },[cue?.id,playerId,tableRef]);
  const activePlayers = room.players.filter(player=>player.online || player.id===playerId);
  const opponents = activePlayers.filter((player)=>player.id!==playerId);
  const self = room.players.find((player)=>player.id===playerId);
  const playerCount = activePlayers.length;
  const previewPosition=preview&&surfaceSize.width&&surfaceSize.height?{
    x:Math.min(surfaceSize.width-34,Math.max(34,preview.x/100*surfaceSize.width)),
    y:Math.min(surfaceSize.height-48,Math.max(48,preview.y/100*surfaceSize.height)),
  }:null;
  const confirmPosition=previewPosition?{
    x:Math.min(surfaceSize.width-98,Math.max(98,previewPosition.x)),
    y:previewPosition.y+108<surfaceSize.height-8?previewPosition.y+56:Math.max(8,previewPosition.y-100),
  }:null;
  const selectedSignature=selectedIds.join('\0');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedSignature]);
  const selfIndex = Math.max(0, activePlayers.findIndex(player=>player.id===playerId));
  const seats = opponents.map((player)=>{
    const index = activePlayers.findIndex(item=>item.id===player.id);
    const angle = (90 + 360 * (index-selfIndex) / Math.max(1,playerCount)) * Math.PI / 180;
    return { player, x:50 + 42*Math.cos(angle), y:50 + 30*Math.sin(angle) };
  });
  const cueClass = cue?.type==='deal'?'draw':cue?.type?.replaceAll(':','-');
  return <div className="table-wrap"><div className="table-surface" ref={tableRef} onClick={onSurfaceClick} onPointerDown={onSurfacePointerDown} onPointerMove={onSurfacePointerMove} onPointerUp={onSurfacePointerUp} onPointerCancel={onSurfacePointerCancel}>
    <div className="table-seam"/>
    {seats.map(({player,x,y})=><div className={`seat ${cue?.playerId===player.id||cue?.recipientIds?.includes(player.id)?'seat-action':''}`} key={player.id} style={{left:`${x}%`,top:`${y}%`,transform:'translate(-50%,-50%)'}}>
      <div className="seat-avatar" style={{'--avatar':player.color}}>{player.emoji||player.name.slice(0,1).toUpperCase()}<i className={player.online?'':'offline'}/></div>
      <span>{player.name}</span><small className="seat-count"><span className="hand-card-icon" aria-hidden="true">{Array.from({length:Math.min(4,player.handCount)},(_,i)=><i key={i}/>)}</span>{player.handCount>4&&<i className="hand-extra">+{player.handCount-4}</i>}<b>{player.handCount}</b> {player.handCount===1?'card':'cards'}</small>
      {cue?.type==='chat'&&cue.playerId===player.id&&cue.message&&<span className="seat-notification" key={cue.id}>{cue.message}</span>}
      {cue?.type==='chat:react'&&cue.playerId===player.id&&cue.emoji&&<span className="seat-notification reaction-notification" key={cue.id}>reacted {cue.emoji}</span>}
    </div>)}
    {cue?.type==='chat'&&cue.playerId===playerId&&cue.message&&<div className="self-chat-notification" key={cue.id} style={{'--player-color':self?.color}}><span>{self?.emoji||self?.name?.slice(0,1).toUpperCase()}</span><b>{cue.message}</b></div>}
    {cue?.type==='chat:react'&&cue.playerId===playerId&&cue.emoji&&<div className="self-chat-notification reaction-notification" key={cue.id} style={{'--player-color':self?.color}}><span>{self?.emoji||self?.name?.slice(0,1).toUpperCase()}</span><b>reacted {cue.emoji}</b></div>}
    {room.piles.filter((pile)=>pile.kind!=='hand').map((pile)=>{
      const isFan=pile.kind==='tableau'&&['fan','fan-stack'].includes(pile.layout);
      const groupIds=isFan?(pile.layout==='fan-stack'?(pile.fanGroups?.length?pile.fanGroups:[pile.cards.map(card=>card.id)]):[pile.cards.map(card=>card.id)]):[];
      const longestFan=groupIds.reduce((max,ids)=>Math.max(max,ids.length),0);
      const surfaceWidth=surfaceSize.width;
      const surfaceHeight=surfaceSize.height;
      const usableWidth=Math.max(140,surfaceWidth-24);
      const isHandFan=pile.layout==='fan';
      const fanColumns=isHandFan?Math.min(longestFan,Math.max(1,Math.floor((usableWidth-67)/24)+1)):longestFan;
      const fanRows=isHandFan?Math.ceil(pile.cards.length/Math.max(1,fanColumns)):1;
      const rowStep=29;
      const fanStep=isHandFan?Math.min(24,Math.max(0,(usableWidth-67)/Math.max(1,fanColumns-1))):Math.min(5,Math.max(1,(usableWidth-67)/Math.max(1,longestFan-1)));
      const groupStep=isHandFan?0:Math.min(12,Math.max(0,(usableWidth-(67+fanStep*Math.max(0,longestFan-1)))/Math.max(1,groupIds.length-1)));
      const groupYStep=Math.min(5,Math.max(0,(surfaceHeight-138)/Math.max(1,groupIds.length-1)));
      const fanWidth=Math.max(74,67+fanStep*Math.max(0,fanColumns-1)+Math.max(0,groupIds.length-1)*groupStep);
      const fanHeight=102+Math.max(0,fanRows-1)*rowStep;
      const groupByCard=isFan?new Map():null;
      if(isHandFan){
        for(let index=0;index<pile.cards.length;index++){
          const row=Math.floor(index/fanColumns),column=index%fanColumns,count=Math.min(fanColumns,pile.cards.length-row*fanColumns);
          groupByCard.set(pile.cards[index].id,{group:0,row,index:column,count,z:row*100+column});
        }
      }else if(isFan)for(let group=0;group<groupIds.length;group++){
        const ids=groupIds[group];
        for(let index=0;index<ids.length;index++)groupByCard.set(ids[index],{group,index,row:0,count:ids.length,z:group*100+index});
      }
      const draggedX=pileDrag?.pileId===pile.id?pileDrag.x:pile.x;
      const pileX=isFan&&surfaceWidth>0?Math.min(100-(fanWidth/2+8)/surfaceWidth*100,Math.max((fanWidth/2+8)/surfaceWidth*100,draggedX)):draggedX;
      const draggedY=pileDrag?.pileId===pile.id?pileDrag.y:pile.y;
      const fanTopMargin=(55+(isHandFan?0:Math.max(0,groupIds.length-1)*groupYStep))/Math.max(1,surfaceHeight)*100;
      const fanBottomMargin=(96+Math.max(0,fanRows-1)*rowStep)/Math.max(1,surfaceHeight)*100;
      const pileY=isFan&&surfaceHeight>0?Math.min(100-fanBottomMargin,Math.max(fanTopMargin,draggedY)):draggedY;
      const cardsToShow=isFan?pile.cards:pile.cards.slice(pile.kind==='tableau'?-8:-3);
      return <div key={pile.id} data-place-id={pile.id} className={`pile-zone ${pile.id==='discard'?'discard-pile':''} ${pile.kind==='tableau'?'tableau-zone':''} ${pile.kind==='tableau'?`layout-${pile.layout||'grid'}`:''} ${selectedIds.length?'drop-ready':''} ${selectedPileIds.includes(pile.id)?'selected-pile':''} ${pileDrag?.targetId===pile.id?'pile-drop-target':''} ${cue?.pileId===pile.id?`action-${cueClass}`:''} ${cue?.toId===pile.id?`action-${cueClass}`:''}`} style={{left:`${pileX}%`,top:`${pileY}%`,'--fan-width':`${fanWidth}px`}} onClick={(event)=>onPileClick(event,pile)} onContextMenu={(event)=>{event.preventDefault();onOpenContextMenu(event,{pileId:pile.id})}} onPointerDown={(event)=>onPilePointerDown(event,pile)} onPointerMove={onPilePointerMove} onPointerUp={onPilePointerUp} onPointerCancel={onPilePointerCancel}>
      <div className="pile-cards" style={isFan?{width:`${fanWidth}px`,height:`${fanHeight}px`}:undefined}>{pile.cards.length>0?<>{cardsToShow.map((card,index)=>{const meta=groupByCard?.get(card.id)||{group:0,index,row:0,count:cardsToShow.length,z:index};const fanStyle=isFan?{'--fan':meta.index,'--fan-row':meta.row,'--fan-count':meta.count,'--fan-step':`${fanStep}px`,'--fan-row-step':`${rowStep}px`,'--fan-group-y-step':`${-groupYStep}px`,'--fan-center':(meta.count-1)/2,'--fan-group':meta.group,'--fan-group-step':`${groupStep}px`,'--fan-z':meta.z}:undefined;return <Card key={card.id} card={card} index={index} style={fanStyle} selected={selectedSet.has(card.id)||contextCardId===card.id} dragging={draggedCardIds.includes(card.id)} actionCue={cue?.cardId===card.id||cue?.cardIds?.includes(card.id)} onClick={(event)=>onCardClick(card,pile.id,event)} onContextMenu={(event)=>onOpenContextMenu(event,{pileId:pile.id,cardId:card.id})} onPointerDown={(event)=>onCardPointerDown(event,card,pile.id)} onPointerMove={onCardPointerMove} onPointerUp={onCardPointerUp} onPointerCancel={onCardPointerCancel}/>})}</>:pile.id==='deck'?<div className="empty-deck empty-deck-empty">Deck empty</div>:<div className="empty-pile">Drop cards here</div>}</div>
      {pile.kind==='tableau'&&pile.cards.length>1&&<span className="stack-count" style={{top:'31px',left:'calc(50% + 12px)',right:'auto',bottom:'auto',transform:'none'}} aria-label={`${pile.cards.length} cards in stack`}>{pile.cards.length}</span>}
      {pile.kind!=='tableau'&&<span className="pile-label">{pile.name}{pile.cards.length>1&&<small>{pile.cards.length} cards</small>}</span>}
      <button className={`pile-grab ${pile.kind==='tableau'?'tableau-grab':''}`} aria-label={`Move ${pile.name||'card stack'}`} title="Drag to move; double click to toggle fan" onClick={(event)=>event.stopPropagation()} onPointerDown={(event)=>{event.stopPropagation();onPilePointerDown(event,pile)}} onPointerMove={onPilePointerMove} onPointerUp={onPilePointerUp} onPointerCancel={onPilePointerCancel} onDoubleClick={(event)=>{event.stopPropagation();if(pile.kind==='tableau')onOpenContextMenu(event,{pileId:pile.id,quickLayout:true});}}>⠿</button>
      <button className="pile-menu-button" aria-label={`Actions for ${pile.name||'card stack'}`} title="Pile actions" onPointerDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.stopPropagation();onOpenContextMenu(event,{pileId:pile.id})}}>⋯</button>
    </div>})}
    <div className={dragOverHand?'hand-drop-active':''}>{handZone}</div>
    {selectionBox&&<div className="selection-box" style={{left:selectionBox.x,top:selectionBox.y,width:selectionBox.width,height:selectionBox.height}} aria-hidden="true"/>}
    {preview&&<>{preview.mode!=='insert'&&<div className={`placement-preview preview-${preview.mode}`} aria-hidden="true" style={previewPosition?{left:`${previewPosition.x}px`,top:`${previewPosition.y}px`}:{left:`${preview.x}%`,top:`${preview.y}%`}}><span className={previewCard?.color==='red'?'red-card':''}>{previewCard?.rank&&previewCard.faceUp?`${previewCard.rank}${previewCard.suit}`:'♧'}</span>{preview.mode==='fan-stack'&&<small className="preview-mode-label">Layer fan</small>}{previewCount>1&&<b className="preview-count">{previewCount}</b>}</div>}{preview.mode==='insert'&&<><i className="fan-insertion-marker" style={{left:`${preview.previewX??preview.x}%`,top:`${preview.previewY??preview.y}%`}}/><div className={`fan-insertion-card ${previewCount>1?'is-group':''}`} style={{left:`${preview.previewX??preview.x}%`,top:`${preview.previewY??preview.y}%`}}><Card card={previewCard||{faceUp:false}} index={0}/>{previewCount>1&&<b className="fan-insertion-count">{previewCount} cards</b>}</div></>}</>}
    {dragCardId&&dragPosition&&<div ref={dragGhostRef} className={`drag-ghost ${dragCount>1?'is-group':''}`} style={{left:dragPosition.x,top:dragPosition.y}}><Card card={dragPosition.card} index={0}/>{dragCount>1&&<b className="drag-count">{dragCount}</b>}<span>{dragOverHand?`Add ${dragCount===1?'card':`${dragCount} cards`} to hand`:`Move ${dragCount===1?'card':`${dragCount} cards`}`}</span></div>}
    {drawFlight&&Array.from({length:drawFlight.count},(_,index)=><div key={`${drawFlight.id}-${index}`} className="draw-flight" style={{'--draw-x':`${drawFlight.x+index*3}px`,'--draw-y':`${drawFlight.y-index*2}px`,'--draw-dx':`${drawFlight.dx}px`,'--draw-dy':`${drawFlight.dy}px`,'--draw-delay':`${index*45}ms`}}><div>♧</div></div>)}
    <div className="table-label label-bottom">A LITTLE LUCK <span>✦</span> A LOT OF LAUGHTER</div>
  </div></div>;
}
