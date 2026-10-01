import React from 'react';

export default function LedgerDialog({ open, entries = [], onClose }) {
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}>
    <section className="ledger-modal" role="dialog" aria-modal="true" aria-labelledby="ledger-title">
      <header><div><span className="eyebrow">TABLE RECORD</span><h2 id="ledger-title">Action history</h2></div><button className="icon-button" onClick={onClose} aria-label="Close history">×</button></header>
      <p className="ledger-intro">Actions are recorded in order for this table session.</p>
      <div className="ledger-list">{entries.length ? [...entries].reverse().map((entry)=><article className="ledger-entry" key={entry.id}>
        <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit' })}</time>
        <b>{entry.playerName}</b><span>{entry.description}</span>
        {entry.details?.cards?.length>0&&<small>{entry.details.cards.join(' · ')}</small>}
        {entry.details?.recipients&&<small>To: {entry.details.recipients.join(', ')}</small>}
      </article>) : <div className="ledger-empty">No actions recorded yet.</div>}</div>
      <footer><span>{entries.length} recorded {entries.length===1?'action':'actions'}</span><button className="primary-button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
