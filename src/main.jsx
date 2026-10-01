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
  const [preview, setPreview] = useState(null), [dragCard, setDragCard] = useState(null), [draggedCardIds,setDraggedCardIds]=useState([]), [dragCount, setDragCount] = useState(1), [dragPosition, setDragPosition] = useState(null), [dragOverHand, setDragOverHand] = useState(false), [pendingPlacement, setPendingPlacement] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('cardtable:theme') || 'light');
  const [handCollapsed, setHandCollapsed] = useState(false), [pileDrag, setPileDrag] = useState(null);
  const [contextMenu, setContextMenu] = useState(null), [cue, setCue] = useState(null);
  const chatEnd = useRef(null), touchStart = useRef(null), cardPointer = useRef(null), selectionPointer = useRef(null), ignoreClick = useRef(false), tableRef = useRef(null), tableActionsButtonRef=useRef(null),tableActionsMenuRef=useRef(null);
  const [tableActionsStyle,setTableActionsStyle]=useState({});
  const cardMoveFrame = useRef(null), pileMoveFrame = useRef(null);
  const viewerRef = useRef(playerId), chatOpenRef = useRef(mobilePanel);
  viewerRef.current=playerId; chatOpenRef.current=mobilePanel;
  const self = room?.players.find((p) => p.id === playerId);
  const isHost = room?.hostId === playerId;
  const isCohost=room?.players.find(player=>player.id===playerId)?.role==='cohost';
  const isModerator=isHost||isCohost;
  const canPlay = !room?.settings.hostControls || isModerator;
  const myHand = room?.piles.find((p) => p.kind === 'hand' && p.ownerId === playerId);
  const deck = room?.piles.find((p) => p.id === 'deck');
  const previewCard = dragCard || pendingPlacement?.cards?.[0]?.card;
  const selectedIds = selected.map((item)=>item.card.id);
  function clearSelection() { setSelected([]); }
  function clearDragVisual(){setDragCard(null);setDraggedCardIds([]);setDragCount(1);setDragPosition(null);setDragOverHand(false);}
  function moveSelection(toId, cards = selected, onComplete) {
    if (!cards.length) return;
    action('move-cards',{cards:cards.map(({card,pileId})=>({cardId:card.id,fromId:pileId})),toId},onComplete);
    clearSelection();
  }
  function placeSelection(spot, cards = selected, onComplete) {
    if (!spot || !cards.length) return;
    action('place-cards',{cards:cards.map(({card,pileId})=>({cardId:card.id,fromId:pileId})),x:spot.x,y:spot.y,targetId:spot.targetId,mode:spot.mode},onComplete);
    clearSelection(); setPreview(null); setPendingPlacement(null);
  }
  function setColorTheme(next) { setTheme(next); localStorage.setItem('cardtable:theme', next); }

  function pileAtPoint(clientX,clientY,excludeIds=[],stopAtExcluded=false) {
    const excluded=new Set(excludeIds);
    const layers=document.elementsFromPoint?.(clientX,clientY)||[document.elementFromPoint(clientX,clientY)].filter(Boolean);
    for(const layer of layers){
      const element=layer.closest?.('.pile-zone');
      if(element&&excluded.has(element.dataset.placeId)&&stopAtExcluded)return null;
      if(element&&!excluded.has(element.dataset.placeId)){
        const pile=room?.piles.find(item=>item.id===element.dataset.placeId);
        if(pile)return {element,pile};
      }
    }
    return null;
  }

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
  useEffect(() => () => {
    if (cardMoveFrame.current !== null) cancelAnimationFrame(cardMoveFrame.current);
    if (pileMoveFrame.current !== null) cancelAnimationFrame(pileMoveFrame.current);
  }, []);
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
  const action = (type, extra = {}, onComplete) => socket.emit('table:action', { type, ...extra }, (r) => { if (!r?.ok && r?.error) setToast(r.error); onComplete?.(r); });
  useEffect(()=>{
    if(menu!=='actions')return;
    let frame=0;
    const place=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const anchor=tableActionsButtonRef.current,element=tableActionsMenuRef.current;if(!anchor||!element)return;
      const rect=anchor.getBoundingClientRect(),menuRect=element.getBoundingClientRect(),pad=8,gap=7;
      const width=Math.min(menuRect.width,window.innerWidth-pad*2),height=Math.min(menuRect.height,window.innerHeight-pad*2);
      const left=Math.max(pad,Math.min(window.innerWidth-width-pad,rect.left));
      const below=window.innerHeight-rect.bottom-pad-gap,above=rect.top-pad-gap;
      const top=below>=Math.min(height,240)||below>=above?rect.bottom+gap:Math.max(pad,rect.top-height-gap);
      const next={left,top,right:'auto',bottom:'auto',maxHeight:`${Math.max(120,Math.min(height,top===rect.bottom+gap?below:above))}px`};
      setTableActionsStyle(current=>current.left===next.left&&current.top===next.top&&current.maxHeight===next.maxHeight?current:next);
    });};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[menu,isHost,canPlay]);
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
  function placementAt(clientX,clientY,movingCards=null) {
    if (!tableRef.current) return;
    const tableRect = tableRef.current.getBoundingClientRect();
    if (clientX < tableRect.left || clientX > tableRect.right || clientY < tableRect.top || clientY > tableRect.bottom) return null;
    const layers=document.elementsFromPoint?.(clientX,clientY)||[document.elementFromPoint(clientX,clientY)].filter(Boolean);
    const hitElement=layers[0];
    if(hitElement?.closest('.table-hand-zone,.seat,.toolbar,.action-dock,.placement-confirm,.placement-preview,.table-context-menu,.sidebar,button,input,select,textarea'))return null;
    const moving=movingCards||(cardPointer.current?.cards||[]);
    const movingByPile=new Map();
    for(const item of moving)movingByPile.set(item.pileId,(movingByPile.get(item.pileId)||0)+1);
    const sourceIds=[...movingByPile].filter(([id,count])=>count>=(room?.piles.find(pile=>pile.id===id)?.cards.length||Infinity)).map(([id])=>id);
    const pileHit=pileAtPoint(clientX,clientY,sourceIds,true);
    const rawPile=hitElement?.closest('.pile-zone');
    if(rawPile&&sourceIds.includes(rawPile.dataset.placeId))return null;
    if(rawPile&&!pileHit)return null;
    const hitPile=pileHit?.element;
    if(hitPile&&!hitPile.classList.contains('tableau-zone'))return null;
    if(hitPile&&sourceIds.includes(hitPile.dataset.placeId))return null;
    const hitId = hitPile?.dataset.placeId;
    const piles=hitId?room.piles.filter(pile=>pile.id===hitId&&!sourceIds.includes(pile.id)).map(pile=>({...pile,rect:hitPile.getBoundingClientRect()})):[...document.querySelectorAll('.tableau-zone')].map((element)=>{
      const pile=room.piles.find(item=>item.id===element.dataset.placeId);
      return pile&&!sourceIds.includes(pile.id)?{...pile,rect:element.getBoundingClientRect()}:null;
    }).filter(Boolean);
    const directHit = hitId ? piles.filter((pile) => pile.id === hitId) : piles;
    const spot=resolveTablePlacement(clientX, clientY, tableRect, directHit, hitId);
    if(!spot?.targetId)return spot;
    const target=directHit.find(pile=>pile.id===spot.targetId);
    if(!target)return spot;
    const centerX=(target.rect.left+target.rect.width/2-tableRect.left)/tableRect.width*100;
    const centerY=(target.rect.top+target.rect.height/2-tableRect.top)/tableRect.height*100;
    return {...spot,x:Math.min(94,Math.max(6,centerX+(spot.mode==='fan'?3:0))),y:centerY};
  }
  function previewAt(e,movingCards=null) {
    const spot = placementAt(e.clientX,e.clientY,movingCards);
    setPreview(current=>current&&spot&&current.mode===spot.mode&&current.targetId===spot.targetId&&Math.abs(current.x-spot.x)<.25&&Math.abs(current.y-spot.y)<.25?current:spot||null);
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
    if (cardMoveFrame.current !== null) cancelAnimationFrame(cardMoveFrame.current);
    cardMoveFrame.current = null;
    cardPointer.current = { card, fromId, cards:group, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false, latest: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onCardPointerMove(e) {
    const active = cardPointer.current;
    if (!active || active.pointerId !== e.pointerId) return;
    if (!active.dragging && Math.hypot(e.clientX-active.startX,e.clientY-active.startY) > 7) {
      active.dragging = true; setDragCard(active.card); setDraggedCardIds(active.cards.map(item=>item.card.id)); setDragCount(active.cards.length);setDragPosition({x:e.clientX,y:e.clientY,card:active.card});
    }
    if (active.dragging) {
      e.preventDefault();
      active.latest = { clientX:e.clientX, clientY:e.clientY };
      if (cardMoveFrame.current === null) {
        cardMoveFrame.current = requestAnimationFrame(() => {
          cardMoveFrame.current = null;
          if (cardPointer.current !== active || !active.dragging || !active.latest) return;
          const point = active.latest;
          const target = document.elementFromPoint(point.clientX,point.clientY);
          const overHand = !!target?.closest('.table-hand-zone');
          setDragPosition({x:point.clientX,y:point.clientY,card:active.card});
          setDragOverHand(overHand);
          if (overHand) setPreview(null); else previewAt(point,active.cards);
        });
      }
    }
  }
  function onCardPointerUp(e) {
    const active = cardPointer.current;
    if (!active || active.pointerId !== e.pointerId) return;
    if (cardMoveFrame.current !== null) cancelAnimationFrame(cardMoveFrame.current);
    cardMoveFrame.current = null;
    cardPointer.current = null;
    if (active.dragging) {
      const handTarget = document.elementFromPoint(e.clientX,e.clientY)?.closest('.table-hand-zone');
      if (handTarget) {
        const handId = myHand?.id || `hand-${playerId}`;
        if (active.cards.every(item=>item.pileId===handId)) {
          const beforeCardId = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-card-id]')?.dataset.cardId;
          if(active.cards.length===1){if(beforeCardId!==active.card.id)action('hand:reorder',{cardId:active.card.id,beforeCardId},clearDragVisual);else clearDragVisual();}
          else if(!active.cards.some(item=>item.card.id===beforeCardId))action('hand:reorder-cards',{cardIds:active.cards.map(item=>item.card.id),beforeCardId},clearDragVisual);else clearDragVisual();
        } else moveSelection(handId,active.cards,clearDragVisual);
        setPreview(null);clearSelection();
      } else {
        const targetPile = pileAtPoint(e.clientX,e.clientY,active.cards.map(item=>item.pileId),true)?.pile;
        if (targetPile && targetPile.kind !== 'tableau') {
          if (!canPlay) setToast('The host controls this table.');
          else moveSelection(targetPile.id,active.cards,clearDragVisual);
          setPreview(null);setPendingPlacement(null);clearSelection();if(!canPlay)clearDragVisual();
          ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
          return;
        }
        if (!canPlay) {
          setPreview(null); clearSelection(); clearDragVisual();
          setToast('The host controls this table.');
          ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
          return;
        }
        const finalSpot = previewAt(e,active.cards);
        if (finalSpot) placeSelection(finalSpot,active.cards,clearDragVisual);
        else { clearSelection(); setPendingPlacement(null); setPreview(null);clearDragVisual(); }
      }
      ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
    } else setPreview(null);
  }
  function onCardPointerCancel(e) {
    if (cardPointer.current?.pointerId !== e.pointerId) return;
    if (cardMoveFrame.current !== null) cancelAnimationFrame(cardMoveFrame.current);
    cardMoveFrame.current = null;
    cardPointer.current = null; setPendingPlacement(null); setPreview(null); clearSelection(); clearDragVisual();
  }
  function onPilePointerDown(e, pile) {
    if (!canPlay || pile.kind === 'hand' || (e.target.closest('.playing-card') && !e.target.closest('.pile-grab'))) return;
    const bounds = tableRef.current.getBoundingClientRect();
    const pileRect = e.currentTarget.getBoundingClientRect();
    setPreview(null);setPendingPlacement(null);
    if (pileMoveFrame.current !== null) cancelAnimationFrame(pileMoveFrame.current);
    pileMoveFrame.current = null;
    touchStart.current = { x: e.clientX, y: e.clientY, pile, pointerId: e.pointerId, bounds, moved: false, latest: null, grabOffsetX: e.clientX-(pileRect.left+pileRect.width/2), grabOffsetY: e.clientY-(pileRect.top+pileRect.height/2) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPilePointerMove(e) {
    const active = touchStart.current; if (!active || active.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX-active.x,e.clientY-active.y) > 7&&!active.moved) {
      active.moved = true;
      const bounds=active.bounds;
      setPileDrag({pileId:active.pile.id,x:Math.min(94,Math.max(6,(e.clientX-active.grabOffsetX-bounds.left)/bounds.width*100)),y:Math.min(78,Math.max(18,(e.clientY-active.grabOffsetY-bounds.top)/bounds.height*100))});
    }
    if (!active.moved) return;
    active.latest = { clientX:e.clientX, clientY:e.clientY };
    if (pileMoveFrame.current === null) {
      pileMoveFrame.current = requestAnimationFrame(() => {
        pileMoveFrame.current = null;
        if (touchStart.current !== active || !active.moved || !active.latest) return;
        const {clientX,clientY}=active.latest, bounds=active.bounds;
        const targetId=pileAtPoint(clientX,clientY,[active.pile.id])?.pile.id||null;
        setPileDrag({ pileId: active.pile.id, targetId, x: Math.min(94,Math.max(6,(clientX-active.grabOffsetX-bounds.left)/bounds.width*100)), y: Math.min(78,Math.max(18,(clientY-active.grabOffsetY-bounds.top)/bounds.height*100)) });
      });
    }
  }
  function onPilePointerUp(e) {
    const active = touchStart.current; if (!active || active.pointerId !== e.pointerId) return;
    if (pileMoveFrame.current !== null) cancelAnimationFrame(pileMoveFrame.current);
    pileMoveFrame.current = null;
    touchStart.current = null;
    if (active.moved) {
      const bounds=active.bounds;
      const x=Math.min(94,Math.max(6,(e.clientX-active.grabOffsetX-bounds.left)/bounds.width*100));
      const y=Math.min(78,Math.max(18,(e.clientY-active.grabOffsetY-bounds.top)/bounds.height*100));
      setPileDrag({pileId:active.pile.id,x,y});
      const layers=document.elementsFromPoint?.(e.clientX,e.clientY)||[document.elementFromPoint(e.clientX,e.clientY)].filter(Boolean);
      const handTarget=layers.some(element=>element.closest?.('.table-hand-zone'));
      if(active.pile.kind==='tableau'&&handTarget){
        action('move-stack',{fromId:active.pile.id,toId:`hand-${playerId}`},()=>setPileDrag(null));ignoreClick.current=true;setTimeout(()=>{ignoreClick.current=false;},250);return;
      }
      const target=pileAtPoint(e.clientX,e.clientY,[active.pile.id])?.pile;
      if(active.pile.kind==='tableau'&&target){
        if(target.kind==='tableau'){
          const targetElement=[...tableRef.current.querySelectorAll('.tableau-zone')].find(element=>element.dataset.placeId===target.id);
          const spot=targetElement?resolveTablePlacement(e.clientX,e.clientY,active.bounds,[{...target,rect:targetElement.getBoundingClientRect()}],target.id):null;
          action('move-stack',{fromId:active.pile.id,toId:target.id,mode:spot?.mode||'stack'},()=>setPileDrag(null));
        }else action('move-stack',{fromId:active.pile.id,toId:target.id},()=>setPileDrag(null));
        ignoreClick.current=true;setTimeout(()=>{ignoreClick.current=false;},250);return;
      }
      if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom){setPileDrag(null);return;}
      setPileDrag({pileId:active.pile.id,x,y,pending:true});
      action('pile:move', { pileId: active.pile.id, x, y }); ignoreClick.current = true; setTimeout(()=>{ignoreClick.current=false;},250);
    } else setPileDrag(null);
  }
  function onPilePointerCancel(e) {
    if (touchStart.current?.pointerId !== e.pointerId) return;
    if (pileMoveFrame.current !== null) cancelAnimationFrame(pileMoveFrame.current);
    pileMoveFrame.current = null;
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

  if (!room) return <main className="welcome" data-theme={theme}>
    <div className="welcome-glow"/>
    <header className="welcome-top">
      <a className="brand" href="#"><span className="brand-mark">♧</span> cardtable</a>
      <div className="welcome-actions"><span className="live-note"><i/> A table for everyone</span></div>
    </header>
    <section className="welcome-card">
      <div className="eyebrow"><span>✦</span> YOUR GAME, YOUR RULES</div>
      <h1>Make room<br/>for <em>one more.</em></h1>
      <p className="intro">A relaxed place to play cards together.<br/>No scorekeeping required.</p>
      <label className="welcome-field" htmlFor="guest"><span>Your name</span><input id="guest" value={name} onChange={(e)=>setName(e.target.value)} placeholder="What should we call you?" maxLength={24} onKeyDown={(e)=>e.key==='Enter'&&create()}/></label>
      {error&&<div className="error-note" role="alert">{error}</div>}
      <section className="welcome-action-section" aria-labelledby="create-heading">
        <h2 id="create-heading">Create a table</h2>
        <div className="welcome-options">
          <label className="welcome-field"><span>Table name</span><input value={roomName} onChange={(e)=>setRoomName(e.target.value)} aria-label="Table name" maxLength={40} onKeyDown={(e)=>e.key==='Enter'&&create()}/></label>
          <label className="welcome-field"><span>Deck</span><select className="deck-choice" value={deckId} onChange={(e)=>setDeckId(e.target.value)} aria-label="Card deck">{listDecks().map((deck)=><option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label>
        </div>
        <button className="primary-button welcome-submit" onClick={create}>Create a table <span>↗</span></button>
      </section>
      <div className="or-line"><span/>or<span/></div>
      <section className="welcome-action-section join-section" aria-labelledby="join-heading">
        <h2 id="join-heading">Join a table</h2>
        <div className="welcome-join-row"><label className="welcome-field"><span>Invite code</span><input value={roomCode} onChange={(e)=>setRoomCode(e.target.value.toUpperCase())} onKeyDown={(e)=>e.key==='Enter'&&join()} placeholder="Enter invite code" aria-label="Invite code"/></label><button className="join-button" onClick={join}>Join table</button></div>
      </section>
      <div className="welcome-foot"><span>♠</span> 52 cards · Infinite ways to play <span>♥</span></div>
    </section>
    <footer className="site-foot">BUILT FOR GAME NIGHT <span>·</span> JUST ADD FRIENDS</footer>
  </main>;

  const handZone = <HandZone hand={myHand} playerId={playerId} canPlay={canPlay} selectedIds={selectedIds} contextCardId={contextMenu?.cardId} dragCardIds={draggedCardIds} cue={cue} collapsed={handCollapsed} onToggle={()=>setHandCollapsed(!handCollapsed)} onDraw={()=>action('draw',{pileId:'deck'})} onSort={(mode)=>action('sort-hand',{mode})} onCardClick={onCardClick} onOpenContextMenu={openContextMenu} onPointerDown={onCardPointerDown} onPointerMove={onCardPointerMove} onPointerUp={onCardPointerUp} onPointerCancel={onCardPointerCancel}/>

  return <main className={`app-shell ${cue?`cue-${cue.type.replace(':','-')}`:''}`} data-theme={theme}>
    <header className="topbar"><a className="brand" href="/" onClick={(e)=>{e.preventDefault();history.pushState({},'',location.pathname);setRoom(null)}}><span className="brand-mark">♧</span> cardtable</a><div className="table-title"><span className="table-dot"/><div><b>{room.name}</b><small>{room.players.filter(p=>p.online).length} at the table</small></div></div><div className="top-actions"><button className="subtle-button invite-button" aria-label="Invite friends" onClick={()=>setInviteOpen(true)}>↗ <span>Invite friends</span></button><button className="icon-button settings-trigger" onClick={()=>setSettingsOpen(!settingsOpen)} aria-label="Settings">⚙</button><div className="profile-control"><button className={`avatar ${cue?.playerId===playerId?'action-actor':''}`} style={{'--avatar':self?.color}} title={self?.name} aria-label="Open profile menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(!profileOpen)}>{self?.emoji||self?.name?.slice(0,1).toUpperCase()}</button><ProfileMenu open={profileOpen} player={self} isHost={isHost} isCohost={isCohost} isModerator={isModerator} room={room} onInvite={()=>setInviteOpen(true)} onSettings={()=>setSettingsOpen(true)} onProfile={(values)=>action('profile',values)} onClose={()=>setProfileOpen(false)} onToast={setToast}/></div></div></header>
    <button className="chat-fab" onClick={toggleChat} aria-expanded={mobilePanel} aria-label={mobilePanel?'Close chat':'Open chat'} title="Chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10.2h-8.2l-4.6 3v-3H4.5z"/></svg>{unreadChat>0&&<i>{unreadChat}</i>}</button>
    <div className="game-layout"><section className="play-area"><div className="table-heading"><div><span className="eyebrow light">THE TABLE</span><h2>Make yourself at home.</h2></div><div className="table-tools"><button ref={tableActionsButtonRef} className="more-button" aria-expanded={menu==='actions'} aria-label="Table actions" onClick={()=>setMenu(menu==='actions'?'':'actions')}><span>•••</span></button>{menu==='actions'&&<div ref={tableActionsMenuRef} style={tableActionsStyle} className="popover action-menu table-actions-menu"><b>Table actions</b>{canPlay&&<><button onClick={()=>{action('pile:create',{name:'New pile'});setMenu('')}}>＋ Add a pile</button><button onClick={()=>{action('shuffle',{pileId:'deck'});setMenu('')}}>↻ Shuffle the deck</button></>}<button onClick={()=>{setLedgerOpen(true);setMenu('')}}>◷ View action history</button>{isModerator&&<button onClick={()=>{setSettingsOpen(true);setMenu('')}}>⚙ Table settings</button>}</div>}</div></div>
      <TableSurface room={room} playerId={playerId} tableRef={tableRef} selectedIds={selectedIds} selectionBox={selectionBox} preview={preview} previewCard={previewCard} previewCount={pendingPlacement?.cards?.length||dragCount} dragCount={dragCount} pileDrag={pileDrag} handZone={handZone} cue={cue} contextCardId={contextMenu?.cardId} dragCardId={dragCard?.id} draggedCardIds={draggedCardIds} dragPosition={dragPosition} dragOverHand={dragOverHand} onOpenContextMenu={openContextMenu} onSurfaceClick={onTableClick} onSurfacePointerDown={onSurfacePointerDown} onSurfacePointerMove={onSurfacePointerMove} onSurfacePointerUp={onSurfacePointerUp} onSurfacePointerCancel={onSurfacePointerCancel} onPileClick={onPileClick} onCardClick={onCardClick} onPilePointerDown={onPilePointerDown} onPilePointerMove={onPilePointerMove} onPilePointerUp={onPilePointerUp} onPilePointerCancel={onPilePointerCancel} onCardPointerDown={onCardPointerDown} onCardPointerMove={onCardPointerMove} onCardPointerUp={onCardPointerUp} onCardPointerCancel={onCardPointerCancel} onConfirmPlacement={commitPreview} onCancelPlacement={cancelPreview} pendingPlacement={pendingPlacement}/>
      <ActionBar deckCount={deck?.cards.length||0} canUndo={room.canUndo} canPlay={canPlay} isHost={isModerator} selectedCount={selected.length} onAction={action} onLedger={()=>setLedgerOpen(true)} onFlipSelected={()=>{if(selected.length)action('flip-cards',{cards:selected.map(item=>({cardId:item.card.id,fromId:item.pileId}))});clearSelection()}} onMoveSelection={moveSelection} onClearSelection={clearSelection}/>
    </section></div>
    <ChatDrawer open={mobilePanel} room={room} playerId={playerId} text={chatText} setText={setChatText} onSend={sendChat} onReact={(messageId,emoji)=>action('chat:react',{messageId,emoji})} onClose={()=>setMobilePanel(false)} onInvite={copyInvite} chatEnd={chatEnd} theme={theme}/>
    <SettingsDialog open={settingsOpen} isHost={isHost} isModerator={isModerator} players={room.players} playerId={playerId} theme={theme} onTheme={setColorTheme} onRoleChange={(targetId,role)=>action('host:assign',{targetId,role})} settings={room.settings} onChange={(settings)=>action('settings',{settings})} onClose={()=>setSettingsOpen(false)}/>
    <InviteDialog open={inviteOpen} room={room} onClose={()=>setInviteOpen(false)} onToast={setToast}/>
    <TableContextMenu menu={contextMenu} room={room} playerId={playerId} canPlay={canPlay} onAction={action} onClose={()=>setContextMenu(null)}/>
    <LedgerDialog open={ledgerOpen} entries={room.ledger||[]} onClose={()=>setLedgerOpen(false)}/>
    {toast&&<div className="toast">{toast}</div>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
