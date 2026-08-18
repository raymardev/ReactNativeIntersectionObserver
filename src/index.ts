/**
 * `@raymardev/react-native-intersection-observer`
 *
 * Scroll-intersection hooks for React Native's `ScrollView`, `FlatList` and
 * `SectionList`.
 *
 * The library is driven by the scroll **event payload**, so several observers can
 * share one event and an observer whose ref is never attached still works. The
 * one exception is `position: 'element'`, which measures the tracked view against
 * the scroll content when both refs are attached — off the hot path, because that
 * measurement is scroll-invariant — and falls back to the event payload plus
 * `onLayout` when they are not.
 *
 * The only runtime import in the package is `react`; everything from
 * `react-native` is imported with `import type`, so nothing pulls the React
 * Native runtime into a non-RN context, and the platform `IntersectionObserver`
 * (React Native 0.83+, New Architecture, behind a feature flag) is detected at
 * runtime rather than imported or required.
 *
 * @packageDocumentation
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { RefObject } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';

import {
  DEFAULT_POSITION,
  DEFAULT_THRESHOLD,
  computeIntersection,
  normalizeThreshold,
  readElementLayout,
  readMeasuredRect,
  readScrollMetrics,
} from './geometry';
import type { IntersectionGeometryConfig } from './geometry';
import { isMeasurable, resolveMeasurementReference } from './measure';
import type { Measurable } from './measure';
import {
  buildRootMargin,
  entryToDecision,
  getNativeIntersectionObserver,
  resolveHostNode,
} from './native';
import type { NativeIOEntry, NativeIOInstance } from './native';
import type {
  Callbacks,
  ElementIntersectionOptions,
  ElementLayout,
  IntersectionStrategy,
  RefInstance,
  RefType,
  ScrollMetrics,
  ScrollToBottomOptions,
  ScrollToCenterOptions,
  ScrollToTopOptions,
  ScrollableComponent,
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn,
} from './types';

export type {
  Callbacks,
  ElementIntersectionOptions,
  ElementLayout,
  IntersectionMetrics,
  IntersectionPosition,
  IntersectionStrategy,
  LayoutEvent,
  RefInstance,
  RefType,
  ScrollEvent,
  ScrollHookOptions,
  ScrollMetrics,
  ScrollToBottomOptions,
  ScrollToCenterOptions,
  ScrollToTopOptions,
  ScrollableComponent,
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn,
} from './types';

export {
  DEFAULT_POSITION,
  DEFAULT_THRESHOLD,
  computeIntersection,
  normalizeThreshold,
  projectMetrics,
  readElementLayout,
  readMeasuredRect,
  readScrollMetrics,
  toFiniteNumber,
} from './geometry';
export type { IntersectionGeometryConfig } from './geometry';

export {
  isNativeIntersectionObserverAvailable,
  setNativeIntersectionObserverOverride,
} from './native';
export type {
  NativeIOConstructor,
  NativeIOEntry,
  NativeIOInstance,
  NativeIOOptions,
  NativeIORect,
} from './native';

/**
 * Metro defines `__DEV__`; Node and Jest do not. Declared module-locally (rather
 * than relying on the global from `@types/react-native`) so this file compiles
 * standalone, and always read through `typeof` so it cannot throw a
 * `ReferenceError` outside Metro.
 */
declare const __DEV__: boolean | undefined;

/**
 * Whether advisory warnings should be printed.
 *
 * Outside Metro (`__DEV__` undefined — Node, Jest, SSR) warnings are kept on, so
 * misconfiguration surfaces in tests. In a React Native production bundle
 * `__DEV__` is `false` and everything goes quiet.
 */
function isDevelopmentEnvironment(): boolean {
  return typeof __DEV__ === 'undefined' ? true : __DEV__ !== false;
}

/** Everything the scroll handler reads out of a ref, refreshed after each commit. */
interface ResolvedConfig extends IntersectionGeometryConfig {
  element?: RefObject<View | null>;
  strategy?: IntersectionStrategy;
  onIntersect?: () => void;
  onVisible?: () => void;
  onIntersectionChange?: (isIntersecting: boolean) => void;
}

/** What a live native observation holds on to, so it can be torn down again. */
interface NativeObservation {
  observer: NativeIOInstance;
  target: unknown;
  root: unknown;
}

/** Where a measurement pass currently stands. */
type MeasureState = 'idle' | 'pending' | 'ok' | 'failed' | 'unsupported';

/** Why a measurement pass was requested. Decides which budgets apply. */
type MeasureReason = 'layout' | 'scroll' | 'config' | 'imperative' | 'stale';

/**
 * Consecutive measurement failures tolerated before falling back for good.
 *
 * iOS logs a native error for every `measureLayout` against a view that is not a
 * descendant of the reference, so an unbounded retry loop would be a redbox
 * storm rather than a warning.
 */
const MAX_MEASURE_FAILURES = 3;

/** Scroll events answered with "no decision" while the first pass is in flight. */
const MAX_PENDING_SCROLLS = 3;

/** Scroll-driven attempts allowed while the target or the reference is missing. */
const MAX_RESOLUTION_RETRIES = 3;

/** Scroll events a live native observer may stay silent for before it is dropped. */
const MAX_SILENT_NATIVE_SCROLLS = 2;

const MISSING_LAYOUT_MESSAGE =
  "position: 'element' requires handleElementLayout on the tracked view's onLayout prop (and an `element` ref for clarity).";

const UNMEASURABLE_TARGET_MESSAGE =
  "position: 'element' cannot measure the tracked view: the `element` ref does not hold a native view (a class component, or a wrapper that does not forward its ref). Falling back to onLayout coordinates, which are relative to the element's parent.";

const UNRESOLVED_REFERENCE_MESSAGE =
  "position: 'element' cannot measure the tracked view yet: attach the `element` ref to the tracked view and the ref this hook returns to the scroll component. Falling back to onLayout coordinates, which are relative to the element's parent.";

const MEASURE_FAILED_MESSAGE =
  "position: 'element' measurement kept failing — is the tracked view a descendant of the scroll container? Falling back to onLayout coordinates, which are relative to the element's parent.";

