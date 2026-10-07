import React, { useState } from 'react';

export default function SettingsDialog({ open, isHost, isModerator, players = [], playerId, theme, onTheme, onRoleChange, onKick, turn = {}, onTurn, settings, onChange, onClose }) {
  const [confirmHostId,setConfirmHostId]=useState('');
  if (!open) return null;
  return <div className="modal-shade" onClick={onClose}><section className="settings-modal" onClick={(e)=>e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close settings">×</button><div className="eyebrow">SETTINGS</div><h3>Make the table yours.</h3>
    <Setting label="Dark mode" desc="Change the colors on this device." value={theme==='dark'} onChange={(value)=>onTheme(value?'dark':'light')}/>
    <div className="settings-section-label">TABLE RULES</div>
    <Setting label="Private hands" desc="Only each player can see the cards in their hand." value={settings.privateHands} disabled={!isModerator} onChange={(value)=>onChange({privateHands:value})}/>
    <Setting label="Host controls card actions" desc="Only hosts and cohosts can move, shuffle, or deal." value={settings.hostControls} disabled={!isModerator} onChange={(value)=>onChange({hostControls:value})}/>
    {isModerator&&<Setting label="Turn order" desc="Show whose turn it is and rotate through online players." value={!!turn.enabled} onChange={(value)=>onTurn?.(value?'start':'stop')}/>}
    {isModerator&&turn.enabled&&<label className="setting-row"><span><b>Turn timer</b><small>Automatically show a countdown for each turn.</small></span><select value={turn.timerSeconds||0} onChange={(event)=>onTurn?.('start',Number(event.target.value))}><option value="0">Off</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option></select></label>}
    {turn.enabled&&<button className="settings-action" disabled={turn.currentPlayerId!==playerId} onClick={()=>onTurn?.('next')}>{turn.currentPlayerId===playerId?'End my turn':'Waiting for current player'}</button>}
    {isModerator&&<section className="role-manager"><div className="settings-section-label">PLAYERS</div>{isHost&&<p>Hosts can manage roles. Cohosts can help run the table.</p>}{players.filter(player=>player.id!==playerId).map(player=><div className="role-row" key={player.id}><span><b>{player.name}</b><small>{player.role==='cohost'?'Cohost':'Player'}{!player.online?' · offline':''}</small></span>{isHost&&<button disabled={!player.online} title={!player.online?'They must be online to change roles':''} onClick={()=>onRoleChange(player.id,'cohost')}>{player.role==='cohost'?'Remove cohost':'Make cohost'}</button>}{isHost&&(confirmHostId===player.id?<div className="role-confirm"><span>Transfer primary host to {player.name}?</span><button disabled={!player.online} onClick={()=>{onRoleChange(player.id,'host');setConfirmHostId('');}}>Confirm</button><button onClick={()=>setConfirmHostId('')}>Cancel</button></div>:<button className="role-transfer" disabled={!player.online} title={!player.online?'They must be online to become host':''} onClick={()=>setConfirmHostId(player.id)}>Make host</button>)}{player.role!=='host'&&<button className="role-kick" disabled={!player.online} title={!player.online?'They are already offline':'Remove this player from the table'} onClick={()=>onKick?.(player.id)}>Kick</button>}</div>)}</section>}
    <div className="modal-note">{isHost?'You’re the primary host.':isModerator?'You’re a cohost and can help manage the table.':'Table rules are controlled by a host or cohost.'}</div>
  </section></div>;
}

function Setting({label,desc,value,disabled,onChange}) {
  return <label className={`setting-row ${disabled?'disabled':''}`}><span><b>{label}</b><small>{desc}</small></span><input type="checkbox" checked={!!value} disabled={disabled} onChange={(e)=>onChange(e.target.checked)}/><i className="switch"/></label>;
}
