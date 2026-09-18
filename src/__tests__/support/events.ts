/**
 * Synthetic scroll and layout event fixtures shared by every suite.
 *
 * The geometry under test is only reviewable if the numbers that drive it are
 * visible in the test source, so these factories are deliberately thin: they
 * build the exact object shape React Native delivers to `onScroll` / `onLayout`
 * and nothing else. There is no mocking here — `handleScroll` reads the payload
 * and never touches the native side, so a plain object is a faithful event.
 *
 * Standard fixture geometry, used by every case that does not override it:
 *
 *   viewport height  800  (`layoutMeasurement.height`)
 *   content height  2000  (`contentSize.height`)
 *   => maximum resting scroll offset 1200
 */

import type { LayoutEvent, ScrollEvent } from '../../types';

/** `layoutMeasurement.height` used by every fixture that does not override it. */
export const VIEWPORT_HEIGHT = 800;
/** `contentSize.height` used by every fixture that does not override it. */
export const CONTENT_HEIGHT = 2000;
/** The largest offset reachable without overscrolling: 1200. */
export const MAX_OFFSET = CONTENT_HEIGHT - VIEWPORT_HEIGHT;
/** The offset at which the viewport centre sits on the content centre: 600. */
export const CENTERED_OFFSET = CONTENT_HEIGHT / 2 - VIEWPORT_HEIGHT / 2;

/** iOS-only `contentInset`; omitted entirely unless a case asks for it. */
export interface ContentInsetInit {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface ScrollEventInit {
  /** `contentOffset.y`. Defaults to 0. */
  y?: number;
  /** `contentOffset.x`. Defaults to 0. */
  x?: number;
  /** `layoutMeasurement.height`. Defaults to {@link VIEWPORT_HEIGHT}. */
  layoutH?: number;
  /** `layoutMeasurement.width`. Defaults to 400. */
  layoutW?: number;
  /** `contentSize.height`. Defaults to {@link CONTENT_HEIGHT}. */
  contentH?: number;
  /** `contentSize.width`. Defaults to 400. */
  contentW?: number;
  /** iOS `contentInset`. Omitted from the event unless supplied. */
  inset?: ContentInsetInit;
}

/**
 * Build a scroll event payload.
 *
 * @param init - Overrides for the standard fixture geometry.
 * @returns An object structurally identical to what `onScroll` receives.
 */
export function scrollEvent(init: ScrollEventInit = {}): ScrollEvent {
  const {
    y = 0,
    x = 0,
    layoutH = VIEWPORT_HEIGHT,
    layoutW = 400,
    contentH = CONTENT_HEIGHT,
    contentW = 400,
    inset,
  } = init;

  const nativeEvent: ScrollEvent['nativeEvent'] = {
    contentOffset: { x, y },
    layoutMeasurement: { height: layoutH, width: layoutW },
    contentSize: { height: contentH, width: contentW },
  };

  // Android never reports contentInset at all; only attach it when a case is
  // specifically exercising the iOS inset path.
  if (inset) {
    nativeEvent.contentInset = inset;
  }

  return { nativeEvent };
}

export interface LayoutEventInit {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Build a layout event payload.
 *
 * @param init - The rectangle, in the element's parent's coordinate space.
 * @returns An object structurally identical to what `onLayout` receives.
 */
export function layoutEvent(init: LayoutEventInit = {}): LayoutEvent {
  const { x = 0, y = 0, width = 300, height = 100 } = init;
  return { nativeEvent: { layout: { x, y, width, height } } };
}
