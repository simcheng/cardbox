import React from 'react';

export default function LedgerDialog({ open, entries = [], roomName = 'cardbox', onClose }) {
  const exportHistory = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      table: roomName,
      actionCount: entries.length,
      actions: entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = String(roomName || 'cardbox').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'cardbox';
    link.href = url;
    link.download = `${safeName}-action-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}>
    <section className="ledger-modal" role="dialog" aria-modal="true" aria-labelledby="ledger-title">
      <header><div><span className="eyebrow">TABLE RECORD</span><h2 id="ledger-title">Action history</h2></div><button className="icon-button" onClick={onClose} aria-label="Close history">×</button></header>
      <p className="ledger-intro">Actions are recorded in order for this table session.</p>
      <div className="ledger-list">{entries.length ? [...entries].reverse().map((entry)=><article className="ledger-entry" key={entry.id}>
        <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit' })}</time>
        <b>{entry.playerName}</b><span>{entry.description}</span>
        {entry.details?.cards?.length>0&&<small>{entry.details.cards.join(' · ')}</small>}
        {entry.details?.count!==undefined&&!entry.details?.cards?.length&&<small>{entry.details.count} {entry.details.count===1?'card':'cards'} recorded</small>}
        {entry.details?.layout&&<small>Layout: {entry.details.layout}</small>}
        {entry.details?.recipients&&<small>To: {entry.details.recipients.join(', ')}</small>}
        {entry.details?.sources?.length>0&&<small>From: {entry.details.sources.join(', ')}</small>}
        {entry.details?.source&&<small>From: {entry.details.source}</small>}
        {entry.details?.destination&&<small>To: {entry.details.destination}</small>}
        {entry.details?.stack&&<small>Stack: {entry.details.stack}</small>}
        {entry.details?.position&&<small>Position: {Math.round(entry.details.position.x)}%, {Math.round(entry.details.position.y)}%</small>}
        {entry.details?.message&&<small>Message: {entry.details.message}</small>}
        {entry.details?.messageAuthor&&<small>Message from: {entry.details.messageAuthor}</small>}
        {(entry.details?.emoji||entry.details?.color)&&<small>Profile: {[entry.details.emoji,entry.details.color].filter(Boolean).join(' · ')}</small>}
        {entry.details?.settings&&<small>Settings: {Object.entries(entry.details.settings).map(([key,value])=>`${key} ${String(value)}`).join(' · ')}</small>}
      </article>) : <div className="ledger-empty">No actions recorded yet.</div>}</div>
      <footer><span>{entries.length} recorded {entries.length===1?'action':'actions'}</span><div className="ledger-footer-actions"><button className="subtle-button" onClick={exportHistory} disabled={!entries.length}>Export JSON</button><button className="primary-button" onClick={onClose}>Done</button></div></footer>
    </section>
  </div>;
}
