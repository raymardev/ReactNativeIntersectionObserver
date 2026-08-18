/**
 * Pure, framework-free intersection geometry.
 *
 * Nothing in this module imports `react` or `react-native`, touches the DOM, or
 * has any side effect: it turns a (possibly malformed) scroll event into
 * normalized metrics, and turns metrics + configuration into a tri-state
 * decision. Keeping it separate is what makes the math unit-testable without a
 * React renderer.
 *
 * The tri-state is important. `computeIntersection` returns:
 *
 * - `true` / `false` — a real decision, derived from real measurements;
 * - `null` — **no decision**: the scroll view has not been measured yet, or the
 *   tracked element has never reported a layout. `null` must leave the observer's
 *   state completely untouched. Returning `false` in those cases would be a lie
 *   and would make the first genuine `true` look like a transition when it is
 *   really the first reading.
 */

import type {
  ElementLayout,
  IntersectionMetrics,
  IntersectionPosition,
  ScrollMetrics,
} from './types';

/** The documented default threshold, in density-independent points. */
export const DEFAULT_THRESHOLD = 20;

/** The documented default position. */
export const DEFAULT_POSITION: IntersectionPosition = 'bottom';

/**
 * Configuration consumed by {@link computeIntersection}.
 *
 * This is the geometry-only slice of `UseIntersectionObserverOptions` — it
 * deliberately knows nothing about callbacks or refs.
 */
export interface IntersectionGeometryConfig {
  /** Where to detect the intersection. Defaults to `'bottom'`. */
  position?: IntersectionPosition;
  /** Threshold in dp. Non-finite values fall back to {@link DEFAULT_THRESHOLD}. */
  threshold?: number;
  /** Whether the observed scroll view scrolls horizontally. Defaults to `false`. */
  horizontal?: boolean;
  /** Required for `position: 'custom'`. */
  customPredicate?: (metrics: IntersectionMetrics) => boolean;
  /**
   * Optional diagnostic sink. Injected rather than calling `console` directly so
   * this module stays pure and testable.
   */
  warn?: (message: string) => void;
}

/** A structurally-loose view of whatever `onScroll` might hand us. */
interface LooseScrollEvent {
  nativeEvent?: {
    layoutMeasurement?: { width?: unknown; height?: unknown } | null;
    contentOffset?: { x?: unknown; y?: unknown } | null;
    contentSize?: { width?: unknown; height?: unknown } | null;
    contentInset?: {
      top?: unknown;
      bottom?: unknown;
      left?: unknown;
      right?: unknown;
    } | null;
  } | null;
}

/** A structurally-loose view of whatever `onLayout` might hand us. */
interface LooseLayoutEvent {
  nativeEvent?: {
    layout?: {
      x?: unknown;
      y?: unknown;
      width?: unknown;
      height?: unknown;
    } | null;
  } | null;
}

/**
 * Coerce an unknown value to a finite number.
 *
 * @param value - The value to coerce.
 * @param fallback - Returned when `value` is not a finite number. Defaults to `0`.
 * @returns `value` when it is a finite number, otherwise `fallback`.
 *
 * @remarks
 * This is what stops a `NaN` leaking into a comparison. `NaN <= threshold` is
 * always `false`, which would silently disable detection forever rather than
 * failing loudly.
 */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Normalize a user-supplied threshold.
 *
 * @param threshold - The raw threshold, possibly `undefined`, `NaN` or `Infinity`.
 * @returns `threshold` when finite, otherwise {@link DEFAULT_THRESHOLD}.
 *
 * @remarks
 * Negative thresholds are meaningful ("require overscrolling past the edge") and
 * are passed through unchanged.
 *
 * @example
 * ```ts
 * normalizeThreshold(undefined); // 20
 * normalizeThreshold(Number.NaN); // 20
 * normalizeThreshold(-10); // -10
 * ```
 */
export function normalizeThreshold(threshold: number | undefined): number {
  return toFiniteNumber(threshold, DEFAULT_THRESHOLD);
}