const NATIVE_POSITION_MESSAGE =
  "strategy: 'native' only applies to position: 'element'; every other position is a statement about contentOffset/contentSize, which an IntersectionObserver entry does not carry. Using the scroll path.";

const NATIVE_UNAVAILABLE_MESSAGE =
  "strategy: 'native' found no usable IntersectionObserver on this runtime (it ships only on recent React Native versions, behind a feature flag, on the New Architecture). Using the scroll path.";

const NATIVE_NODES_MESSAGE =
  "strategy: 'native' needs both the tracked view and the scroll component to be attached to their refs before it can observe them. Using the scroll path.";

const NATIVE_OBSERVE_FAILED_MESSAGE =
  "The platform IntersectionObserver refused the tracked view. Using the scroll path for the rest of this component's life.";

const NATIVE_SILENT_MESSAGE =
  "The platform IntersectionObserver accepted the tracked view but reported nothing. Using the scroll path for the rest of this component's life.";

/**
 * Detect when a scroll view reaches a position, or when a tracked element becomes
 * visible.
 *
 * The hook creates its own ref for the scroll component and returns handlers you
 * attach to `onScroll` (and, for `position: 'element'`, to the tracked view's
 * `onLayout`). `isIntersecting` starts `false` and is recomputed on every scroll
 * event, but React state is only written when the boolean actually changes — so a
 * scroll that does not cross the threshold costs zero re-renders.
 *
 * @typeParam T - The scrollable component the returned ref is for. Defaults to
 * `ScrollView`; pass `FlatList` or `SectionList` explicitly when you attach the
 * ref to one of those.
 *
 * @param options - Threshold, position, axis, tracked element and transition
 * callbacks. Defaults to `{}`.
 * @param options.threshold - Distance threshold in density-independent points.
 * Defaults to `20`. Non-finite values fall back to the default; negative values
 * mean "require overscrolling past the edge".
 * @param options.position - `'top' | 'bottom' | 'center' | 'element' | 'custom'`.
 * Defaults to `'bottom'`.
 * @param options.element - Ref to the tracked view, for `position: 'element'`.
 * When it is attached the view is measured against the scroll content, so it may
 * be nested arbitrarily deep.
 * @param options.strategy - `'scroll' | 'auto' | 'native'`, for
 * `position: 'element'`. Defaults to `'scroll'`.
 * @param options.horizontal - Track a horizontal scroll view. Defaults to `false`.
 * @param options.customPredicate - Required for `position: 'custom'`; decides the
 * boolean from the normalized metrics.
 * @param options.onIntersect - Fires on the `false -> true` transition.
 * @param options.onVisible - Fires on the `true -> false` transition. See the note
 * below about this name.
 * @param options.onIntersectionChange - Fires on every transition, with the new
 * value, after `onIntersect`/`onVisible`.
 *
 * @returns `{ isIntersecting, ref, handleScroll, handleElementLayout,
 * measureElement, reset }`. The four functions have stable identities for the
 * lifetime of the component, so they are safe to hand to a memoized list.
 *
 * @remarks
 * **`onVisible` fires when the element becomes HIDDEN.** That reads backwards, but
 * it is the published 1.x contract (`onIntersect` = intersection starts,
 * `onVisible` = intersection ends) and every documented example relies on it, so it
 * is implemented exactly as documented rather than silently inverted. A clearer
 * name is planned for a future major version.
 *
 * Other behaviours worth knowing:
 * - Callbacks fire synchronously inside the event handler, once per transition,
 *   never on mount and never from an effect (so React 18 StrictMode cannot
 *   double-fire them). The two exceptions are both opt-in: a transition caused by
 *   a re-layout of a *measured* element lands when the measurement does, and
 *   `strategy: 'auto' | 'native'` delivers on the platform observer's schedule.
 * - Option callbacks are read through a ref, so passing fresh inline arrows every
 *   render is free and never invalidates `handleScroll`.
 * - Nothing is evaluated until the first scroll event arrives, and events whose
 *   measurements are still zero-sized are ignored entirely — so an empty list
 *   cannot report "at the bottom" on mount.
 * - After content grows (an infinite-scroll page load), the boolean stays `true`
 *   until the next scroll event, so `onIntersect` will not fire again on its own.
 *   Call `reset()` after each load to re-arm it.
 * - `scrollEventThrottle={16}` is required on iOS; without it `onScroll` fires
 *   roughly once per gesture.
 *
 * @example
 * ```tsx
 * const { isIntersecting, ref, handleScroll } = useIntersectionObserver({
 *   threshold: 50,
 *   position: 'bottom',
 *   onIntersect: () => loadMore(),
 * });
 *
 * return (
 *   <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
 *     {items.map(renderItem)}
 *     {isIntersecting && <ActivityIndicator />}
 *   </ScrollView>
 * );
 * ```
 */
export function useIntersectionObserver<
  T extends ScrollableComponent = ScrollView,
