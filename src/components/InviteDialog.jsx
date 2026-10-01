import React, { useState } from 'react';

export default function InviteDialog({ open, room, onClose, onToast }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const url = `${location.origin}${location.pathname}?room=${room.id}`;
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const field = document.createElement('textarea'); field.value = url;
        field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field);
        field.select(); const ok = document.execCommand('copy'); field.remove();
        if (!ok) throw new Error('copy unavailable');
      }
      setCopied(true); onToast('Invite link copied'); setTimeout(() => setCopied(false), 1800);
    } catch { onToast('Select and copy the invite link below'); }
  }
  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(room.id);
      else { const field=document.createElement('textarea');field.value=room.id;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw new Error('copy unavailable'); }
      onToast('Room code copied');
    } catch { onToast('Select the room code to copy it'); }
  }
  async function share() {
    if (!navigator.share) return copy();
    try { await navigator.share({ title: `Join ${room.name}`, text: `Join my Cardtable room with code ${room.id}`, url }); }
    catch (error) { if (error?.name !== 'AbortError') onToast('Could not open the share menu'); }
  }
  return <div className="modal-shade invite-shade" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <button className="modal-close" onClick={onClose} aria-label="Close invite dialog">×</button>
      <span className="eyebrow">BRING YOUR PEOPLE</span><h3 id="invite-title">Invite friends</h3>
      <p>Share the link or room code. Friends can join from a phone or computer.</p>
      <label htmlFor="invite-link">INVITE LINK</label><div className="invite-link-row"><input id="invite-link" value={url} readOnly onFocus={(event)=>event.target.select()}/><button onClick={copy}>{copied?'Copied':'Copy link'}</button></div>
      <div className="invite-code"><span>ROOM CODE</span><b>{room.id}</b><button onClick={copyCode}>Copy code</button></div>
      <button className="invite-share" onClick={share}>Share invite…</button>
    </section>
  </div>;
}
