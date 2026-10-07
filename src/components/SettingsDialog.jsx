import React, { useEffect, useState } from 'react';

export default function SettingsDialog({ open, isHost, isModerator, players = [], playerId, theme, themeMode = theme, onTheme, onRoleChange, onKick, turn = {}, onTurn, settings, onChange, onClose }) {
  const [confirmHostId,setConfirmHostId]=useState('');
  const [customTimer,setCustomTimer]=useState(90);
  const [timerChoice,setTimerChoice]=useState(null);
  const timerPresets=[0,15,30,60,120,300];
  const timerValue=timerChoice??(timerPresets.includes(turn.timerSeconds||0)?String(turn.timerSeconds||0):'custom');
  useEffect(()=>setTimerChoice(null),[turn.timerSeconds]);
  if (!open) return null;
  return <div className="modal-shade" onClick={onClose}><section className="settings-modal" onClick={(e)=>e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close settings">×</button><div className="eyebrow">SETTINGS</div><h3>Make the table yours.</h3>
    <label className="setting-row appearance-setting-row"><span><b>Appearance</b><small>Choose a theme or follow this device.</small></span><select className="settings-select" value={themeMode} onChange={(event)=>onTheme(event.target.value)}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <div className="settings-section-label">TABLE RULES</div>
    <Setting label="Private hands" desc="Only each player can see the cards in their hand." value={settings.privateHands} disabled={!isModerator} onChange={(value)=>onChange({privateHands:value})}/>
    <Setting label="Host controls card actions" desc="Only hosts and cohosts can move, shuffle, or deal." value={settings.hostControls} disabled={!isModerator} onChange={(value)=>onChange({hostControls:value})}/>
    {isModerator&&<Setting label="Turn order" desc="Show whose turn it is and rotate through online players." value={!!turn.enabled} onChange={(value)=>onTurn?.(value?'start':'stop')}/>}
    {isModerator&&turn.enabled&&<><label className="setting-row timer-setting-row"><span><b>Turn timer</b><small>Show a countdown for each turn.</small></span><select className="settings-select" value={timerValue} onChange={(event)=>{const value=event.target.value;setTimerChoice(value);if(value==='custom'){setCustomTimer(timerPresets.includes(turn.timerSeconds)?90:turn.timerSeconds||90);return;}onTurn?.('start',Number(value));}}><option value="0">Off</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option><option value="custom">Custom…</option></select></label>{timerValue==='custom'&&<label className="custom-timer-field"><span>Custom seconds</span><input className="settings-number" type="number" min="1" max="3600" value={customTimer} onChange={(event)=>setCustomTimer(event.target.value)} onBlur={()=>onTurn?.('start',Math.max(1,Math.min(3600,Number(customTimer)||90)))} /><small>1–3600 seconds</small></label>}</>}
    {turn.enabled&&<button className="settings-action" disabled={turn.currentPlayerId!==playerId} onClick={()=>onTurn?.('next')}>{turn.currentPlayerId===playerId?'End my turn':'Waiting for current player'}</button>}
    {isModerator&&<section className="role-manager"><div className="settings-section-label">PLAYERS</div>{isHost&&<p>Hosts can manage roles. Cohosts can help run the table.</p>}{players.filter(player=>player.id!==playerId).map(player=><div className="role-row" key={player.id}><span><b>{player.name}</b><small>{player.role==='cohost'?'Cohost':'Player'}{!player.online?' · offline':''}</small></span>{isHost&&<button disabled={!player.online} title={!player.online?'They must be online to change roles':''} onClick={()=>onRoleChange(player.id,'cohost')}>{player.role==='cohost'?'Remove cohost':'Make cohost'}</button>}{isHost&&(confirmHostId===player.id?<div className="role-confirm"><span>Transfer primary host to {player.name}?</span><button disabled={!player.online} onClick={()=>{onRoleChange(player.id,'host');setConfirmHostId('');}}>Confirm</button><button onClick={()=>setConfirmHostId('')}>Cancel</button></div>:<button className="role-transfer" disabled={!player.online} title={!player.online?'They must be online to become host':''} onClick={()=>setConfirmHostId(player.id)}>Make host</button>)}{player.role!=='host'&&<button className="role-kick" disabled={!player.online} title={!player.online?'They are already offline':'Remove this player from the table'} onClick={()=>onKick?.(player.id)}>Kick</button>}</div>)}</section>}
    <div className="modal-note">{isHost?'You’re the primary host.':isModerator?'You’re a cohost and can help manage the table.':'Table rules are controlled by a host or cohost.'}</div>
  </section></div>;
}

function Setting({label,desc,value,disabled,onChange}) {
  return <label className={`setting-row ${disabled?'disabled':''}`}><span><b>{label}</b><small>{desc}</small></span><input type="checkbox" checked={!!value} disabled={disabled} onChange={(e)=>onChange(e.target.checked)}/><i className="switch"/></label>;
}