>(
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverReturn<T> {
  const {
    threshold = DEFAULT_THRESHOLD,
    position = DEFAULT_POSITION,
    element,
    horizontal = false,
    strategy = 'scroll',
    customPredicate,
    onIntersect,
    onVisible,
    onIntersectionChange,
  } = options;

  // `RefObject<T>` is `{ readonly current: T | null }` under @types/react 18 and is
  // the only spelling that attaches to a `ref` prop under both 18 and 19 typings.
  const ref = useRef<T>(null);

  const [isIntersecting, setIsIntersecting] = useState(false);
  // The ref is the source of truth: React state cannot be read back synchronously,
  // and a burst of scroll events can arrive inside a single batch.
  const stateRef = useRef(false);

  /** The last `onLayout` rectangle: parent-relative, and the fallback geometry. */
  const legacyRectRef = useRef<ElementLayout | null>(null);
  /** The last successful `measureLayout` rectangle: content-relative, and preferred. */
  const measuredRectRef = useRef<ElementLayout | null>(null);
  /** Whether the tracked view's ref has ever held a view, so an unmount is
   * distinguishable from a first mount that has not happened yet. */
  const elementPresenceRef = useRef<'never' | 'attached' | 'detached'>('never');
  const measureStateRef = useRef<MeasureState>('idle');
  const passIdRef = useRef(0);
  const pendingPassIdRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const failureCountRef = useRef(0);
  const resolutionRetryRef = useRef(0);
  const scrollsWhilePendingRef = useRef(0);
  const sizeSignatureRef = useRef<string | null>(null);

  const metricsRef = useRef<ScrollMetrics | null>(null);
  const warnedRef = useRef<Record<string, boolean>>({});
  const mountedRef = useRef(true);

  const nativeRef = useRef<NativeObservation | null>(null);
  /** The single flag every scroll-path call site consults before deciding. */
  const nativeOwnsRef = useRef(false);
  const nativeDeliveredRef = useRef(false);
  const nativeSilentScrollsRef = useRef(0);
  const nativeDisabledRef = useRef(false);
  /** Set when an observer that owned the decision is torn down, so the scroll
   * path can be re-armed if the next effect run declines to rebuild one. */
  const nativeHandoffRef = useRef(false);
  const nativeNodesRef = useRef<{ target: unknown; root: unknown }>({
    target: null,
    root: null,
  });
  // Refs mutating does not re-render, so an observer that has to be rebuilt for a
  // late-attached (or swapped) ref is triggered through this counter.
  const [nativeEpoch, setNativeEpoch] = useState(0);

  /** Print each advisory message at most once — this runs inside a 60fps handler. */
  const warn = useCallback((message: string): void => {
    if (warnedRef.current[message]) {
      return;
    }
    warnedRef.current[message] = true;
    if (isDevelopmentEnvironment()) {
      // eslint-disable-next-line no-console
      console.warn(`[react-native-intersection-observer] ${message}`);
    }
  }, []);

  const configRef = useRef<ResolvedConfig>({
    position,
    threshold,
    horizontal,
    customPredicate,
    element,
    strategy,
    onIntersect,
    onVisible,
    onIntersectionChange,
    warn,
  });

  /** Lets the measurement callbacks restart a pass without a circular definition. */
  const schedulePassRef = useRef<((reason: MeasureReason) => void) | null>(
    null
  );

  // No dependency array on purpose: this must run after *every* commit so the
  // handlers never see callbacks from a render that was thrown away. It is a
  // layout effect because a scroll event can be dispatched between the commit and
  // the passive flush, and that event must not run the previous render's
  // callbacks. Assigning during render would be unsafe under concurrent rendering.
  useLayoutEffect(() => {
    configRef.current = {
      position,
      threshold,
      horizontal,
      customPredicate,
      element,
      strategy,
      onIntersect,
      onVisible,
      onIntersectionChange,
      warn,
    };
  });

  /**
   * The entire state machine. `null` means "no decision" and changes nothing;
   * an unchanged boolean is a complete no-op (no re-render, no callbacks).
   */
  const evaluate = useCallback((next: boolean | null): void => {
    if (next === null || next === stateRef.current) {
      return;
    }

    stateRef.current = next;
    // State first, so a throwing user callback cannot desynchronize it.
    setIsIntersecting(next);

    const config = configRef.current;
    if (next) {
      config.onIntersect?.();
    } else {
      // Documented (inverted-sounding) contract: onVisible fires on hide.
      config.onVisible?.();
    }
    config.onIntersectionChange?.(next);
  }, []);

  /** Compute from metrics and apply, never letting an exception escape. */
  const evaluateFrom = useCallback(
    (metrics: ScrollMetrics, layout: ElementLayout | null): void => {
      let next: boolean | null;
      try {
        next = computeIntersection(metrics, configRef.current, layout);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Intersection calculation failed:', error);
        return;
      }
      evaluate(next);
    },
    [evaluate]
  );

  /**
   * The one place the two geometry sources meet.
   *
   * A measured rectangle wins for as long as measurement is working. Once it has
   * been given up on ('unsupported'), the `onLayout` rectangle takes over, which
   * is what {@link MEASURE_FAILED_MESSAGE} tells the developer happens — and the
   * stale content-space rectangle from before the view was re-parented is no
   * longer the better estimate at that point. Until a measurement exists the
   * `onLayout` rectangle is the answer as well — except during a bounded window
   * while the very first pass is in flight, where reporting the parent-relative
   * rectangle would fire an impression that the measurement is about to
   * contradict.
   */
  const selectRect = useCallback((): ElementLayout | null => {
    const measured = measuredRectRef.current;
    // A rectangle measured against the scroll container always wins over the
    // parent-relative onLayout one. Giving up on measurement does not make the
    // last good content-space rectangle wrong: a measureLayout failure spree is
    // usually a transient detach (a list recycling or re-parenting the row), and
    // preferring onLayout coordinates there would silently answer from the wrong
    // origin for the rest of the component's life.
    if (measured) {
      return measured;
    }
    if (
      measureStateRef.current === 'pending' &&
      scrollsWhilePendingRef.current <= MAX_PENDING_SCROLLS
    ) {
      return null;
    }
    return legacyRectRef.current;
  }, []);

  /** Re-evaluate against the freshest metrics, unless the native path owns them. */
  const reevaluate = useCallback((): void => {
    // `nativeHandoffRef` covers the window inside a commit where the observer has
    // been disconnected and its replacement has not been built yet: the option
    // effect runs in there, and it must not answer from the scroll path for what
    // is only a rebuild.
    if (nativeOwnsRef.current || nativeHandoffRef.current) {
      return;
    }
    const metrics = metricsRef.current;
    if (metrics) {
      evaluateFrom(metrics, selectRect());
    }
  }, [evaluateFrom, selectRect]);

  /** Account for a pass that reached the platform and came back unusable. */
  const recordMeasureFailure = useCallback((): void => {
    failureCountRef.current += 1;
    if (failureCountRef.current >= MAX_MEASURE_FAILURES) {
      measureStateRef.current = 'unsupported';
      warn(MEASURE_FAILED_MESSAGE);
    } else {
      measureStateRef.current = 'failed';
    }
    // A previously measured rectangle is deliberately kept: a detach during a
    // re-parent is transient, and the old rectangle is still the best estimate.
    reevaluate();
  }, [reevaluate, warn]);

  const handlePassSuccess = useCallback(
    (id: number, x: number, y: number, width: number, height: number): void => {
      if (!mountedRef.current || id !== pendingPassIdRef.current) {
        return;
      }
      pendingPassIdRef.current = null;

      const rect = readMeasuredRect(x, y, width, height);
      if (!rect) {
        recordMeasureFailure();
        return;
      }

      // A rectangle with no extent at all, before anything has ever been
      // measured, is React Native answering from a shadow node that has not been
      // laid out — there is nothing to cache and nothing to decide, so it spends
      // the failure budget and waits. Once a rectangle exists, the same answer
      // is the opposite: it is the view actually collapsing (hidden, emptied, or
      // unmounted from a list cell), which `computeIntersection` turns into
      // `false`. Discarding it there is what used to latch the observer at
      // `true`.
      if (
        rect.width <= 0 &&
        rect.height <= 0 &&
        measuredRectRef.current === null
      ) {
        recordMeasureFailure();
        return;
      }

      const superseded = dirtyRef.current;
      if (!superseded || measuredRectRef.current === null) {
        measuredRectRef.current = rect;
      }
      measureStateRef.current = 'ok';
      failureCountRef.current = 0;
      resolutionRetryRef.current = 0;

      // Evaluated against the *freshest* metrics rather than the ones that were
      // current when the pass started. The measured rectangle is scroll
      // invariant, so there is no frame of staleness to compensate for.
      reevaluate();

      if (superseded) {
        dirtyRef.current = false;
        schedulePassRef.current?.('stale');
      }
    },
    [recordMeasureFailure, reevaluate]
  );

  const handlePassFailure = useCallback(
    (id: number): void => {
      if (!mountedRef.current || id !== pendingPassIdRef.current) {
        return;
      }
      pendingPassIdRef.current = null;
      recordMeasureFailure();
    },
    [recordMeasureFailure]
  );

  /**
   * Notice a tracked view that has been unmounted, and forget its geometry.
   *
   * @returns `true` when this call was the one that saw it disappear.
   *
   * @remarks
   * React sets the ref to `null` on unmount and no `onLayout` ever fires, so
   * without this the last rectangle would stay cached and keep producing
   * intersections for a view that no longer exists — including through `reset()`,
   * whose effect the very next scroll event undid. A view that has been rendered
   * and is now gone is not "unmeasured": it is measured and not visible, so the
   * decision is `false` rather than "no decision".
   */
  const noteElementDetached = useCallback((): boolean => {
    const config = configRef.current;
    const target = config.element;
    if (!target || config.position !== 'element' || nativeOwnsRef.current) {
      return false;
    }

    if (target.current !== null && target.current !== undefined) {
      elementPresenceRef.current = 'attached';
      return false;
    }
    // 'never' is the ordinary first mount, where the ref is simply not attached
    // yet; 'detached' has already been dealt with once.
    if (elementPresenceRef.current !== 'attached') {
      return false;
    }

    elementPresenceRef.current = 'detached';
    measuredRectRef.current = null;
    legacyRectRef.current = null;
    measureStateRef.current = 'idle';
    pendingPassIdRef.current = null;
    dirtyRef.current = false;
    failureCountRef.current = 0;
    resolutionRetryRef.current = 0;
    scrollsWhilePendingRef.current = 0;
    sizeSignatureRef.current = null;
    evaluate(false);
    return true;
  }, [evaluate]);

  /**
   * Measure the tracked view against the scroll container, at most once at a
   * time. Every trigger funnels through here; nothing else calls `measureLayout`.
   */
  const schedulePass = useCallback(
    (reason: MeasureReason): void => {
      const config = configRef.current;
      if (config.position !== 'element' || nativeOwnsRef.current) {
        return;
      }

      noteElementDetached();
      if (elementPresenceRef.current === 'detached') {
        // There is nothing left to measure, and the state machine has already
        // been told the view is gone. Retrying (and eventually warning about an
        // unattached ref) would be a misdiagnosis of an ordinary unmount.
        return;
      }

      const state = measureStateRef.current;
      if (
        state === 'unsupported' &&
        reason !== 'imperative' &&
        reason !== 'config'
      ) {
        return;
      }
      if (state === 'pending') {
        // Coalesce: remember that the result will already be out of date.
        dirtyRef.current = true;
        return;
      }
      if (
        reason === 'scroll' &&
        resolutionRetryRef.current >= MAX_RESOLUTION_RETRIES
      ) {
        return;
      }

      const candidate: unknown = config.element?.current ?? null;
      if (candidate !== null && !isMeasurable(candidate)) {
        measureStateRef.current = 'unsupported';
        warn(UNMEASURABLE_TARGET_MESSAGE);
        return;
      }
      // `measureLayout` is read off the ref value rather than off React Native's
      // own typings, which describe the legacy numeric-handle overload.
      const target = candidate as Measurable | null;

      const reference = resolveMeasurementReference(ref.current);
      if (target === null || reference === null) {
        // Nothing was asked of the platform, so this is "not ready yet" rather
        // than a failure; only scroll-driven attempts spend the budget.
        if (reason === 'scroll' || reason === 'stale') {
          resolutionRetryRef.current += 1;
          if (
            resolutionRetryRef.current === MAX_RESOLUTION_RETRIES &&
            config.element
          ) {
            warn(UNRESOLVED_REFERENCE_MESSAGE);
          }
        }
        return;
      }

      const id = passIdRef.current + 1;
      passIdRef.current = id;
      pendingPassIdRef.current = id;
      measureStateRef.current = 'pending';
      scrollsWhilePendingRef.current = 0;
      dirtyRef.current = false;

      try {
        target.measureLayout(
          reference,
          (x: number, y: number, width: number, height: number) => {
            handlePassSuccess(id, x, y, width, height);
          },
          () => {
            handlePassFailure(id);
          }
        );
      } catch {
        // A view detached between the check and the call throws synchronously.
        if (pendingPassIdRef.current === id) {
          pendingPassIdRef.current = null;
          recordMeasureFailure();
        }
      }
    },
    [
      handlePassFailure,
      handlePassSuccess,
      noteElementDetached,
      recordMeasureFailure,
      warn,
    ]
  );

  useLayoutEffect(() => {
    schedulePassRef.current = schedulePass;
  }, [schedulePass]);

  /**
   * Notice a tracked view or scroll component whose ref was attached, detached or
   * swapped without a re-render, and rebuild the native observer for it.
   */
  const syncNativeNodes = useCallback((): void => {
    const config = configRef.current;
    if (
      config.strategy === 'scroll' ||
      config.position !== 'element' ||
      nativeDisabledRef.current
    ) {
      return;
    }

    const target = resolveHostNode(config.element?.current ?? null);
    const root = resolveHostNode(ref.current);
    const seen = nativeNodesRef.current;
    if (seen.target === target && seen.root === root) {
      return;
    }

    nativeNodesRef.current = { target, root };
    setNativeEpoch(epoch => epoch + 1);
  }, []);

  /**
   * Put the scroll path back in charge of the geometry.
   *
   * @remarks
   * Every trigger that hands ownership back — the silent-observer downgrade, a
   * runtime change of `strategy`, a tracked view the observer refuses — has to
   * come through here. `schedulePass` is a no-op while the native path owns the
   * decision, so the size signature `handleScroll` keeps recording during that
   * time never provokes a measurement: it is simply "already seen" by the time
   * the scroll path needs it, and every later event compares equal to it. Clearing
   * it, and asking for one pass immediately, is what stops the observer silently
   * reverting to the parent-relative `onLayout` rectangle for the rest of the
   * component's life.
   */
  const rearmScrollPath = useCallback((): void => {
    sizeSignatureRef.current = null;
    if (configRef.current.position === 'element') {
      schedulePassRef.current?.('config');
    }
  }, []);

  /** Give the decision back to the scroll path, permanently, for this mount. */
  const relinquishNative = useCallback(
    (message: string): void => {
      const observation = nativeRef.current;
      nativeOwnsRef.current = false;
      nativeDisabledRef.current = true;
      nativeHandoffRef.current = false;
      nativeRef.current = null;
      if (observation) {
        try {
          observation.observer.disconnect();
        } catch {
          // An observer that is already gone cannot be disconnected twice.
        }
      }
      rearmScrollPath();
      warn(message);
    },
    [rearmScrollPath, warn]
  );

  const handleNativeEntries = useCallback(
    (entries: NativeIOEntry[]): void => {
      if (!mountedRef.current || !nativeOwnsRef.current) {
        return;
      }
      const observation = nativeRef.current;
      if (!observation || !Array.isArray(entries)) {
        return;
      }

      // Entries are time ordered, so only the last one for our target matters —
      // exactly as the scroll path skips the states between two events.
      let last: NativeIOEntry | null = null;
      for (const entry of entries) {
        if (entry && entry.target === observation.target) {
          last = entry;
        }
      }
      if (!last) {
        return;
      }

      nativeDeliveredRef.current = true;

      let next: boolean | null;
      try {
        next = entryToDecision(last, configRef.current.horizontal === true);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Intersection calculation failed:', error);
        return;
      }

      try {
        evaluate(next);
      } catch (error) {
        // A user callback that throws inside a native dispatch can silently kill
        // every later delivery for this observer. Rethrowing asynchronously keeps
        // the observer alive and still reaches the global error handler.
        setTimeout(() => {
          throw error;
        }, 0);
      }
    },
    [evaluate]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      let metrics: ScrollMetrics | null;
      try {
        metrics = readScrollMetrics(event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Intersection calculation failed:', error);
        return;
      }
      if (!metrics) {
        return;
      }

      // Recorded even while the native path owns the decision, so a downgrade or
      // a change of position has something to work from immediately.
      metricsRef.current = metrics;

      const config = configRef.current;

      if (config.position === 'element') {
        syncNativeNodes();

        // A tracked view that was rendered and is not any more: the cached
        // rectangle is a ghost, and this is the only signal that it is one.
        noteElementDetached();

        if (measureStateRef.current === 'pending') {
          scrollsWhilePendingRef.current += 1;
        }

        // The measured rectangle is scroll invariant, so scrolling never
        // invalidates it. A change of content or viewport size does. Nothing is
        // recorded while the native path owns the decision, because the pass it
        // would trigger is dropped there — leaving a signature behind would make
        // every event after a downgrade compare equal to it and measure nothing.
        if (!nativeOwnsRef.current) {
          const signature = `${metrics.contentSize.width}x${metrics.contentSize.height}|${metrics.layoutMeasurement.width}x${metrics.layoutMeasurement.height}`;
          const previous = sizeSignatureRef.current;
          sizeSignatureRef.current = signature;
          const sizeChanged =
            previous === null
              ? measuredRectRef.current === null
              : previous !== signature;
          if (sizeChanged) {
            schedulePass('scroll');
          }
        }
      }

      if (nativeOwnsRef.current) {
        if (nativeDeliveredRef.current) {
          return;
        }
        // The observer was accepted but has said nothing. Because it has never
        // reported, no transition can have come from it, so handing the decision
        // back to the scroll path here cannot manufacture an edge.
        nativeSilentScrollsRef.current += 1;
        if (nativeSilentScrollsRef.current < MAX_SILENT_NATIVE_SCROLLS) {
          return;
        }
        // Native delivery is asynchronous by contract, and an element mounted
        // mid-fling can burn this budget before the first dispatch. Draining the
        // queue first is the difference between "has nothing to say" and "has
        // not been given a tick yet": a record waiting there proves the observer
        // is alive, so it is used and ownership is kept.
        const observation = nativeRef.current;
        let queued: NativeIOEntry[] = [];
        try {
          queued = observation ? observation.observer.takeRecords() : [];
        } catch {
          // An observer that cannot be drained is one that cannot be trusted.
          queued = [];
        }
        if (Array.isArray(queued) && queued.length > 0) {
          nativeSilentScrollsRef.current = 0;
          handleNativeEntries(queued);
          return;
        }
        relinquishNative(NATIVE_SILENT_MESSAGE);
      }

      const rect = selectRect();
      if (
        config.position === 'element' &&
        rect === null &&
        !config.element &&
        measureStateRef.current !== 'pending'
      ) {
        // Only reachable when there is no ref to measure and no layout event has
        // ever arrived; a correctly wired ref never provokes this.
        warn(MISSING_LAYOUT_MESSAGE);
      }

      evaluateFrom(metrics, rect);
    },
    [
      evaluateFrom,
      handleNativeEntries,
      noteElementDetached,
      relinquishNative,
      schedulePass,
      selectRect,
      syncNativeNodes,
      warn,
    ]
  );

  const handleElementLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      let layout: ElementLayout | null;
      try {
        layout = readElementLayout(event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Intersection calculation failed:', error);
        return;
      }
      if (!layout) {
        return;
      }

      legacyRectRef.current = layout;

      if (configRef.current.position === 'element') {
        syncNativeNodes();
        // A layout event is the definitive "this view's box changed" signal, so
        // it is the primary measurement trigger as well as the fallback geometry.
        schedulePass('layout');
      }

      // Re-evaluate against the last scroll metrics so an element that becomes
      // visible through a re-layout (rather than a scroll) is still detected.
      // There are no metrics before the first scroll event, so nothing happens
      // then — which is correct: reporting `false` would be a guess.
      reevaluate();
    },
    [reevaluate, schedulePass, syncNativeNodes]
  );

  const measureElement = useCallback((): void => {
    if (configRef.current.position !== 'element') {
      return;
    }
    failureCountRef.current = 0;
    resolutionRetryRef.current = 0;
    // A pass in flight is abandoned rather than waited for. React Native's own
    // `measureLayout` returns without calling either callback when a shadow node
    // has gone (and the jest view mock never calls back at all), and a pass that
    // never answers would otherwise leave the state at 'pending' for good,
    // silently disabling every later measurement. Bumping the id keeps the
    // abandoned callbacks ignored if they do arrive late.
    passIdRef.current += 1;
    pendingPassIdRef.current = null;
    measureStateRef.current = 'idle';
    scrollsWhilePendingRef.current = 0;
    dirtyRef.current = false;
    schedulePass('imperative');
  }, [schedulePass]);

  const reset = useCallback((): void => {
    if (!stateRef.current) {
      return;
    }
    stateRef.current = false;
    setIsIntersecting(false);

    // The native path does not re-deliver an unchanged intersection state, so a
    // still-visible element would stay wrongly `false` forever. Re-observing
    // forces a fresh initial entry carrying the current truth.
    const observation = nativeRef.current;
    if (nativeOwnsRef.current && observation) {
      try {
        observation.observer.unobserve(observation.target);
        observation.observer.observe(observation.target);
      } catch {
        // If it cannot be re-armed there is nothing useful left to do; the
        // silent-observer downgrade will hand the decision back on scroll.
      }
    }
  }, []);

  // Applying a changed threshold/position/axis/predicate immediately, instead of
  // waiting for the next scroll event. Declared after the config effect so it
  // reads fresh config, and a no-op before the first scroll event, so it can
  // never fire a callback on mount. `evaluate` is idempotent, so a StrictMode
  // double-invoke is harmless.
  useEffect(() => {
    reevaluate();
  }, [threshold, position, horizontal, customPredicate, reevaluate]);

  // A changed tracked element (or a position that has just become 'element')
  // invalidates everything that was measured for the previous one. The first
  // mount is deliberately excluded: an effect can run before native layout is
  // complete, where a pass would report a well-formed but wrong rectangle. The
  // element's own onLayout, or the first scroll event, starts that one.
  const measureConfigRef = useRef({ position, element });
  useEffect(() => {
    const previous = measureConfigRef.current;
    if (previous.position === position && previous.element === element) {
      return;
    }
    measureConfigRef.current = { position, element };

    measuredRectRef.current = null;
    measureStateRef.current = 'idle';
    pendingPassIdRef.current = null;
    dirtyRef.current = false;
    failureCountRef.current = 0;
    resolutionRetryRef.current = 0;
    scrollsWhilePendingRef.current = 0;
    sizeSignatureRef.current = null;
    // A different tracked view that has not attached yet is "not yet", not "gone".
    elementPresenceRef.current = 'never';

    if (position === 'element') {
      schedulePass('config');
    }
  }, [position, element, schedulePass]);

  // The native observer. Rebuilt whenever anything it was constructed from
  // changes — `rootMargin` and `root` are immutable per the specification — and
  // fully disconnected in between, so a StrictMode remount leaves exactly one.
  useEffect(() => {
    nativeOwnsRef.current = false;

    // Set by the cleanup below when an observer that owned the decision was torn
    // down. Every path out of this effect that does not build a replacement is a
    // handover to the scroll path, and has to leave it able to measure again.
    const handedOff = nativeHandoffRef.current;
    nativeHandoffRef.current = false;
    const declineOwnership = (): void => {
      if (handedOff) {
        rearmScrollPath();
        // `nativeHandoffRef` is already cleared above, so this is the point at
        // which the scroll path may answer again. Re-evaluating here is what
        // keeps the documented "an option change applies immediately" promise:
        // without it a change that tears the observer down in the same commit
        // would leave `isIntersecting` stale until the next scroll event.
        reevaluate();
      }
    };

    if (strategy === 'scroll') {
      declineOwnership();
      return;
    }

    const verbose = strategy === 'native';
    if (position !== 'element') {
      if (verbose) {
        warn(NATIVE_POSITION_MESSAGE);
      }
      declineOwnership();
      return;
    }
    if (nativeDisabledRef.current) {
      declineOwnership();
      return;
    }

    const target = resolveHostNode(element?.current ?? null);
    const root = resolveHostNode(ref.current);
    nativeNodesRef.current = { target, root };

    const Observer = getNativeIntersectionObserver();
    if (!Observer) {
      if (verbose) {
        warn(NATIVE_UNAVAILABLE_MESSAGE);
      }
      declineOwnership();
      return;
    }
    if (target === null || root === null) {
      // A null root would mean "the whole screen" to the platform observer,
      // which is a different measurement, so the scroll path takes over instead.
      if (verbose) {
        warn(NATIVE_NODES_MESSAGE);
      }
      declineOwnership();
      return;
    }

    let observer: NativeIOInstance | null = null;
    try {
      observer = new Observer(handleNativeEntries, {
        root,
        rootMargin: buildRootMargin(normalizeThreshold(threshold), horizontal),
        threshold: 0,
      });
      observer.observe(target);
    } catch {
      if (observer) {
        try {
          observer.disconnect();
        } catch {
          // Best effort: the constructor already told us it cannot help here.
        }
      }
      nativeDisabledRef.current = true;
      warn(NATIVE_OBSERVE_FAILED_MESSAGE);
      declineOwnership();
      return;
    }

    const created = observer;
    nativeRef.current = { observer: created, target, root };
    nativeOwnsRef.current = true;
    nativeDeliveredRef.current = false;
    nativeSilentScrollsRef.current = 0;

    // The platform observer owns the geometry now, so a measurement started
    // before it was built is abandoned rather than left in flight — otherwise a
    // later downgrade would begin inside a suppression window.
    if (measureStateRef.current === 'pending') {
      pendingPassIdRef.current = null;
      measureStateRef.current = 'idle';
      scrollsWhilePendingRef.current = 0;
    }

    return () => {
      nativeOwnsRef.current = false;
      nativeRef.current = null;
      // The scroll path may be about to inherit the decision — from a runtime
      // change of `strategy`, `position` or the refs. On unmount nothing runs
      // this effect again, so the flag is simply dropped with the component.
      nativeHandoffRef.current = true;
      try {
        created.disconnect();
      } catch {
        // Tearing down an observer whose runtime is already gone is fine.
      }
    };
  }, [
    element,
    handleNativeEntries,
    horizontal,
    nativeEpoch,
    position,
    rearmScrollPath,
    reevaluate,
    strategy,
    threshold,
    warn,
  ]);

  // Declared last so it is the final cleanup to run: a measurement or a native
  // entry that lands after unmount must be a silent no-op, never a setState.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    isIntersecting,
    ref,
    handleScroll,
    handleElementLayout,
    measureElement,
    reset,
  };
}

