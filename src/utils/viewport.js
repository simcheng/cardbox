export function visibleViewport() {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function clampToViewport(left, top, width, height, gap = 8) {
  const viewport = visibleViewport();
  const safeWidth = Math.min(width, Math.max(1, viewport.width - gap * 2));
  const safeHeight = Math.min(height, Math.max(1, viewport.height - gap * 2));
  return {
    left: Math.max(viewport.left + gap, Math.min(viewport.right - safeWidth - gap, left)),
    top: Math.max(viewport.top + gap, Math.min(viewport.bottom - safeHeight - gap, top)),
    width: safeWidth,
    height: safeHeight,
    viewport,
  };
}
