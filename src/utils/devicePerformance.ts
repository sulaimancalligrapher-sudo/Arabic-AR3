/**
 * Accurate detection for phones and tablets (including iPadOS & wide landscape tablets)
 * so AR models and canvas effects always pick lightweight mobile-friendly profiles.
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const hasTouch = Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
  const isIpadOS = /Macintosh/i.test(ua) && hasTouch;
  const minScreenSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);

  return (
    /Android|iPhone|iPad|iPod|Tablet|Silk|PlayBook|Mobile/i.test(ua) ||
    isIpadOS ||
    (hasTouch && minScreenSide <= 1100)
  );
}

/**
 * Returns true when running on a phone OR tablet in landscape orientation
 * so both receive automatic edge-to-edge fullscreen and top-docked inner bar.
 */
export function isTouchLandscapeViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return isMobileOrTabletDevice() && window.innerWidth > window.innerHeight;
}