/**
 * Build the flat core options from a convenience hook's nested option bag.
 *
 * @param position - The position the convenience hook is fixed to.
 * @param threshold - The caller's threshold.
 * @param options - `{ type?, callbacks?, horizontal? }`, possibly `undefined`.
 * @returns Flat {@link UseIntersectionObserverOptions} for the core hook.
 *
 * @remarks
 * `options.type` is intentionally dropped: all three scroll components emit
 * identical scroll events, so it is a type-level hint only.
 */
function toCoreOptions(
  position: UseIntersectionObserverOptions['position'],
  threshold: number,
  options?: { callbacks?: Callbacks; horizontal?: boolean }
): UseIntersectionObserverOptions {
  return {
    position,
    threshold,
    horizontal: options?.horizontal,
    onIntersect: options?.callbacks?.onIntersect,
    onVisible: options?.callbacks?.onVisible,
    onIntersectionChange: options?.callbacks?.onIntersectionChange,
  };
}

/**
 * Detect when the user has scrolled within `threshold` of the **end** of the
 * content. The classic infinite-scroll trigger.
 *
 * @typeParam K - Inferred from `options.type`; decides whether the returned ref is
 * typed for a `ScrollView`, a `FlatList` or a `SectionList`.
 *
 * @param threshold - Distance from the end, in dp. Defaults to `20`.
 * @param options - Optional `{ type, callbacks, horizontal }`.
 * @param options.type - `'scrollview' | 'flatlist' | 'sectionlist'`. Defaults to
 * `'scrollview'`. Types the returned ref; has no effect on the math.
 * @param options.callbacks - `onIntersect` (reached the end), `onVisible` (left the
 * end — see the naming note on {@link useIntersectionObserver}) and
 * `onIntersectionChange`.
 * @param options.horizontal - Treat the end as the right/end edge of a horizontal
 * list. Defaults to `false`.
 *
 * @returns The standard observer result; attach `ref` and `handleScroll`.
 *
 * @remarks
 * Content shorter than the viewport counts as "at the end", matching `FlatList`'s
 * own `onEndReached`. If you keep `onEndReached` as well you will paginate twice —
 * pick one mechanism. Call `reset()` after each page loads to re-arm `onIntersect`.
 *
 * @example
 * ```tsx
 * const { isIntersecting, ref, handleScroll } = useScrollToBottom(100, {
 *   type: 'flatlist',
 *   callbacks: { onIntersect: () => loadNextPage() },
 * });
 *
 * return (
 *   <FlatList
 *     ref={ref}
 *     data={items}
 *     renderItem={renderItem}
 *     onScroll={handleScroll}
 *     scrollEventThrottle={16}
 *     ListFooterComponent={isIntersecting ? <ActivityIndicator /> : null}
 *   />
 * );
 * ```
 */
