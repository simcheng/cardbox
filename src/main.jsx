import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import HandZone from './components/HandZone.jsx';
import ChatDrawer from './components/ChatDrawer.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import ActionBar from './components/ActionBar.jsx';
import TableSurface from './components/TableSurface.jsx';
import InviteDialog from './components/InviteDialog.jsx';
import TableContextMenu from './components/TableContextMenu.jsx';
import ProfileMenu from './components/ProfileMenu.jsx';
import LedgerDialog from './components/LedgerDialog.jsx';
import { resolveTablePlacement } from './game/tableRules.js';
import { listDecks } from '../shared/deckDefinitions.js';
import './style.css';

const socket = io(import.meta.env.DEV ? (import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000') : undefined, { autoConnect: true });
const playerKey = (room) => `cardtable:${room}:player`;
const initialRoom = new URLSearchParams(location.search).get('room');

function App() {
  const [room, setRoom] = useState(null), [playerId, setPlayerId] = useState('');
  const [name, setName] = useState(sessionStorage.getItem('cardtable:name') || '');
  const [roomName, setRoomName] = useState('Friday night cards');
  const [deckId, setDeckId] = useState('standard-52');
  const [roomCode, setRoomCode] = useState(initialRoom || '');
  const [error, setError] = useState(''), [selected, setSelected] = useState(null);
  const [menu, setMenu] = useState(''), [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [chatText, setChatText] = useState(''), [inviteOpen, setInviteOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false), [unreadChat, setUnreadChat] = useState(0), [toast, setToast] = useState('');
  const [preview, setPreview] = useState(null), [dragCard, setDragCard] = useState(null), [dragPosition, setDragPosition] = useState(null), [dragOverHand, setDragOverHand] = useState(false), [pendingPlacement, setPendingPlacement] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('cardtable:theme') || 'light');
  const [handCollapsed, setHandCollapsed] = useState(false), [pileDrag, setPileDrag] = useState(null);
  const [contextMenu, setContextMenu] = useState(null), [cue, setCue] = useState(null);
  const chatEnd = useRef(null), touchStart = useRef(null), cardPointer = useRef(null), ignoreClick = useRef(false), tableRef = useRef(null);
  const viewerRef = useRef(playerId), chatOpenRef = useRef(mobilePanel);
  viewerRef.current=playerId; chatOpenRef.current=mobilePanel;
  const self = room?.players.find((p) => p.id === playerId);
  const isHost = room?.hostId === playerId;
  const canPlay = !room?.settings.hostControls || isHost;
  const myHand = room?.piles.find((p) => p.kind === 'hand' && p.ownerId === playerId);
  const deck = room?.piles.find((p) => p.id === 'deck');
  const previewCard = dragCard || pendingPlacement?.card;
  function setColorTheme(next) { setTheme(next); localStorage.setItem('cardtable:theme', next); }

  useEffect(() => {
    const join = () => {
      if (!initialRoom || !name.trim()) return;
      socket.emit('room:join', { roomId: initialRoom, playerName: name.trim(), playerId: sessionStorage.getItem(playerKey(initialRoom)) }, (r) => {
        if (r.ok) applyRoom(r); else setError(r.error);
      });
    };
    socket.on('connect', join);
    socket.on('room:update', setRoom);
    const onCue = (event) => { setCue(event); if(['chat','chat:react'].includes(event.type)&&event.playerId!==viewerRef.current&&!chatOpenRef.current)setUnreadChat(count=>count+1); setTimeout(()=>setCue((current)=>current?.id===event.id?null:current),['chat','chat:react'].includes(event.type)?2600:900); };
    socket.on('table:cue', onCue);
    return () => { socket.off('connect', join); socket.off('room:update', setRoom); socket.off('table:cue', onCue); };
  }, [initialRoom, name]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [room?.chat?.length]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast]);

  function applyRoom(r) {
    setRoom(r.room); setPlayerId(r.playerId); sessionStorage.setItem(playerKey(r.roomId), r.playerId);
    sessionStorage.setItem('cardtable:name', name.trim());
    history.replaceState({}, '', `${location.pathname}?room=${r.roomId}`); setError('');
  }
  function create() {
    if (!name.trim()) return setError('Add a name to join the table.');
    socket.emit('room:create', { name: roomName, playerName: name.trim(), settings: { privateHands: true, hostControls: false, deckId } }, applyRoom);
  }
  function join() {
    if (!name.trim()) return setError('Add a name to join the table.');
    socket.emit('room:join', { roomId: roomCode, playerName: name.trim(), playerId: sessionStorage.getItem(playerKey(roomCode.toUpperCase())) }, (r) => r.ok ? applyRoom(r) : setError(r.error));
  }
  const action = (type, extra = {}) => socket.emit('table:action', { type, ...extra }, (r) => { if (!r?.ok && r?.error) setToast(r.error); });
  function copyInvite() { setInviteOpen(true); }
  function openContextMenu(event, target) {
    const rect = event.currentTarget?.getBoundingClientRect?.();
    setContextMenu({ ...target, x: event.clientX || rect?.left + rect?.width/2 || 12, y: event.clientY || rect?.bottom || 80 });
  }
  function sendChat(e) { e.preventDefault(); if (chatText.trim()) { action('chat', { message: chatText }); setChatText(''); } }
  function toggleChat() { const opening=!mobilePanel; setMobilePanel(opening); if(opening)setUnreadChat(0); }
  function dropCard(card, from, to) { if (from !== to) action('move', { cardId: card.id, fromId: from, toId: to }); setSelected(null); }
  function placeCard(card, fromId, spot) {
    if (!spot) return;
    action('place', { cardId: card.id, fromId, x: spot.x, y: spot.y, targetId: spot.targetId, mode: spot.mode });
    setSelected(null); setPreview(null); setPendingPlacement(null); setDragCard(null);
  }
  function onCardClick(card, pileId, event) {
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    if (!canPlay) return setToast('The host controls this table.');
    if (selected) { const { card: prior, pileId: from } = selected; if (prior.id === card.id) { if (from === myHand?.id) { setSelected(null); setPendingPlacement(null); setPreview(null); } else action('flip', { cardId: card.id, pileId }); setSelected(null); setPendingPlacement(null); setPreview(null); } else {
      const target = room.piles.find((p) => p.id === pileId);
      if (target?.kind === 'tableau' && event) preparePlacement(prior, from, placementAt(event.clientX,event.clientY));
      else dropCard(prior, from, pileId);
    } }
    else setSelected({ card, pileId });
  }
  function placementAt(clientX,clientY) {
    if (!tableRef.current) return;
    const piles = [...document.querySelectorAll('.tableau-zone')].map((element) => {
      const pile = room.piles.find((item) => item.id === element.dataset.placeId);
      return pile && { ...pile, rect: element.getBoundingClientRect() };
    }).filter(Boolean);
    const hitId = document.elementFromPoint(clientX, clientY)?.closest('.tableau-zone')?.dataset.placeId;
    const directHit = hitId ? piles.filter((pile) => pile.id === hitId) : piles;
    return resolveTablePlacement(clientX, clientY, tableRef.current.getBoundingClientRect(), directHit, hitId);
  }
  function previewAt(e) {
    const spot = placementAt(e.clientX,e.clientY);
    if (spot) setPreview(spot);
    return spot;
  }
  function preparePlacement(card,fromId,spot) {
    if (!spot) return;
    setPendingPlacement({card,fromId,spot}); setDragCard(null); setPreview(spot); setSelected(null);
  }
  function onTableClick(e) {
    if (!selected || e.target.closest('.pile-zone,.table-hand-zone,.seat')) return;
    preparePlacement(selected.card,selected.pileId,placementAt(e.clientX,e.clientY));
  }
  function onPileClick(e,pile) {
    e.stopPropagation();
    if (ignoreClick.current) { ignoreClick.current=false; return; }
    if (!selected) { if (pile.id === 'deck') action('draw',{pileId:'deck'}); return; }
    if (pile.kind==='tableau') preparePlacement(selected.card,selected.pileId,placementAt(e.clientX,e.clientY));
    else dropCard(selected.card,selected.pileId,pile.id);
  }
  function onCardPointerDown(e, card, fromId) {
    if (e.button !== undefined && e.button !== 0) return;
    cardPointer.current = { card, fromId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onCardPointerMove(e) {
    const active = cardPointer.current;
    if (!active || active.pointerId !== e.pointerId) return;
    if (!active.dragging && Math.hypot(e.clientX-active.startX,e.clientY-active.startY) > 7) {
      active.dragging = true; setDragCard(active.card);
    }
    if (active.dragging) {
      e.preventDefault();
      const target = document.elementFromPoint(e.clientX,e.clientY);
      const overHand = !!target?.closest('.table-hand-zone');
      setDragPosition({x:e.clientX,y:e.clientY,card:active.card}); setDragOverHand(overHand);
      if (overHand) setPreview(null); else previewAt(e);
    }
  }
  function onCardPointerUp(e) {
    const active = cardPointer.current;
    if (!active || active.pointerId !== e.pointerId) return;
    cardPointer.current = null;
    if (active.dragging) {
      const handTarget = document.elementFromPoint(e.clientX,e.clientY)?.closest('.table-hand-zone');
      if (handTarget && myHand) {
        if (active.fromId === myHand.id) {
          const beforeCardId = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-card-id]')?.dataset.cardId;
          action('hand:reorder',{cardId:active.card.id,beforeCardId:beforeCardId===active.card.id?null:beforeCardId});
        } else action('move',{cardId:active.card.id,fromId:active.fromId,toId:myHand.id});
        setPreview(null);setSelected(null);setDragCard(null);setDragPosition(null);setDragOverHand(false);
      } else {
        const finalSpot = previewAt(e) || preview;
        if (finalSpot) placeCard(active.card, active.fromId, finalSpot);
        setDragPosition(null);setDragOverHand(false);
      }
      ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
    }
  }
  function onCardPointerCancel(e) {
    if (cardPointer.current?.pointerId !== e.pointerId) return;
    cardPointer.current = null; setPreview(null); setSelected(null); setDragCard(null); setDragPosition(null); setDragOverHand(false);
  }
  function onPilePointerDown(e, pile) {
    if (!canPlay || pile.kind === 'hand' || (e.target.closest('.playing-card') && !e.target.closest('.pile-grab'))) return;
    const bounds = tableRef.current.getBoundingClientRect();
    const pileRect = e.currentTarget.getBoundingClientRect();
    touchStart.current = { x: e.clientX, y: e.clientY, pile, pointerId: e.pointerId, bounds, moved: false, grabOffsetX: e.clientX-(pileRect.left+pileRect.width/2), grabOffsetY: e.clientY-(pileRect.top+pileRect.height/2) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPilePointerMove(e) {
    const active = touchStart.current; if (!active || active.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX-active.x,e.clientY-active.y) > 7) active.moved = true;
    if (!active.moved) return;
    const bounds = active.bounds;
    setPileDrag({ pileId: active.pile.id, x: Math.min(94,Math.max(6,(e.clientX-active.grabOffsetX-bounds.left)/bounds.width*100)), y: Math.min(78,Math.max(18,(e.clientY-active.grabOffsetY-bounds.top)/bounds.height*100)) });
  }
  function onPilePointerUp(e) {
    const active = touchStart.current; if (!active || active.pointerId !== e.pointerId) return;
    touchStart.current = null;
    if (active.moved) {
      const bounds = active.bounds;
      const x = Math.min(94,Math.max(6,(e.clientX-active.grabOffsetX-bounds.left)/bounds.width*100));
      const y = Math.min(78,Math.max(18,(e.clientY-active.grabOffsetY-bounds.top)/bounds.height*100));
      action('pile:move', { pileId: active.pile.id, x, y }); ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
    }
    setPileDrag(null);
  }
  function onPilePointerCancel(e) {
    if (touchStart.current?.pointerId !== e.pointerId) return;
    touchStart.current = null;
    setPileDrag(null);
  }

  function commitPreview() {
    if (pendingPlacement) placeCard(pendingPlacement.card,pendingPlacement.fromId,pendingPlacement.spot);
  }
  function cancelPreview() { setPendingPlacement(null);setPreview(null);setSelected(null); }

  if (!room) return <main className="welcome" data-theme={theme}><div className="welcome-glow"/><div className="welcome-top"><a className="brand" href="#"><span className="brand-mark">♧</span> cardtable</a><div className="welcome-actions"><button className="icon-button theme-toggle" onClick={()=>setColorTheme(theme==='dark'?'light':'dark')} aria-label="Toggle theme">{theme==='dark'?'☼':'☾'}</button><span className="live-note"><i/> A table for everyone</span></div></div><section className="welcome-card"><div className="eyebrow"><span>✦</span> YOUR GAME, YOUR RULES</div><h1>Make room<br/>for <em>one more.</em></h1><p className="intro">A relaxed place to play cards together.<br/>No scorekeeping required.</p><label className="field-label" htmlFor="guest">YOUR NAME</label><input id="guest" value={name} onChange={(e)=>setName(e.target.value)} placeholder="What should we call you?" maxLength={24} onKeyDown={(e)=>e.key==='Enter'&&create()}/><div className="create-form"><input value={roomName} onChange={(e)=>setRoomName(e.target.value)} aria-label="Table name"/><select className="deck-choice" value={deckId} onChange={(e)=>setDeckId(e.target.value)} aria-label="Card deck">{listDecks().map((deck)=><option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><button className="primary-button" onClick={create}>Create a table <span>↗</span></button></div><div className="or-line"><span/>or join a table<span/></div><div className="join-form"><input value={roomCode} onChange={(e)=>setRoomCode(e.target.value.toUpperCase())} placeholder="Enter invite code" aria-label="Invite code"/><button className="join-button" onClick={join}>Join table</button></div>{error&&<div className="error-note">{error}</div>}<div className="welcome-foot"><span>♠</span> 52 cards · Infinite ways to play <span>♥</span></div></section><footer className="site-foot">BUILT FOR GAME NIGHT <span>·</span> JUST ADD FRIENDS</footer></main>;

  const handZone = <HandZone hand={myHand} playerId={playerId} selectedId={selected?.card.id} contextCardId={contextMenu?.cardId} dragCardId={dragCard?.id} cue={cue} collapsed={handCollapsed} onToggle={()=>setHandCollapsed(!handCollapsed)} onDraw={()=>action('draw',{pileId:'deck'})} onSort={(mode)=>action('sort-hand',{mode})} onCardClick={onCardClick} onOpenContextMenu={openContextMenu} onPointerDown={onCardPointerDown} onPointerMove={onCardPointerMove} onPointerUp={onCardPointerUp} onPointerCancel={onCardPointerCancel}/>

  return <main className={`app-shell ${cue?`cue-${cue.type.replace(':','-')}`:''}`} data-theme={theme}>
    <header className="topbar"><a className="brand" href="/" onClick={(e)=>{e.preventDefault();history.pushState({},'',location.pathname);setRoom(null)}}><span className="brand-mark">♧</span> cardtable</a><div className="table-title"><span className="table-dot"/><div><b>{room.name}</b><small>{room.players.length} at the table</small></div></div><div className="top-actions"><button className="chat-top-button" onClick={toggleChat} aria-expanded={mobilePanel}>☰ <span>Chat</span>{unreadChat>0&&<i className="chat-unread">{unreadChat}</i>}</button><button className="icon-button theme-toggle" onClick={()=>setColorTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Use light theme':'Use dark theme'}>{theme==='dark'?'☼':'☾'}</button><button className="subtle-button invite-button" aria-label="Invite friends" onClick={()=>setInviteOpen(true)}>↗ <span>Invite friends</span></button><button className="icon-button settings-trigger" onClick={()=>setSettingsOpen(!settingsOpen)} aria-label="Table settings">⚙</button><div className="profile-control"><button className={`avatar ${cue?.playerId===playerId?'action-actor':''}`} style={{'--avatar':self?.color}} title={self?.name} aria-label="Open profile menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(!profileOpen)}>{self?.emoji||self?.name?.slice(0,1).toUpperCase()}</button><ProfileMenu open={profileOpen} player={self} isHost={isHost} room={room} theme={theme} onTheme={()=>setColorTheme(theme==='dark'?'light':'dark')} onInvite={()=>setInviteOpen(true)} onSettings={()=>setSettingsOpen(true)} onProfile={(values)=>action('profile',values)} onClose={()=>setProfileOpen(false)} onToast={setToast}/></div></div></header>
    <div className="game-layout"><section className="play-area"><div className="table-heading"><div><span className="eyebrow light">THE TABLE</span><h2>Make yourself at home.</h2></div><div className="table-tools"><button className="more-button" aria-expanded={menu==='actions'} onClick={()=>setMenu(menu==='actions'?'':'actions')}>•••</button>{menu==='actions'&&<div className="popover action-menu"><b>Table actions</b><button onClick={()=>{action('pile:create',{name:'New pile'});setMenu('')}}>＋ Add a pile</button><button onClick={()=>{action('shuffle',{pileId:'deck'});setMenu('')}}>↻ Shuffle the deck</button><button onClick={()=>{setLedgerOpen(true);setMenu('')}}>◷ View action history</button><button onClick={()=>{setSettingsOpen(true);setMenu('')}}>⚙ Table settings</button></div>}</div></div>
      <TableSurface room={room} playerId={playerId} tableRef={tableRef} selected={selected} preview={preview} previewCard={previewCard} pileDrag={pileDrag} handZone={handZone} cue={cue} contextCardId={contextMenu?.cardId} dragCardId={dragCard?.id} dragPosition={dragPosition} dragOverHand={dragOverHand} onOpenContextMenu={openContextMenu} onSurfaceClick={onTableClick} onPileClick={onPileClick} onCardClick={onCardClick} onPilePointerDown={onPilePointerDown} onPilePointerMove={onPilePointerMove} onPilePointerUp={onPilePointerUp} onPilePointerCancel={onPilePointerCancel} onCardPointerDown={onCardPointerDown} onCardPointerMove={onCardPointerMove} onCardPointerUp={onCardPointerUp} onCardPointerCancel={onCardPointerCancel} onConfirmPlacement={commitPreview} onCancelPlacement={cancelPreview} pendingPlacement={pendingPlacement}/>
      <ActionBar deckCount={deck?.cards.length||0} canUndo={room.canUndo} canPlay={canPlay} isHost={isHost} onAction={action} onLedger={()=>setLedgerOpen(true)} onFlipSelected={()=>{if(selected)action('flip',{cardId:selected.card.id,pileId:selected.pileId});setSelected(null)}}/>
    </section></div>
    <ChatDrawer open={mobilePanel} room={room} playerId={playerId} text={chatText} setText={setChatText} onSend={sendChat} onReact={(messageId,emoji)=>action('chat:react',{messageId,emoji})} onClose={()=>setMobilePanel(false)} onInvite={copyInvite} chatEnd={chatEnd}/>
    <SettingsDialog open={settingsOpen} isHost={isHost} settings={room.settings} onChange={(settings)=>action('settings',{settings})} onClose={()=>setSettingsOpen(false)}/>
    <InviteDialog open={inviteOpen} room={room} onClose={()=>setInviteOpen(false)} onToast={setToast}/>
    <TableContextMenu menu={contextMenu} room={room} playerId={playerId} onAction={action} onClose={()=>setContextMenu(null)}/>
    <LedgerDialog open={ledgerOpen} entries={room.ledger||[]} onClose={()=>setLedgerOpen(false)}/>
    {toast&&<div className="toast">{toast}</div>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
