import React from 'react';
import Card from './Card.jsx';

export default function TableSurface({
  room, playerId, tableRef, selectedIds = [], preview, previewCard, pileDrag, selectionBox,
  handZone, onSurfaceClick, onCardClick, onPileClick,
  onPilePointerDown, onPilePointerMove, onPilePointerUp, onPilePointerCancel,
  onCardPointerDown, onCardPointerMove, onCardPointerUp, onCardPointerCancel,
  onOpenContextMenu, dragCardId, dragPosition, dragOverHand, contextCardId, cue,
  onConfirmPlacement, onCancelPlacement, pendingPlacement, onSurfacePointerDown, onSurfacePointerMove, onSurfacePointerUp, onSurfacePointerCancel,
}) {
  const activePlayers = room.players.filter(player=>player.online || player.id===playerId);
  const opponents = activePlayers.filter((player)=>player.id!==playerId);
  const self = room.players.find((player)=>player.id===playerId);
  const playerCount = activePlayers.length;
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
    {room.piles.filter((pile)=>pile.kind!=='hand').map((pile)=><div key={pile.id} data-place-id={pile.id} className={`pile-zone ${pile.id==='discard'?'discard-pile':''} ${pile.kind==='tableau'?'tableau-zone':''} ${pile.kind==='tableau'?`layout-${pile.layout||'grid'}`:''} ${selectedIds.length?'drop-ready':''} ${cue?.pileId===pile.id?`action-${cueClass}`:''} ${cue?.toId===pile.id?`action-${cueClass}`:''}`} style={{left:`${pileDrag?.pileId===pile.id?pileDrag.x:pile.x}%`,top:`${pileDrag?.pileId===pile.id?pileDrag.y:pile.y}%`}} onClick={(event)=>onPileClick(event,pile)} onContextMenu={(event)=>{event.preventDefault();onOpenContextMenu(event,{pileId:pile.id})}} onPointerDown={(event)=>onPilePointerDown(event,pile)} onPointerMove={onPilePointerMove} onPointerUp={onPilePointerUp} onPointerCancel={onPilePointerCancel}>
      <div className="pile-cards">{pile.cards.length>0?<>{pile.cards.slice(pile.kind==='tableau'?-8:-3).map((card,index)=><Card key={card.id} card={card} index={index} selected={selectedIds.includes(card.id)||contextCardId===card.id} dragging={dragCardId===card.id} actionCue={cue?.cardId===card.id} onClick={(event)=>onCardClick(card,pile.id,event)} onContextMenu={(event)=>onOpenContextMenu(event,{pileId:pile.id,cardId:card.id})} onPointerDown={(event)=>onCardPointerDown(event,card,pile.id)} onPointerMove={onCardPointerMove} onPointerUp={onCardPointerUp} onPointerCancel={onCardPointerCancel}/>)}</>:pile.id==='deck'?<div className="empty-deck empty-deck-empty">Deck empty</div>:<div className="empty-pile">Drop cards here</div>}</div>
      {pile.kind==='tableau'&&pile.cards.length>0&&<span className="stack-count" aria-label={`${pile.cards.length} cards in stack`}>{pile.cards.length}</span>}
      {pile.kind!=='tableau'&&<span className="pile-label">{pile.name}<small>{pile.cards.length} {pile.cards.length===1?'card':'cards'}</small></span>}
      <button className={`pile-grab ${pile.kind==='tableau'?'tableau-grab':''}`} aria-label={`Move ${pile.name||'card stack'}`} title="Drag to move" onClick={(event)=>event.stopPropagation()}>⠿</button>
      <button className="pile-menu-button" aria-label={`Actions for ${pile.name||'card stack'}`} title="Pile actions" onPointerDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.stopPropagation();onOpenContextMenu(event,{pileId:pile.id})}}>⋯</button>
    </div>)}
    <div className={dragOverHand?'hand-drop-active':''}>{handZone}</div>
    {selectionBox&&<div className="selection-box" style={{left:selectionBox.x,top:selectionBox.y,width:selectionBox.width,height:selectionBox.height}} aria-hidden="true"/>}
    {preview&&<><div className={`placement-preview preview-${preview.mode}`} style={{left:`${preview.x}%`,top:`${preview.y}%`}}><span className={previewCard?.color==='red'?'red-card':''}>{previewCard?.rank&&previewCard.faceUp?`${previewCard.rank}${previewCard.suit}`:'♧'}</span></div>{pendingPlacement&&<div className="placement-confirm" style={{left:`${preview.x}%`,top:`${preview.y}%`}}><button onClick={onConfirmPlacement}>Place card</button><button onClick={onCancelPlacement}>Cancel</button></div>}</>}
    {dragCardId&&dragPosition&&<div className="drag-ghost" style={{left:dragPosition.x,top:dragPosition.y}}><Card card={dragPosition.card} index={0}/><span>{dragOverHand?'Add to hand':'Drag to place'}</span></div>}
    <div className="table-label label-bottom">A LITTLE LUCK <span>✦</span> A LOT OF LAUGHTER</div>
  </div></div>;
}