export function useScrollToBottom<K extends RefType = 'scrollview'>(
  threshold: number = DEFAULT_THRESHOLD,
  options?: ScrollToBottomOptions<K>
): UseIntersectionObserverReturn<RefInstance[K]> {
  return useIntersectionObserver<RefInstance[K]>(
    toCoreOptions('bottom', threshold, options)
  );
}

/**
 * Detect when the user is within `threshold` of the **start** of the content.
 *
 * @typeParam K - Inferred from `options.type`; decides the type of the returned ref.
 *
 * @param threshold - Distance from the start, in dp. Defaults to `20`.
 * @param options - Optional `{ type, callbacks, horizontal }`.
 * @param options.type - `'scrollview' | 'flatlist' | 'sectionlist'`. Defaults to
 * `'scrollview'`. Types the returned ref; has no effect on the math.
 * @param options.callbacks - `onIntersect` (reached the top), `onVisible` (left the
 * top) and `onIntersectionChange`.
 * @param options.horizontal - Treat the start as the left/start edge of a
 * horizontal list. Defaults to `false`.
 *
 * @returns The standard observer result; attach `ref` and `handleScroll`.
 *
 * @remarks
 * Pull-to-refresh overscroll produces a negative offset, which still counts as
 * "at the top" — the predicate is deliberately one-sided. On iOS the resting
 * offset under a large-title header or a `RefreshControl` is `-contentInset.top`,
 * and the inset is folded in so a threshold of `20` still means 20 dp.
 *
 * Note that `isIntersecting` is `false` until the first scroll event, even though
 * a scroll view starts at the top — nothing is reported before anything is
 * measured.
 *
 * @example
 * ```tsx
 * const { isIntersecting, ref, handleScroll } = useScrollToTop(50, {
 *   callbacks: { onIntersect: () => setShowHeaderShadow(false) },
 * });
 *
 * return (
 *   <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
 *     {content}
 *   </ScrollView>
 * );
 * ```
 */
