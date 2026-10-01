import React from 'react';

const ANIMALS = ['🐱','🐶','🐻','🐼','🦊','🐸','🐵','🐧','🦉','🐰'];
const COLORS = ['#e0ad74','#84b6a0','#ce8d91','#9a9dde','#d6c66f','#80a8cf','#c48e59','#7697a8'];

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const field=document.createElement('textarea'); field.value=value; field.style.position='fixed'; field.style.opacity='0'; document.body.append(field); field.select();
  const copied=document.execCommand('copy'); field.remove(); if(!copied) throw new Error('Copy failed');
}

export default function ProfileMenu({ open, player, isHost, isCohost, isModerator, room, onInvite, onSettings, onProfile, onClose, onToast }) {
  if (!open) return null;
  async function copyCode() { try { await copyText(room.id); onToast('Room code copied'); onClose(); } catch { onToast('Select the room code to copy it'); } }
  return <><button className="profile-dismiss" aria-label="Close profile menu" onClick={onClose}/><div className="profile-popover" role="menu">
    <div className="profile-summary"><span className="avatar profile-avatar">{player?.emoji||player?.name?.slice(0,1).toUpperCase()}</span><span><b>{player?.name}</b><small>{isHost?'Primary host':isCohost?'Cohost':'Guest player'}</small></span></div>
    <div className="profile-customize"><label>AVATAR</label><div className="profile-emoji-options">{ANIMALS.map(emoji=><button key={emoji} className={player?.emoji===emoji?'chosen':''} aria-label={`Use ${emoji} avatar`} aria-pressed={player?.emoji===emoji} onClick={()=>onProfile({emoji})}>{emoji}</button>)}</div><label>BACKGROUND</label><div className="profile-color-options">{COLORS.map(color=><button key={color} className={player?.color===color?'chosen':''} aria-label={`Use ${color} background`} aria-pressed={player?.color===color} style={{'--swatch':color}} onClick={()=>onProfile({color})}/>)}</div></div>
    <div className="profile-code"><span>ROOM CODE</span><b>{room.id}</b><button onClick={copyCode}>Copy</button></div>
    <button role="menuitem" onClick={()=>{onInvite();onClose()}}>↗ Invite friends</button>
    {isModerator&&<button role="menuitem" onClick={()=>{onSettings();onClose()}}>⚙ Settings</button>}
  </div></>;
}
