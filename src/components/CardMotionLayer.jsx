import React, { useLayoutEffect, useRef, useState } from 'react';

const MOTION_TYPES = new Set([
  'move', 'move-card', 'move-cards', 'move-stack', 'selection:move', 'place', 'place-cards',
  'return-card', 'return-stack', 'discard:to-deck', 'discard:to-hand', 'pile:absorb-to-discard',
]);
const CARD_WIDTH = 57;
const CARD_HEIGHT = 80;

function boundsCenter(surface, element) {
  if (!element) return null;
  let target = element;
  if (element.classList?.contains('seat')) target = element.querySelector('.seat-avatar') || element;
  if (element.classList?.contains('table-hand-zone')) target = element.querySelector('.table-hand-cards') || element;
  if (element.classList?.contains('pile-zone')) target = element.querySelector('.pile-cards') || element;

  const cards = target.matches?.('.pile-cards,.table-hand-cards')
    ? [...target.querySelectorAll('.playing-card')].filter(card => !card.closest('.drag-ghost,.card-motion-flight'))
    : [];
  const rects = cards.map(card => card.getBoundingClientRect());
  const rect = rects.length ? {
    left: Math.min(...rects.map(item => item.left)),
    right: Math.max(...rects.map(item => item.right)),
    top: Math.min(...rects.map(item => item.top)),
    bottom: Math.max(...rects.map(item => item.bottom)),
  } : target.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - surfaceRect.left, y: rect.top + rect.height / 2 - surfaceRect.top };
}

function measureLayout(surface, playerId) {
  const centers = new Map();
  if (!surface) return centers;
  surface.querySelectorAll('[data-place-id]').forEach(element => {
    const center = boundsCenter(surface, element);
    if (center) centers.set(`place:${element.dataset.placeId}`, center);
  });
  surface.querySelectorAll('[data-player-id]').forEach(element => {
    const center = boundsCenter(surface, element);
    if (center) centers.set(`player:${element.dataset.playerId}`, center);
  });
  const hand = surface.querySelector('.table-hand-zone');
  const handCenter = boundsCenter(surface, hand);
  if (playerId && handCenter) centers.set(`hand:${playerId}`, handCenter);
  surface.querySelectorAll('[data-card-id]').forEach(element => {
    if (element.closest('.drag-ghost,.card-motion-flight')) return;
    const rect = element.getBoundingClientRect(), surfaceRect = surface.getBoundingClientRect();
    centers.set(`card:${element.dataset.cardId}`, { x: rect.left + rect.width / 2 - surfaceRect.left, y: rect.top + rect.height / 2 - surfaceRect.top });
  });
  return centers;
}

function elementForId(surface, id, playerId) {
  if (!id || !surface) return null;
  if (id.startsWith('hand-')) {
    const owner = id.slice(5);
    return owner === playerId ? surface.querySelector('.table-hand-zone') : surface.querySelector(`[data-player-id="${CSS.escape(owner)}"]`);
  }
  return surface.querySelector(`[data-place-id="${CSS.escape(id)}"]`);
}

function modelPosition(surface, point, viewAngle) {
  if (!point || !surface) return null;
  const rect = surface.getBoundingClientRect(), angle = viewAngle * Math.PI / 180;
  const dx = point.x - 50, dy = point.y - 50;
  const x = 50 + dx * Math.cos(angle) - dy * Math.sin(angle);
  const y = 50 + dx * Math.sin(angle) + dy * Math.cos(angle);
  return { x: x / 100 * rect.width, y: y / 100 * rect.height };
}

function average(points) {
  if (!points.length) return null;
  return points.reduce((result, point) => ({ x: result.x + point.x / points.length, y: result.y + point.y / points.length }), { x: 0, y: 0 });
}

function CardFlight({ motion, onFinish }) {
  const flightRef = useRef(null), onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  useLayoutEffect(() => {
    const flight = flightRef.current;
    const face = flight?.firstElementChild;
    if (!flight || !face || typeof flight.animate !== 'function') {
      const timer = setTimeout(() => onFinishRef.current(motion.id), motion.delay + motion.duration);
      return () => clearTimeout(timer);
    }
    const options = { duration: motion.duration, delay: motion.delay, easing: 'cubic-bezier(.2,.72,.25,1)', fill: 'both' };
    const positionAnimation = flight.animate([
      { left: `${motion.from.x - CARD_WIDTH / 2}px`, top: `${motion.from.y - CARD_HEIGHT / 2}px`, opacity: .96 },
      { left: `${motion.to.x - CARD_WIDTH / 2}px`, top: `${motion.to.y - CARD_HEIGHT / 2}px`, opacity: 0 },
    ], options);
    const faceAnimation = face.animate([
      { transform: 'scale(.82) rotate(-7deg)' },
      { transform: 'scale(.76) rotate(6deg)' },
    ], options);
    const timer = setTimeout(() => onFinishRef.current(motion.id), motion.delay + motion.duration + 40);
    return () => { clearTimeout(timer); positionAnimation.cancel(); faceAnimation.cancel(); };
  }, [motion.id]);

  return <div ref={flightRef} className="card-motion-flight" aria-hidden="true" style={{ left: motion.from.x - CARD_WIDTH / 2, top: motion.from.y - CARD_HEIGHT / 2 }}>
    <span className="card-motion-back"><span className="back-pattern">♧</span></span>
  </div>;
}