export function useScrollToTop<K extends RefType = 'scrollview'>(
  threshold: number = DEFAULT_THRESHOLD,
  options?: ScrollToTopOptions<K>
): UseIntersectionObserverReturn<RefInstance[K]> {
  return useIntersectionObserver<RefInstance[K]>(
    toCoreOptions('top', threshold, options)
  );
}

/**
 * Detect when the center of the viewport is within `threshold` of the center of
 * the content.
 *
 * @typeParam K - Inferred from `options.type`; decides the type of the returned ref.
 *
 * @param threshold - Half-width of the centered band, in dp. Defaults to `20`.
 * @param options - Optional `{ type, callbacks, horizontal }`.
 * @param options.type - `'scrollview' | 'flatlist' | 'sectionlist'`. Defaults to
 * `'scrollview'`. Types the returned ref; has no effect on the math.
 * @param options.callbacks - `onIntersect` (entered the centered band),
 * `onVisible` (left it) and `onIntersectionChange`.
 * @param options.horizontal - Center on the horizontal axis. Defaults to `false`.
 *
 * @returns The standard observer result; attach `ref` and `handleScroll`.
 *
 * @remarks
 * The exact rule has two branches, in this order:
 * 1. content that cannot scroll (`contentSize.height <= layoutMeasurement.height`)
 *    is always centered — its center is permanently inside the viewport;
 * 2. otherwise
 *    `|(contentOffset.y + layoutMeasurement.height / 2) - contentSize.height / 2| <= threshold`,
 *    i.e. "you are looking at the middle of the content".
 *
 * `contentInset` is deliberately not folded in here: both centers shift together.
 *
 * The default threshold of `20` makes the band 40 dp wide, which a fast fling can
 * skip entirely at `scrollEventThrottle={16}`. Use a threshold proportional to the
 * viewport (100+ is typical) for reliable center detection.
 *
 * @example
 * ```tsx
 * const { isIntersecting, ref, handleScroll } = useScrollToCenter(100, {
 *   callbacks: { onIntersectionChange: (centered) => setHalfwayBadge(centered) },
 * });
 *
 * return (
 *   <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
 *     {content}
 *   </ScrollView>
 * );
 * ```
 */