/**
 * Extract normalized scroll metrics from an arbitrary scroll event.
 *
 * @param event - Anything at all. React Native's
 * `NativeSyntheticEvent<NativeScrollEvent>`, the documented `ScrollEvent` shape, a
 * hand-built test object, a Reanimated worklet payload forwarded via `runOnJS`,
 * `null`, or garbage.
 * @returns A {@link ScrollMetrics} with every field guaranteed finite, or `null`
 * when the event does not carry the three required measurement blocks.
 *
 * @remarks
 * The numbers are copied out synchronously and the event itself is never
 * retained: the documented multi-observer pattern forwards one event object to
 * several hooks, so no consumer may mutate or hold on to it.
 *
 * @example
 * ```ts
 * const metrics = readScrollMetrics({
 *   nativeEvent: {
 *     layoutMeasurement: { width: 375, height: 800 },
 *     contentOffset: { x: 0, y: 1200 },
 *     contentSize: { width: 375, height: 2000 },
 *   },
 * });
 * // metrics.contentOffset.y === 1200, metrics.contentInset.top === 0
 * ```
 */
export function readScrollMetrics(event: unknown): ScrollMetrics | null {
  if (event === null || typeof event !== 'object') {
    return null;
  }

  const nativeEvent = (event as LooseScrollEvent).nativeEvent;
  if (!nativeEvent || typeof nativeEvent !== 'object') {
    return null;
  }

  const { layoutMeasurement, contentOffset, contentSize, contentInset } =
    nativeEvent;

  if (
    !layoutMeasurement ||
    typeof layoutMeasurement !== 'object' ||
    !contentOffset ||
    typeof contentOffset !== 'object' ||
    !contentSize ||
    typeof contentSize !== 'object'
  ) {
    return null;
  }

  return {
    contentOffset: {
      x: toFiniteNumber(contentOffset.x),
      y: toFiniteNumber(contentOffset.y),
    },
    layoutMeasurement: {
      width: toFiniteNumber(layoutMeasurement.width),
      height: toFiniteNumber(layoutMeasurement.height),
    },
    contentSize: {
      width: toFiniteNumber(contentSize.width),
      height: toFiniteNumber(contentSize.height),
    },
    contentInset: {
      top: toFiniteNumber(contentInset?.top),
      bottom: toFiniteNumber(contentInset?.bottom),
      left: toFiniteNumber(contentInset?.left),
      right: toFiniteNumber(contentInset?.right),
    },
  };
}

/**
 * Extract a normalized layout rectangle from an arbitrary layout event.
 *
 * @param event - React Native's `LayoutChangeEvent`, the documented `LayoutEvent`
 * shape, a hand-built test object, or garbage.
 * @returns An {@link ElementLayout} with every field guaranteed finite, or `null`
 * when the event carries no `nativeEvent.layout`.
 *
 * @example
 * ```ts
 * readElementLayout({ nativeEvent: { layout: { x: 0, y: 420, width: 375, height: 120 } } });
 * // { x: 0, y: 420, width: 375, height: 120 }
 * ```
 */
export function readElementLayout(event: unknown): ElementLayout | null {
  if (event === null || typeof event !== 'object') {
    return null;
  }

  const layout = (event as LooseLayoutEvent).nativeEvent?.layout;
  if (!layout || typeof layout !== 'object') {
    return null;
  }

  return {
    x: toFiniteNumber(layout.x),
    y: toFiniteNumber(layout.y),
    width: toFiniteNumber(layout.width),
    height: toFiniteNumber(layout.height),
  };
}

/**
 * Project {@link ScrollMetrics} onto the active scroll axis and precompute the
 * distances every built-in position is expressed in terms of.
 *
 * @param metrics - Normalized scroll metrics.
 * @param threshold - The already-normalized threshold, in dp.
 * @param horizontal - `true` to project onto the x axis instead of y.
 * @returns The metrics plus `offset`/`viewport`/`content` and the three distances.
 *
 * @remarks
 * Projecting once, here, is why none of the predicates below need to branch on
 * the axis — the horizontal formulas are literally the vertical ones.
 *
 * @example
 * ```ts
 * const m = projectMetrics(metrics, 20, false);
 * m.distanceToEnd; // contentSize.height - (contentOffset.y + layoutMeasurement.height)
 * ```
 */
export function projectMetrics(
  metrics: ScrollMetrics,
  threshold: number,
  horizontal: boolean
): IntersectionMetrics {
  const offset = horizontal ? metrics.contentOffset.x : metrics.contentOffset.y;
  const viewport = horizontal
    ? metrics.layoutMeasurement.width
    : metrics.layoutMeasurement.height;
  const content = horizontal
    ? metrics.contentSize.width
    : metrics.contentSize.height;
  const startInset = horizontal
    ? metrics.contentInset.left
    : metrics.contentInset.top;
  const endInset = horizontal
    ? metrics.contentInset.right
    : metrics.contentInset.bottom;

  return {
    ...metrics,
    threshold,
    horizontal,
    offset,
    viewport,
    content,
    distanceFromStart: offset + startInset,
    distanceToEnd: content + endInset - (offset + viewport),
    distanceFromCenter: offset + viewport / 2 - content / 2,
  };
}

