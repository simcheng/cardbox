import React, { useState } from 'react';

const QUICK_REACTIONS=['👍','❤️','😂','👏','🎉','🔥','😍','😮','👀','💯','🤔','🥳'];

export default function ChatDrawer({ open, room, playerId, text, setText, onSend, onClose, onInvite, onReact, chatEnd }) {
  const [pickerFor, setPickerFor] = useState(''), [otherOpen, setOtherOpen] = useState(false), [customEmoji, setCustomEmoji] = useState('');
  return <>
    {open&&<button className="chat-scrim" aria-label="Close chat" onClick={onClose}/>}
    <aside className={`sidebar ${open?'mobile-open':''}`}>
      <div className="sidebar-tabs"><span>CHAT <i>{room.chat.length||''}</i></span><button className="sidebar-close" onClick={onClose}>×</button></div>
      <div className="chat-feed">{room.chat.length===0?<div className="chat-welcome"><span>✧</span><b>The table is yours.</b><p>Say hello, or get the cards moving.</p></div>:room.chat.map((m)=><div className="chat-message" key={m.id}><div className="chat-avatar" style={{'--avatar':m.color}}>{room.players.find(p=>p.id===m.playerId)?.emoji||m.name.slice(0,1).toUpperCase()}</div><div className="chat-message-content"><div className="chat-meta"><b>{m.name}</b><time>{new Date(m.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div><p>{m.message}</p><div className="chat-reactions">{Object.entries(m.reactions||{}).map(([emoji,players])=><button key={emoji} className={players.includes(playerId)?'reacted':''} aria-pressed={players.includes(playerId)} onClick={()=>onReact(m.id,emoji)}>{emoji}<small>{players.length||''}</small></button>)}<div className="reaction-picker-wrap"><button className="reaction-picker-trigger" aria-label="Add reaction" aria-expanded={pickerFor===m.id} onClick={()=>{setPickerFor(pickerFor===m.id?'':m.id);setOtherOpen(false)}}>☻</button>{pickerFor===m.id&&<div className="reaction-picker" role="menu">{QUICK_REACTIONS.map(emoji=><button key={emoji} aria-label={`React ${emoji}`} onClick={()=>{onReact(m.id,emoji);setPickerFor('')}}>{emoji}</button>)}<button className="reaction-other" onClick={()=>setOtherOpen(!otherOpen)}>…</button>{otherOpen&&<form className="reaction-other-form" onSubmit={(e)=>{e.preventDefault();if(customEmoji.trim())onReact(m.id,customEmoji.trim());setCustomEmoji('');setPickerFor('');setOtherOpen(false)}}><input aria-label="Choose another emoji" value={customEmoji} onChange={(e)=>setCustomEmoji(e.target.value)} placeholder="Paste any emoji" maxLength={16}/><button type="submit">Add</button></form>}</div>}</div></div></div></div>)}<div ref={chatEnd}/></div>
      <div className="players-box"><div className="player-box-title">AT THE TABLE <button onClick={onInvite}>＋ Invite</button></div>{room.players.map((p)=><div className="player-row" key={p.id}><span className="player-avatar" style={{'--avatar':p.color}}>{p.name.slice(0,1).toUpperCase()}<i className={p.online?'':'offline'}/></span><span>{p.name}{p.id===playerId?' (you)':''}</span><small className="player-hand-count">{p.handCount} cards</small>{p.id===room.hostId&&<span className="host-pill">HOST</span>}</div>)}</div>
      <form className="chat-composer" onSubmit={onSend}><input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Say something nice…" maxLength={400}/><button type="submit" aria-label="Send message">↑</button></form>
      <div className="chat-foot">Be kind. Keep it fun. <span>♡</span></div>
    </aside>
  </>;
}
