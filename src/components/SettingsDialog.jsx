import React from 'react';

export default function SettingsDialog({ open, isHost, settings, onChange, onClose }) {
  if (!open) return null;
  return <div className="modal-shade" onClick={onClose}><section className="settings-modal" onClick={(e)=>e.stopPropagation()}>
    <button className="modal-close" onClick={onClose}>×</button><div className="eyebrow">TABLE SETTINGS</div><h3>Set the ground rules.</h3><p>Changes apply to everyone at this table.</p>
    <Setting label="Private hands" desc="Only each player can see the cards in their hand." value={settings.privateHands} disabled={!isHost} onChange={(value)=>onChange({privateHands:value})}/>
    <Setting label="Host controls card actions" desc="Only you can move, shuffle, or deal cards." value={settings.hostControls} disabled={!isHost} onChange={(value)=>onChange({hostControls:value})}/>
    <div className="modal-note">{isHost?'You’re the host. Invite friends with the link at the top.':'Only the host can change table settings.'}</div>
  </section></div>;
}

function Setting({label,desc,value,disabled,onChange}) {
  return <label className={`setting-row ${disabled?'disabled':''}`}><span><b>{label}</b><small>{desc}</small></span><input type="checkbox" checked={!!value} disabled={disabled} onChange={(e)=>onChange(e.target.checked)}/><i className="switch"/></label>;
}
