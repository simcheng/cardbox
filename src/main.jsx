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
  const [error, setError] = useState(''), [selected, setSelected] = useState([]), [selectionBox, setSelectionBox] = useState(null);
  const [menu, setMenu] = useState(''), [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [chatText, setChatText] = useState(''), [inviteOpen, setInviteOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false), [unreadChat, setUnreadChat] = useState(0), [toast, setToast] = useState('');
  const [preview, setPreview] = useState(null), [dragCard, setDragCard] = useState(null), [dragCount, setDragCount] = useState(1), [dragPosition, setDragPosition] = useState(null), [dragOverHand, setDragOverHand] = useState(false), [pendingPlacement, setPendingPlacement] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('cardtable:theme') || 'light');
  const [handCollapsed, setHandCollapsed] = useState(false), [pileDrag, setPileDrag] = useState(null);
  const [contextMenu, setContextMenu] = useState(null), [cue, setCue] = useState(null);
  const chatEnd = useRef(null), touchStart = useRef(null), cardPointer = useRef(null), selectionPointer = useRef(null), ignoreClick = useRef(false), tableRef = useRef(null);
  const viewerRef = useRef(playerId), chatOpenRef = useRef(mobilePanel);
  viewerRef.current=playerId; chatOpenRef.current=mobilePanel;
  const self = room?.players.find((p) => p.id === playerId);
  const isHost = room?.hostId === playerId;
  const canPlay = !room?.settings.hostControls || isHost;
  const myHand = room?.piles.find((p) => p.kind === 'hand' && p.ownerId === playerId);
  const deck = room?.piles.find((p) => p.id === 'deck');
  const previewCard = dragCard || pendingPlacement?.cards?.[0]?.card;
  const selectedIds = selected.map((item)=>item.card.id);
  function clearSelection() { setSelected([]); }
  function moveSelection(toId, cards = selected) {
    if (!cards.length) return;
    action('move-cards',{cards:cards.map(({card,pileId})=>({cardId:card.id,fromId:pileId})),toId});
    clearSelection();
  }
  function placeSelection(spot, cards = selected) {
    if (!spot || !cards.length) return;
    action('place-cards',{cards:cards.map(({card,pileId})=>({cardId:card.id,fromId:pileId})),x:spot.x,y:spot.y,targetId:spot.targetId,mode:spot.mode});
    clearSelection(); setPreview(null); setPendingPlacement(null); setDragCard(null); setDragCount(1); setDragPosition(null); setDragOverHand(false);
  }
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
  useEffect(() => {
    if (!pileDrag?.pending) return;
    const persisted = room?.piles.find((pile)=>pile.id===pileDrag.pileId);
    if (persisted && Math.abs(persisted.x-pileDrag.x)<0.01 && Math.abs(persisted.y-pileDrag.y)<0.01) setPileDrag(null);
  }, [room, pileDrag]);

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
  function prepareSelectionPlacement(cards,spot) {
    if (!spot || !cards.length) return;
    setPendingPlacement({cards,spot}); setDragCard(null); setPreview(spot); clearSelection();
  }
  function onCardClick(card, pileId, event) {
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    if (!canPlay) return setToast('The host controls this table.');
    const isSelected = selected.some(item=>item.card.id===card.id);
    if (event?.ctrlKey || event?.metaKey) {
      setSelected(current=>isSelected?current.filter(item=>item.card.id!==card.id):[...current,{card,pileId}]);
      return;
    }
    if (event?.shiftKey) {
      const pile = room.piles.find(item=>item.id===pileId);
      const anchor = [...selected].reverse().find(item=>item.pileId===pileId) || selected.at(-1);
      const start = pile?.cards.findIndex(item=>item.id===anchor?.card.id) ?? -1;
      const end = pile?.cards.findIndex(item=>item.id===card.id) ?? -1;
      if (pile && start>=0 && end>=0) {
        const range = pile.cards.slice(Math.min(start,end),Math.max(start,end)+1).map(item=>({card:item,pileId}));
        setSelected(current=>[...current.filter(item=>item.pileId!==pileId),...range]);
      } else setSelected(current=>current.some(item=>item.card.id===card.id)?current:[...current,{card,pileId}]);
      return;
    }
    if (isSelected) return;
    if (selected.length) {
      const target = room.piles.find((p) => p.id === pileId);
      if (target?.kind === 'tableau' && event) prepareSelectionPlacement(selected,placementAt(event.clientX,event.clientY));
      else moveSelection(pileId);
      return;
    }
    setSelected([{ card, pileId }]);
  }
  function placementAt(clientX,clientY) {
    if (!tableRef.current) return;
    const tableRect = tableRef.current.getBoundingClientRect();
    if (clientX < tableRect.left || clientX > tableRect.right || clientY < tableRect.top || clientY > tableRect.bottom) return null;
    const piles = [...document.querySelectorAll('.tableau-zone')].map((element) => {
      const pile = room.piles.find((item) => item.id === element.dataset.placeId);
      return pile && { ...pile, rect: element.getBoundingClientRect() };
    }).filter(Boolean);
    const hitId = document.elementFromPoint(clientX, clientY)?.closest('.tableau-zone')?.dataset.placeId;
    const directHit = hitId ? piles.filter((pile) => pile.id === hitId) : piles;
    return resolveTablePlacement(clientX, clientY, tableRect, directHit, hitId);
  }
  function previewAt(e) {
    const spot = placementAt(e.clientX,e.clientY);
    setPreview(spot||null);
    return spot;
  }
  function onTableClick(e) {
    if (ignoreClick.current) { ignoreClick.current=false; return; }
    if (!selected.length || e.target.closest('.pile-zone,.table-hand-zone,.seat')) return;
    prepareSelectionPlacement(selected,placementAt(e.clientX,e.clientY));
  }
  function onPileClick(e,pile) {
    e.stopPropagation();
    if (ignoreClick.current) { ignoreClick.current=false; return; }
    if (!selected.length) { if (pile.id === 'deck') canPlay ? action('draw',{pileId:'deck'}) : setToast('The host controls this table.'); return; }
    if (!canPlay) { clearSelection(); setToast('The host controls this table.'); return; }
    if (pile.kind==='tableau') prepareSelectionPlacement(selected,placementAt(e.clientX,e.clientY));
    else moveSelection(pile.id);
  }
  function onCardPointerDown(e, card, fromId) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!canPlay && fromId !== myHand?.id) return;
    if (pendingPlacement) { setPendingPlacement(null); setPreview(null); }
    const group = selected.find(item=>item.card.id===card.id) ? selected : [{card,pileId:fromId}];
    cardPointer.current = { card, fromId, cards:group, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onCardPointerMove(e) {
    const active = cardPointer.current;
    if (!active || active.pointerId !== e.pointerId) return;
    if (!active.dragging && Math.hypot(e.clientX-active.startX,e.clientY-active.startY) > 7) {
      active.dragging = true; setDragCard(active.card); setDragCount(active.cards.length);
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
      if (handTarget) {
        const handId = myHand?.id || `hand-${playerId}`;
        if (active.cards.every(item=>item.pileId===handId)) {
          const beforeCardId = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-card-id]')?.dataset.cardId;
          if(active.cards.length===1){if(beforeCardId!==active.card.id)action('hand:reorder',{cardId:active.card.id,beforeCardId});}
          else if(!active.cards.some(item=>item.card.id===beforeCardId))action('hand:reorder-cards',{cardIds:active.cards.map(item=>item.card.id),beforeCardId});
        } else moveSelection(handId,active.cards);
        setPreview(null);clearSelection();setDragCard(null);setDragCount(1);setDragPosition(null);setDragOverHand(false);
      } else {
        const targetElement = document.elementFromPoint(e.clientX,e.clientY)?.closest('.pile-zone');
        const targetPile = targetElement && room.piles.find(pile=>pile.id===targetElement.dataset.placeId);
        if (targetPile && targetPile.kind !== 'tableau') {
          if (!canPlay) setToast('The host controls this table.');
          else moveSelection(targetPile.id,active.cards);
          setPreview(null);setPendingPlacement(null);clearSelection();setDragCard(null);setDragCount(1);setDragPosition(null);setDragOverHand(false);
          ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
          return;
        }
        if (!canPlay) {
          setPreview(null); clearSelection(); setDragCard(null); setDragCount(1); setDragPosition(null); setDragOverHand(false);
          setToast('The host controls this table.');
          ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
          return;
        }
        const finalSpot = previewAt(e);
        if (finalSpot) placeSelection(finalSpot,active.cards);
        else { clearSelection(); setPendingPlacement(null); setPreview(null); }
        setDragCard(null);setDragCount(1);setDragPosition(null);setDragOverHand(false);
      }
      ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
    }
  }
  function onCardPointerCancel(e) {
    if (cardPointer.current?.pointerId !== e.pointerId) return;
    cardPointer.current = null; setPendingPlacement(null); setPreview(null); clearSelection(); setDragCard(null); setDragCount(1); setDragPosition(null); setDragOverHand(false);
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
      setPileDrag({pileId:active.pile.id,x,y,pending:true});
      action('pile:move', { pileId: active.pile.id, x, y }); ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
    } else setPileDrag(null);
  }
  function onPilePointerCancel(e) {
    if (touchStart.current?.pointerId !== e.pointerId) return;
    touchStart.current = null;
    setPileDrag(null);
  }

  function onSurfacePointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target;
    if (target.closest('.playing-card,.pile-zone,.pile-grab,.pile-menu-button,.seat,.placement-confirm,.toolbar,button,input,select,textarea')) return;
    const bounds = tableRef.current?.getBoundingClientRect();
    if (!bounds) return;
    selectionPointer.current = { pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,bounds,moved:false,add:e.ctrlKey||e.metaKey };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSurfacePointerMove(e) {
    const gesture = selectionPointer.current;
    if (!gesture || gesture.pointerId!==e.pointerId) return;
    gesture.x=e.clientX; gesture.y=e.clientY;
    if (!gesture.moved && Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)<8) return;
    gesture.moved=true; e.preventDefault();
    const left=Math.min(gesture.startX,gesture.x)-gesture.bounds.left, top=Math.min(gesture.startY,gesture.y)-gesture.bounds.top;
    setSelectionBox({x:left,y:top,width:Math.abs(gesture.x-gesture.startX),height:Math.abs(gesture.y-gesture.startY)});
  }
  function onSurfacePointerUp(e) {
    const gesture=selectionPointer.current;
    if (!gesture || gesture.pointerId!==e.pointerId) return;
    selectionPointer.current=null;
    if (gesture.moved) {
      const box={left:Math.min(gesture.startX,gesture.x),right:Math.max(gesture.startX,gesture.x),top:Math.min(gesture.startY,gesture.y),bottom:Math.max(gesture.startY,gesture.y)};
      const hits=[...tableRef.current.querySelectorAll('.playing-card:not(.drag-source)')].filter((element)=>{const rect=element.getBoundingClientRect();return rect.right>=box.left&&rect.left<=box.right&&rect.bottom>=box.top&&rect.top<=box.bottom;});
      const found=hits.map((element)=>{const cardId=element.dataset.cardId;const pile=room.piles.find(item=>item.cards.some(card=>card.id===cardId));const card=pile?.cards.find(item=>item.id===cardId);return card&&pile?{card,pileId:pile.id}:null;}).filter(Boolean);
      setSelected(current=>gesture.add?[...current.filter(item=>!found.some(hit=>hit.card.id===item.card.id)),...found]:found);
      setSelectionBox(null); ignoreClick.current=true; setTimeout(()=>{ignoreClick.current=false;},250);
    } else setSelectionBox(null);
  }
  function onSurfacePointerCancel(e) {
    if (selectionPointer.current?.pointerId!==e.pointerId) return;
    selectionPointer.current=null;setSelectionBox(null);
  }

  function commitPreview() {
    if (pendingPlacement) placeSelection(pendingPlacement.spot,pendingPlacement.cards);
  }
  function cancelPreview() { setPendingPlacement(null);setPreview(null);clearSelection(); }

  if (!room) return <main className="welcome" data-theme={theme}><div className="welcome-glow"/><div className="welcome-top"><a className="brand" href="#"><span className="brand-mark">♧</span> cardtable</a><div className="welcome-actions"><button className="icon-button theme-toggle" onClick={()=>setColorTheme(theme==='dark'?'light':'dark')} aria-label="Toggle theme">{theme==='dark'?'☼':'☾'}</button><span className="live-note"><i/> A table for everyone</span></div></div><section className="welcome-card"><div className="eyebrow"><span>✦</span> YOUR GAME, YOUR RULES</div><h1>Make room<br/>for <em>one more.</em></h1><p className="intro">A relaxed place to play cards together.<br/>No scorekeeping required.</p><label className="field-label" htmlFor="guest">YOUR NAME</label><input id="guest" value={name} onChange={(e)=>setName(e.target.value)} placeholder="What should we call you?" maxLength={24} onKeyDown={(e)=>e.key==='Enter'&&create()}/><div className="create-form"><input value={roomName} onChange={(e)=>setRoomName(e.target.value)} aria-label="Table name"/><select className="deck-choice" value={deckId} onChange={(e)=>setDeckId(e.target.value)} aria-label="Card deck">{listDecks().map((deck)=><option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><button className="primary-button" onClick={create}>Create a table <span>↗</span></button></div><div className="or-line"><span/>or join a table<span/></div><div className="join-form"><input value={roomCode} onChange={(e)=>setRoomCode(e.target.value.toUpperCase())} placeholder="Enter invite code" aria-label="Invite code"/><button className="join-button" onClick={join}>Join table</button></div>{error&&<div className="error-note">{error}</div>}<div className="welcome-foot"><span>♠</span> 52 cards · Infinite ways to play <span>♥</span></div></section><footer className="site-foot">BUILT FOR GAME NIGHT <span>·</span> JUST ADD FRIENDS</footer></main>;

  const handZone = <HandZone hand={myHand} playerId={playerId} canPlay={canPlay} selectedIds={selectedIds} contextCardId={contextMenu?.cardId} dragCardId={dragCard?.id} cue={cue} collapsed={handCollapsed} onToggle={()=>setHandCollapsed(!handCollapsed)} onDraw={()=>action('draw',{pileId:'deck'})} onSort={(mode)=>action('sort-hand',{mode})} onCardClick={onCardClick} onOpenContextMenu={openContextMenu} onPointerDown={onCardPointerDown} onPointerMove={onCardPointerMove} onPointerUp={onCardPointerUp} onPointerCancel={onCardPointerCancel}/>

  return <main className={`app-shell ${cue?`cue-${cue.type.replace(':','-')}`:''}`} data-theme={theme}>
    <header className="topbar"><a className="brand" href="/" onClick={(e)=>{e.preventDefault();history.pushState({},'',location.pathname);setRoom(null)}}><span className="brand-mark">♧</span> cardtable</a><div className="table-title"><span className="table-dot"/><div><b>{room.name}</b><small>{room.players.filter(p=>p.online).length} at the table</small></div></div><div className="top-actions"><button className="chat-top-button" onClick={toggleChat} aria-expanded={mobilePanel}>☰ <span>Chat</span>{unreadChat>0&&<i className="chat-unread">{unreadChat}</i>}</button><button className="icon-button theme-toggle" onClick={()=>setColorTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Use light theme':'Use dark theme'}>{theme==='dark'?'☼':'☾'}</button><button className="subtle-button invite-button" aria-label="Invite friends" onClick={()=>setInviteOpen(true)}>↗ <span>Invite friends</span></button>{isHost&&<button className="icon-button settings-trigger" onClick={()=>setSettingsOpen(!settingsOpen)} aria-label="Table settings">⚙</button>}<div className="profile-control"><button className={`avatar ${cue?.playerId===playerId?'action-actor':''}`} style={{'--avatar':self?.color}} title={self?.name} aria-label="Open profile menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(!profileOpen)}>{self?.emoji||self?.name?.slice(0,1).toUpperCase()}</button><ProfileMenu open={profileOpen} player={self} isHost={isHost} room={room} theme={theme} onTheme={()=>setColorTheme(theme==='dark'?'light':'dark')} onInvite={()=>setInviteOpen(true)} onSettings={()=>setSettingsOpen(true)} onProfile={(values)=>action('profile',values)} onClose={()=>setProfileOpen(false)} onToast={setToast}/></div></div></header>
    <div className="game-layout"><section className="play-area"><div className="table-heading"><div><span className="eyebrow light">THE TABLE</span><h2>Make yourself at home.</h2></div><div className="table-tools"><button className="more-button" aria-expanded={menu==='actions'} onClick={()=>setMenu(menu==='actions'?'':'actions')}>•••</button>{menu==='actions'&&<div className="popover action-menu"><b>Table actions</b>{canPlay&&<><button onClick={()=>{action('pile:create',{name:'New pile'});setMenu('')}}>＋ Add a pile</button><button onClick={()=>{action('shuffle',{pileId:'deck'});setMenu('')}}>↻ Shuffle the deck</button></>}<button onClick={()=>{setLedgerOpen(true);setMenu('')}}>◷ View action history</button>{isHost&&<button onClick={()=>{setSettingsOpen(true);setMenu('')}}>⚙ Table settings</button>}</div>}</div></div>
      <TableSurface room={room} playerId={playerId} tableRef={tableRef} selectedIds={selectedIds} selectionBox={selectionBox} preview={preview} previewCard={previewCard} previewCount={pendingPlacement?.cards?.length||dragCount} dragCount={dragCount} pileDrag={pileDrag} handZone={handZone} cue={cue} contextCardId={contextMenu?.cardId} dragCardId={dragCard?.id} dragPosition={dragPosition} dragOverHand={dragOverHand} onOpenContextMenu={openContextMenu} onSurfaceClick={onTableClick} onSurfacePointerDown={onSurfacePointerDown} onSurfacePointerMove={onSurfacePointerMove} onSurfacePointerUp={onSurfacePointerUp} onSurfacePointerCancel={onSurfacePointerCancel} onPileClick={onPileClick} onCardClick={onCardClick} onPilePointerDown={onPilePointerDown} onPilePointerMove={onPilePointerMove} onPilePointerUp={onPilePointerUp} onPilePointerCancel={onPilePointerCancel} onCardPointerDown={onCardPointerDown} onCardPointerMove={onCardPointerMove} onCardPointerUp={onCardPointerUp} onCardPointerCancel={onCardPointerCancel} onConfirmPlacement={commitPreview} onCancelPlacement={cancelPreview} pendingPlacement={pendingPlacement}/>
      <ActionBar deckCount={deck?.cards.length||0} canUndo={room.canUndo} canPlay={canPlay} isHost={isHost} selectedCount={selected.length} onAction={action} onLedger={()=>setLedgerOpen(true)} onFlipSelected={()=>{if(selected.length)action('flip-cards',{cards:selected.map(item=>({cardId:item.card.id,fromId:item.pileId}))});clearSelection()}} onMoveSelection={moveSelection} onClearSelection={clearSelection}/>
    </section></div>
    <ChatDrawer open={mobilePanel} room={room} playerId={playerId} text={chatText} setText={setChatText} onSend={sendChat} onReact={(messageId,emoji)=>action('chat:react',{messageId,emoji})} onClose={()=>setMobilePanel(false)} onInvite={copyInvite} chatEnd={chatEnd} theme={theme}/>
    <SettingsDialog open={settingsOpen} isHost={isHost} settings={room.settings} onChange={(settings)=>action('settings',{settings})} onClose={()=>setSettingsOpen(false)}/>
    <InviteDialog open={inviteOpen} room={room} onClose={()=>setInviteOpen(false)} onToast={setToast}/>
    <TableContextMenu menu={contextMenu} room={room} playerId={playerId} canPlay={canPlay} onAction={action} onClose={()=>setContextMenu(null)}/>
    <LedgerDialog open={ledgerOpen} entries={room.ledger||[]} onClose={()=>setLedgerOpen(false)}/>
    {toast&&<div className="toast">{toast}</div>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
