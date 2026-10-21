/**
 * Utility for exact coordinate projection between an HTML5 video with object-fit: cover
 * and overlay canvases/DOM elements.
 */

export interface VideoCropBox {
  offsetX: number;
  offsetY: number;
  renderWidth: number;
  renderHeight: number;
}

export function computeObjectCoverBox(
  containerW: number,
  containerH: number,
  videoW: number = 1280,
  videoH: number = 720
): VideoCropBox {
  if (!videoW || !videoH || !containerW || !containerH) {
    return { offsetX: 0, offsetY: 0, renderWidth: containerW, renderHeight: containerH };
  }

  const containerAspect = containerW / containerH;
  const videoAspect = videoW / videoH;

  let renderWidth = containerW;
  let renderHeight = containerH;
  let offsetX = 0;
  let offsetY = 0;

  if (containerAspect > videoAspect) {
    // Container is wider than video: video fits width and is cropped vertically
    renderWidth = containerW;
    renderHeight = containerW / videoAspect;
    offsetX = 0;
    offsetY = (containerH - renderHeight) / 2;
  } else {
    // Container is taller than video: video fits height and is cropped horizontally
    renderHeight = containerH;
    renderWidth = containerH * videoAspect;
    offsetX = (containerW - renderWidth) / 2;
    offsetY = 0;
  }

  return { offsetX, offsetY, renderWidth, renderHeight };
}

export function projectVideoPoint(
  normalizedPt: { x: number; y: number },
  cropBox: VideoCropBox
): { x: number; y: number } {
  return {
    x: cropBox.offsetX + normalizedPt.x * cropBox.renderWidth,
    y: cropBox.offsetY + normalizedPt.y * cropBox.renderHeight
  };
}

export function projectVideoToNormalizedContainer(
  normalizedPt: { x: number; y: number },
  cropBox: VideoCropBox,
  containerW: number,
  containerH: number
): { x: number; y: number } {
  const pixel = projectVideoPoint(normalizedPt, cropBox);
  return {
    x: containerW > 0 ? pixel.x / containerW : normalizedPt.x,
    y: containerH > 0 ? pixel.y / containerH : normalizedPt.y
  };
}

export function getScreenPointFromVideo(
  pt: { x: number; y: number },
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
  isMirrored: boolean
): { x: number; y: number } {
  const cropBox = computeObjectCoverBox(containerW, containerH, videoW, videoH);
  let pixelX = cropBox.offsetX + pt.x * cropBox.renderWidth;
  const pixelY = cropBox.offsetY + pt.y * cropBox.renderHeight;

  if (isMirrored) {
    pixelX = containerW - pixelX;
  }

  return {
    x: containerW > 0 ? pixelX / containerW : pt.x,
    y: containerH > 0 ? pixelY / containerH : pt.y
  };
}