export default function CardMotionLayer({ surfaceRef, cue, playerId, viewAngle, layoutKey, interactionKey }) {
  const priorCenters = useRef(new Map()), sequence = useRef(0), processedCueId = useRef(null);
  const [motions, setMotions] = useState([]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let previous = surface.getBoundingClientRect();
    const observer = new ResizeObserver(() => {
      const next = surface.getBoundingClientRect();
      if (next.width !== previous.width || next.height !== previous.height) setMotions([]);
      previous = next;
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [surfaceRef]);

  // Run this before refreshing the position cache. If room:update and table:cue
  // land together, source points still come from the last committed board.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !cue?.id || cue.playerId === playerId || processedCueId.current === cue.id) return;
    const isDraw = cue.type === 'draw' || cue.type === 'deal';
    if (!isDraw && !MOTION_TYPES.has(cue.type)) return;
    processedCueId.current = cue.id;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let paths = [], duration = 560;
    if (isDraw) {
      const deck = boundsCenter(surface, surface.querySelector('[data-place-id="deck"]'));
      const recipients = cue.type === 'draw'
        ? [cue.playerId]
        : (cue.recipientIds?.length ? cue.recipientIds : Object.keys(cue.drawCounts || {}));
      paths = recipients.map(recipientId => {
        const destination = recipientId === playerId
          ? surface.querySelector('.table-hand-zone')
          : surface.querySelector(`[data-player-id="${CSS.escape(recipientId || '')}"]`);
        const count = Math.max(1, Math.min(3, cue.drawCounts?.[recipientId] || cue.drawCount || 1));
        return { from: deck, to: boundsCenter(surface, destination), count };
      }).filter(path => path.from && path.to);
      duration = 460;
    } else {
      const cardIds = [...(cue.cardIds || []), ...(cue.cardId ? [cue.cardId] : [])];
      const cardPoints = cardIds.map(id => priorCenters.current.get(`card:${id}`)).filter(Boolean);
      const sourcePoints = cardPoints.length ? cardPoints : (cue.fromIds || [cue.pileId]).map(id => {
        const cached = id?.startsWith('hand-')
          ? priorCenters.current.get(id === `hand-${playerId}` ? `hand:${playerId}` : `player:${id.slice(5)}`)
          : priorCenters.current.get(`place:${id}`);
        return cached || boundsCenter(surface, elementForId(surface, id, playerId));
      }).filter(Boolean);
      const from = average(sourcePoints);
      const destination = elementForId(surface, cue.toId || cue.targetId, playerId);
      const to = boundsCenter(surface, destination) || modelPosition(surface, cue.targetPosition, viewAngle) || boundsCenter(surface, surface.querySelector('.table-hand-zone'));
      const count = cue.type === 'pile:absorb-to-discard'
        ? Math.min(4, Math.max(1, (cue.fromIds || []).length))
        : Math.max(1, Math.min(4, cue.cardIds?.length || 1));
      if (from && to) paths = [{ from, to, count }];
    }
    if (!paths.length) return;

    const id = `${cue.id}-${++sequence.current}`;
    const next = paths.flatMap((path, pathIndex) => Array.from({ length: path.count }, (_, index) => ({
      id: `${id}-${pathIndex}-${index}`,
      from: { x: path.from.x + index * 3, y: path.from.y - index * 2 },
      to: { x: path.to.x + index * 3, y: path.to.y - index * 2 },
      duration,
      delay: pathIndex * 70 + index * 38,
    })));
    setMotions(current => [...current, ...next]);
  }, [cue?.id, playerId, surfaceRef, viewAngle]);

  useLayoutEffect(() => {
    priorCenters.current = measureLayout(surfaceRef.current, playerId);
  }, [surfaceRef, playerId, layoutKey, interactionKey, viewAngle]);

  function finish(id) { setMotions(current => current.filter(motion => motion.id !== id)); }
  return <>{motions.map(motion => <CardFlight key={motion.id} motion={motion} onFinish={finish} />)}</>;
}