export function useScrollToCenter<K extends RefType = 'scrollview'>(
  threshold: number = DEFAULT_THRESHOLD,
  options?: ScrollToCenterOptions<K>
): UseIntersectionObserverReturn<RefInstance[K]> {
  return useIntersectionObserver<RefInstance[K]>(
    toCoreOptions('center', threshold, options)
  );
}

/**
 * Detect when a specific child view overlaps the viewport.
 *
 * @typeParam T - The scrollable component the returned ref is for. Defaults to
 * `ScrollView`.
 *
 * @param element - Ref to the tracked view. Attach it: the view is measured
 * against the scroll container through it, which is what makes a nested view
 * track correctly.
 * @param threshold - How far the viewport is expanded, in dp, before testing for
 * overlap. Defaults to `20`. Positive values fire early, negative values require
 * the element to be that far inside.
 * @param callbacks - A bare `{ onIntersect, onVisible, onIntersectionChange }`
 * object — note this hook takes the callbacks directly, not nested under
 * `options.callbacks`.
 * @param options - Optional `{ horizontal, strategy }`.
 *
 * @returns The standard observer result. Wire `ref` + `onScroll={handleScroll}`
 * on the scroll container and `ref={element}` on the tracked view; adding
 * `onLayout={handleElementLayout}` is recommended, because it is both the
 * measurement trigger and the fallback geometry.
 *
 * @remarks
 * Any overlap counts — the element does not have to be fully visible.
 * `onIntersect` fires once per `false -> true` edge and keeps firing across the
 * component's lifetime, so it is safe to count impressions with it.
 *
 * **Coordinate space.** The tracked view is measured against the scroll view's
 * content container with `measureLayout`, which reports shadow-tree (and
 * therefore scroll-invariant) coordinates in the same space as `contentOffset`.
 * Wrapper views, `contentContainerStyle={{ paddingTop }}`, `ListHeaderComponent`
 * and `FlatList` cell wrappers are all handled. Measurement happens on layout
 * changes and on content/viewport size changes only — never per scroll event.
 *
 * If the view cannot be measured — the `element` ref is unattached, the hook's
 * `ref` is not attached to the scroll component (the multi-observer pattern), or
 * the ref holds a class component rather than a native view — the hook falls
 * back to the `onLayout` rectangle, which is relative to the element's immediate
 * **parent**. In that mode the old caveat applies: keep the tracked view a
 * direct child of the scroll content, or its `y` will be wrong.
 *
 * Only the active scroll axis is checked. Conditionally unmounting the tracked
 * view is handled: no `onLayout` fires on unmount, but the next scroll event
 * sees the ref emptied, drops the rectangle measured for it and reports the
 * element as hidden — as does a view that collapses to nothing because it was
 * given `display: 'none'`. Both fire `onVisible`, and neither can produce a
 * later impression for a view that is not on screen.
 *
 * @example
 * ```tsx
 * const elementRef = useRef<View>(null);
 * const { isIntersecting, ref, handleScroll, handleElementLayout } =
 *   useElementIntersection(elementRef, 100, {
 *     onIntersect: () => setImpressions((n) => n + 1),
 *     onVisible: () => console.log('target hidden'),
 *   });
 *
 * return (
 *   <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
 *     <View style={{ height: 900 }} />
 *     <View ref={elementRef} onLayout={handleElementLayout} style={{ height: 200 }}>
 *       <Text>{isIntersecting ? 'visible' : 'hidden'}</Text>
 *     </View>
 *   </ScrollView>
 * );
 * ```
 */
export function useElementIntersection<
  T extends ScrollableComponent = ScrollView,
>(
  element: RefObject<View | null>,
  threshold: number = DEFAULT_THRESHOLD,
  callbacks?: Callbacks,
  options?: ElementIntersectionOptions
): UseIntersectionObserverReturn<T> {
  return useIntersectionObserver<T>({
    position: 'element',
    element,
    threshold,
    horizontal: options?.horizontal,
    strategy: options?.strategy,
    onIntersect: callbacks?.onIntersect,
    onVisible: callbacks?.onVisible,
    onIntersectionChange: callbacks?.onIntersectionChange,
  });
}
