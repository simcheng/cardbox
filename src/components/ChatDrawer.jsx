import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const QUICK_REACTIONS=['👍','❤️','😂','👏','🎉','🔥','😍','😮','👀','💯','🤔','🥳'];

export default function ChatDrawer({ open, room, playerId, text, setText, onSend, onClose, onInvite, onReact, chatEnd, theme }) {
  const [pickerFor,setPickerFor]=useState(''),[otherOpen,setOtherOpen]=useState(false),[customEmoji,setCustomEmoji]=useState(''),[pickerPosition,setPickerPosition]=useState(null);
  const pickerAnchor=useRef(null),pickerRef=useRef(null);
  function placePicker(anchor=pickerAnchor.current) {
    if(!anchor)return;
    const rect=anchor.getBoundingClientRect(),popup=pickerRef.current?.getBoundingClientRect(),width=Math.min(popup?.width||230,window.innerWidth-16),height=Math.min(popup?.height||(otherOpen?220:165),window.innerHeight-16);
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width));
    const opensUp=rect.bottom+height+10>window.innerHeight&&rect.top>height+10;
    const top=Math.max(8,Math.min(window.innerHeight-height-8,opensUp?rect.top-height-8:rect.bottom+8));
    setPickerPosition({left,top,opensUp});
  }
  useEffect(()=>{
    if(!open){setPickerFor('');setPickerPosition(null);return;}
    if(!pickerFor){setPickerPosition(null);return;}
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>placePicker());};
    const outside=(event)=>{if(!event.target.closest?.('.reaction-picker,.reaction-picker-trigger'))setPickerFor('');};
    const viewport=window.visualViewport;update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);document.addEventListener('pointerdown',outside);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);document.removeEventListener('pointerdown',outside);};
  },[pickerFor,otherOpen,open]);

  function togglePicker(messageId,event) {
    if(pickerFor===messageId){setPickerFor('');pickerAnchor.current=null;return;}
    pickerAnchor.current=event.currentTarget;setPickerFor(messageId);setOtherOpen(false);setCustomEmoji('');
    const rect=event.currentTarget.getBoundingClientRect(),width=Math.min(230,window.innerWidth-16),height=165;
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width));
    const opensUp=rect.bottom+height+10>window.innerHeight&&rect.top>height+10;
    setPickerPosition({left,top:Math.max(8,Math.min(window.innerHeight-height-8,opensUp?rect.top-height-8:rect.bottom+8)),opensUp});
  }
  function chooseReaction(messageId,emoji){onReact(messageId,emoji);setPickerFor('');setOtherOpen(false);}
  const picker=pickerFor&&pickerPosition?createPortal(<div ref={pickerRef} className={`reaction-picker ${pickerPosition.opensUp?'opens-up':'opens-down'} ${theme==='dark'?'theme-dark':''}`} role="menu" style={{position:'fixed',left:pickerPosition.left,right:'auto',top:pickerPosition.top,bottom:'auto',zIndex:1000}}>
    {QUICK_REACTIONS.map(emoji=><button key={emoji} role="menuitem" aria-label={`React ${emoji}`} onClick={()=>chooseReaction(pickerFor,emoji)}>{emoji}</button>)}
    <button className="reaction-other" aria-label="Choose another emoji" aria-expanded={otherOpen} onClick={()=>setOtherOpen(!otherOpen)}><span aria-hidden="true">…</span></button>
    {otherOpen&&<form className="reaction-other-form" onSubmit={(event)=>{event.preventDefault();if(customEmoji.trim())chooseReaction(pickerFor,customEmoji.trim())}}><input autoFocus aria-label="Choose another emoji" value={customEmoji} onChange={(event)=>setCustomEmoji(event.target.value)} placeholder="Paste any emoji" maxLength={16}/><button type="submit">Add</button></form>}
  </div>,document.body):null;

  return <>
    {open&&<button className="chat-scrim" aria-label="Close chat" onClick={onClose}/>}
    <aside className={`sidebar ${open?'mobile-open':''}`}>
      <div className="sidebar-tabs"><span>CHAT <i>{room.chat.length||''}</i></span><button className="sidebar-close" onClick={onClose}>×</button></div>
      <div className="chat-feed">{room.chat.length===0?<div className="chat-welcome"><span>✧</span><b>The table is yours.</b><p>Say hello, or get the cards moving.</p></div>:room.chat.map((message)=><div className="chat-message" key={message.id}>
        <div className="chat-avatar" style={{'--avatar':message.color}}>{room.players.find(player=>player.id===message.playerId)?.emoji||message.name.slice(0,1).toUpperCase()}</div>
        <div className="chat-message-content"><div className="chat-meta"><b>{message.name}</b><time>{new Date(message.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div><p>{message.message}</p>
          <div className="chat-reactions">{Object.entries(message.reactions||{}).map(([emoji,players])=><button key={emoji} className={players.includes(playerId)?'reacted':''} aria-pressed={players.includes(playerId)} onClick={()=>onReact(message.id,emoji)}>{emoji}<small>{players.length||''}</small></button>)}<button className="reaction-picker-trigger" aria-label="Add reaction" aria-expanded={pickerFor===message.id} onClick={(event)=>togglePicker(message.id,event)}><span aria-hidden="true">☻</span></button></div>
        </div>
      </div>)}<div ref={chatEnd}/></div>
      <div className="players-box"><div className="player-box-title">AT THE TABLE <button onClick={onInvite}>＋ Invite</button></div>{room.players.map((player)=><div className="player-row" key={player.id}><span className="player-avatar" style={{'--avatar':player.color}}>{player.emoji||player.name.slice(0,1).toUpperCase()}<i className={player.online?'':'offline'}/></span><span>{player.name}{player.id===playerId?' (you)':''}</span><small className="player-hand-count">{player.handCount} cards</small>{player.role==='host'?<span className="host-pill">HOST</span>:player.role==='cohost'?<span className="host-pill cohost-pill">COHOST</span>:null}</div>)}</div>
      <form className="chat-composer" onSubmit={onSend}><input value={text} onChange={(event)=>setText(event.target.value)} placeholder="Say something nice…" maxLength={400}/><button type="submit" aria-label="Send message">↑</button></form>
      <div className="chat-foot">Be kind. Keep it fun. <span>♡</span></div>
    </aside>
    {picker}
  </>;
}