/**
 * Decide whether the observer is currently intersecting.
 *
 * @param metrics - Normalized scroll metrics, from {@link readScrollMetrics}.
 * @param config - Position, threshold, axis and optional custom predicate.
 * @param layout - The tracked element's rectangle for `position: 'element'`, or
 * `null` when none has been captured. Ignored by every other position.
 * @returns `true`/`false` for a real decision, or `null` for "no decision — leave
 * the state alone".
 *
 * @remarks
 * The measurement guard (`viewport <= 0 || content <= 0`) runs first and is the
 * single most important check in the library: React Native delivers scroll events
 * with zero-sized measurements during initial layout, and without the guard the
 * `'bottom'` predicate reads `0 - 0 <= 20` as `true` and fires a phantom
 * `onIntersect` (and, in the documented infinite-scroll example, a phantom page
 * load) on mount.
 *
 * Documented behaviours worth knowing:
 * - Content shorter than the viewport is `true` for `'bottom'` (you are already
 *   looking at the end, exactly like `FlatList`'s own `onEndReached`) and `true`
 *   for `'center'` (the content center is permanently inside the viewport). It is
 *   also `true` for `'top'`, so both a top and a bottom observer report `true` at
 *   once for such content. That is geometrically honest, not a bug.
 * - iOS rubber-banding produces negative offsets and offsets past the end; nothing
 *   is clamped, so `'top'` stays `true` while the user drags past the top and
 *   `'bottom'` stays `true` while they drag past the end. `'top'` deliberately does
 *   **not** use `Math.abs`, which would flip to `false` at the very moment the user
 *   is furthest past the top. `'center'` is the only two-sided predicate.
 * - `contentInset` is folded into `'top'` and `'bottom'` (an iOS large-title header
 *   or `RefreshControl` makes the resting offset `-contentInset.top`, not `0`) but
 *   deliberately not into `'center'`, where both centers shift together.
 *
 * @example
 * ```ts
 * computeIntersection(metrics, { position: 'bottom', threshold: 20 }, null);
 * computeIntersection(metrics, { position: 'element', threshold: 0 }, elementRect);
 * ```
 */
export function computeIntersection(
  metrics: ScrollMetrics,
  config: IntersectionGeometryConfig,
  layout: ElementLayout | null
): boolean | null {
  const threshold = normalizeThreshold(config.threshold);
  const horizontal = config.horizontal === true;
  const projected = projectMetrics(metrics, threshold, horizontal);
  const { offset, viewport, content } = projected;

  // Measurement guard: nothing has been laid out yet, so there is no decision to
  // make. Never downgrade this to `false`.
  if (viewport <= 0 || content <= 0) {
    return null;
  }

  switch (config.position ?? DEFAULT_POSITION) {
    case 'top':
      return projected.distanceFromStart <= threshold;

    case 'center':
      // Unscrollable content is permanently centered.
      if (content <= viewport) {
        return true;
      }
      return Math.abs(projected.distanceFromCenter) <= threshold;

    case 'element': {
      if (!layout) {
        return null;
      }
      // A degenerate rect means the view is unmounted or not yet measured.
      if (layout.width <= 0 && layout.height <= 0) {
        return null;
      }

      const elementStart = horizontal ? layout.x : layout.y;
      const elementSize = horizontal ? layout.width : layout.height;
      const elementEnd = elementStart + elementSize;

      // The threshold expands the viewport by `threshold` on each edge; any
      // overlap counts (partial visibility is enough). A negative threshold
      // contracts it, requiring the element to be that far inside.
      const viewportStart = offset - threshold;
      const viewportEnd = offset + viewport + threshold;

      return elementEnd >= viewportStart && elementStart <= viewportEnd;
    }

    case 'custom': {
      const predicate = config.customPredicate;
      if (typeof predicate !== 'function') {
        config.warn?.(
          "position: 'custom' requires options.customPredicate; the observer will never intersect. " +
            "Supply a predicate, or use position 'top' | 'bottom' | 'center' | 'element'."
        );
        return false;
      }
      // Coerce explicitly: a truthy non-boolean must never reach `isIntersecting`.
      return predicate(projected) === true;
    }

    case 'bottom':
    default:
      return projected.distanceToEnd <= threshold;
  }
}
