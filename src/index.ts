/**
 * `@raymardev/react-native-intersection-observer`
 *
 * Scroll-intersection hooks for React Native's `ScrollView`, `FlatList` and
 * `SectionList`.
 *
 * The whole library is driven by the scroll **event payload** — it never measures
 * through the ref — so several observers can share one event, and an observer
 * whose ref is never attached still works. The only runtime import in the package
 * is `react`; everything from `react-native` is imported with `import type`, so
 * nothing pulls the React Native runtime into a non-RN context.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  readElementLayout,
  readScrollMetrics,
} from './geometry';
import type { IntersectionGeometryConfig } from './geometry';
import type {
  Callbacks,
  ElementIntersectionOptions,
  ElementLayout,
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
  readScrollMetrics,
  toFiniteNumber,
} from './geometry';
export type { IntersectionGeometryConfig } from './geometry';

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
  onIntersect?: () => void;
  onVisible?: () => void;
  onIntersectionChange?: (isIntersecting: boolean) => void;
}

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
 * @param options.horizontal - Track a horizontal scroll view. Defaults to `false`.
 * @param options.customPredicate - Required for `position: 'custom'`; decides the
 * boolean from the normalized metrics.
 * @param options.onIntersect - Fires on the `false -> true` transition.
 * @param options.onVisible - Fires on the `true -> false` transition. See the note
 * below about this name.
 * @param options.onIntersectionChange - Fires on every transition, with the new
 * value, after `onIntersect`/`onVisible`.
 *
 * @returns `{ isIntersecting, ref, handleScroll, handleElementLayout, reset }`.
 * The three functions have stable identities for the lifetime of the component, so
 * they are safe to hand to a memoized list.
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
 *   double-fire them).
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
>(options: UseIntersectionObserverOptions = {}): UseIntersectionObserverReturn<T> {
  const {
    threshold = DEFAULT_THRESHOLD,
    position = DEFAULT_POSITION,
    element,
    horizontal = false,
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

  const layoutRef = useRef<ElementLayout | null>(null);
  const metricsRef = useRef<ScrollMetrics | null>(null);
  const warnedRef = useRef<Record<string, boolean>>({});

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
    onIntersect,
    onVisible,
    onIntersectionChange,
    warn,
  });

  // No dependency array on purpose: this must run after *every* commit so the
  // handlers never see callbacks from a render that was thrown away. Assigning
  // during render would be unsafe under concurrent rendering.
  useEffect(() => {
    configRef.current = {
      position,
      threshold,
      horizontal,
      customPredicate,
      element,
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

      metricsRef.current = metrics;

      const config = configRef.current;
      if (config.position === 'element' && layoutRef.current === null) {
        warn(
          config.element
            ? "position: 'element' also needs handleElementLayout wired to the tracked view's onLayout prop; the element ref alone does not provide geometry."
            : "position: 'element' requires handleElementLayout on the tracked view's onLayout prop (and an `element` ref for clarity)."
        );
      }

      evaluateFrom(metrics, layoutRef.current);
    },
    [evaluateFrom, warn]
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

      layoutRef.current = layout;

      // Re-evaluate against the last scroll metrics so an element that becomes
      // visible through a re-layout (rather than a scroll) is still detected.
      // There are no metrics before the first scroll event, so nothing happens
      // then — which is correct: reporting `false` would be a guess.
      const metrics = metricsRef.current;
      if (metrics) {
        evaluateFrom(metrics, layout);
      }
    },
    [evaluateFrom]
  );

  const reset = useCallback((): void => {
    if (!stateRef.current) {
      return;
    }
    stateRef.current = false;
    setIsIntersecting(false);
  }, []);

  // Applying a changed threshold/position/axis immediately, instead of waiting for
  // the next scroll event. Declared after the config effect so it reads fresh
  // config, and a no-op before the first scroll event, so it can never fire a
  // callback on mount. `evaluate` is idempotent, so a StrictMode double-invoke is
  // harmless.
  useEffect(() => {
    const metrics = metricsRef.current;
    if (metrics) {
      evaluateFrom(metrics, layoutRef.current);
    }
  }, [threshold, position, horizontal, evaluateFrom]);

  return {
    isIntersecting,
    ref,
    handleScroll,
    handleElementLayout,
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
 * The exact rule is
 * `|(contentOffset.y + layoutMeasurement.height / 2) - contentSize.height / 2| <= threshold`,
 * i.e. "you are looking at the middle of the content". Content that is not
 * scrollable at all is always centered.
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
 * @param element - Ref to the tracked view. Required positionally; the geometry
 * itself comes from `handleElementLayout`, so this ref is used for identity and
 * diagnostics.
 * @param threshold - How far the viewport is expanded, in dp, before testing for
 * overlap. Defaults to `20`. Positive values fire early, negative values require
 * the element to be that far inside.
 * @param callbacks - A bare `{ onIntersect, onVisible, onIntersectionChange }`
 * object — note this hook takes the callbacks directly, not nested under
 * `options.callbacks`.
 * @param options - Optional `{ horizontal }` for horizontal scroll views.
 *
 * @returns The standard observer result. You must wire **both**
 * `ref` + `onScroll={handleScroll}` on the scroll container and
 * `ref={element}` + `onLayout={handleElementLayout}` on the tracked view.
 *
 * @remarks
 * Any overlap counts — the element does not have to be fully visible.
 * `onIntersect` fires once per `false -> true` edge and keeps firing across the
 * component's lifetime, so it is safe to count impressions with it.
 *
 * **Coordinate-space limitation.** `onLayout` reports `x`/`y` relative to the
 * element's immediate **parent**, while `contentOffset` lives in content space.
 * The two coincide only when the tracked view is a direct child of the scroll
 * content and that content has no top padding, header or transform. Wrapper
 * views, `contentContainerStyle={{ paddingTop }}`, `ListHeaderComponent` and
 * `FlatList` cell wrappers all shift `layout.y` and will make detection wrong.
 * Keep the tracked view a direct child of the scroll content.
 *
 * Only the active scroll axis is checked; conditionally unmounting the tracked
 * view leaves its last rectangle in place (no `onLayout` fires on unmount), so
 * call `reset()` in that case.
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
    onIntersect: callbacks?.onIntersect,
    onVisible: callbacks?.onVisible,
    onIntersectionChange: callbacks?.onIntersectionChange,
  });
}
