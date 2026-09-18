/**
 * Public type surface for `@raymardev/react-native-intersection-observer`.
 *
 * Every type in this file is re-exported from the package root (`src/index.ts`),
 * so consumers can do:
 *
 * ```ts
 * import type {
 *   UseIntersectionObserverOptions,
 *   UseIntersectionObserverReturn,
 * } from '@raymardev/react-native-intersection-observer';
 * ```
 *
 * All imports below are **type-only**. Nothing in this module survives
 * compilation, which is what keeps the library's "zero runtime dependencies"
 * promise literally true even under single-file transpilers (Babel/metro, SWC,
 * esbuild, ts-jest with `isolatedModules`) that cannot infer type-only usage.
 */

import type { RefObject } from 'react';
import type { FlatList, ScrollView, SectionList, View } from 'react-native';

/**
 * Where in the scroll view the intersection should be detected.
 *
 * - `'top'` — the scroll offset is within `threshold` of the start of the content.
 * - `'bottom'` — the trailing edge of the viewport is within `threshold` of the end
 *   of the content. This is the default.
 * - `'center'` — the center of the viewport is within `threshold` of the center of
 *   the content.
 * - `'element'` — a tracked child view (wired up through
 *   {@link UseIntersectionObserverReturn.handleElementLayout}) overlaps the
 *   viewport, expanded by `threshold` on both edges.
 * - `'custom'` — delegates the decision to
 *   {@link UseIntersectionObserverOptions.customPredicate}. Without a predicate the
 *   observer never intersects (and warns once in development).
 *
 * When {@link UseIntersectionObserverOptions.horizontal} is `true`, `'top'` means
 * the *start* edge and `'bottom'` means the *end* edge of the horizontal axis
 * (left/right respectively in LTR layouts).
 */
export type IntersectionPosition =
  | 'top'
  | 'bottom'
  | 'center'
  | 'custom'
  | 'element';

/**
 * How the intersection is computed for `position: 'element'`.
 *
 * - `'scroll'` — always derive the answer from the scroll event payload and the
 *   tracked view's measured rectangle. This is the default and is the only
 *   strategy every runtime supports.
 * - `'auto'` — use the platform `IntersectionObserver` when this runtime has a
 *   usable one and both the scroll container and the tracked view resolve to
 *   host nodes (never to a numeric node handle, which is not a node); otherwise
 *   fall back to `'scroll'` silently.
 * - `'native'` — the same selection as `'auto'`, but every reason for falling
 *   back is reported once through a development warning. Intended for verifying
 *   that the native path is actually being taken.
 *
 * The other four positions are statements about `contentOffset`, `contentSize`
 * and `contentInset` — quantities an `IntersectionObserverEntry` does not carry
 * — so they are always computed from the scroll payload whatever this is set to.
 *
 * @remarks
 * The native path differs from the scroll path in two documented ways: it
 * reports an element that is already visible shortly after mount, instead of
 * waiting for the first scroll event, and its callbacks arrive on a later tick
 * rather than synchronously inside `onScroll`.
 */
export type IntersectionStrategy = 'auto' | 'native' | 'scroll';

/**
 * Which React Native scrollable component the hook's ref is meant for.
 *
 * The value has **no effect on the intersection math** — `ScrollView`,
 * `FlatList` and `SectionList` all emit identical scroll events. It is used as a
 * type-level discriminator so that the returned ref is typed as the component you
 * actually attach it to.
 */
export type RefType = 'scrollview' | 'flatlist' | 'sectionlist';

/**
 * Any React Native component instance this library can hand a ref for.
 *
 * `FlatList`/`SectionList` are referenced at their `any` defaults because
 * `RefObject` is checked covariantly and a `FlatList<Message>` is not assignable
 * to a `FlatList<unknown>`; `any` keeps the constraint usable for every item type.
 */
export type ScrollableComponent =
  | ScrollView
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | FlatList<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | SectionList<any, any>;

/**
 * Maps a {@link RefType} literal onto the component instance type it refers to.
 *
 * This is what makes `useScrollToBottom(20, { type: 'flatlist' })` return a
 * `RefObject<FlatList | null>` instead of an unusable union.
 */
export interface RefInstance {
  scrollview: ScrollView;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flatlist: FlatList<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sectionlist: SectionList<any, any>;
}

/**
 * Scroll geometry, normalized to finite numbers and expressed in
 * density-independent points (dp) — **not** physical pixels. Never multiply a
 * threshold by `PixelRatio.get()`.
 *
 * `contentInset` is always present here (defaulting to zeroes) even though React
 * Native only reports it on iOS.
 */
export interface ScrollMetrics {
  /** Current scroll offset. */
  contentOffset: { x: number; y: number };
  /** Size of the visible viewport. */
  layoutMeasurement: { width: number; height: number };
  /** Total size of the scrollable content. */
  contentSize: { width: number; height: number };
  /** iOS content inset; zeroes on Android and for synthetic events. */
  contentInset: { top: number; bottom: number; left: number; right: number };
}

/**
 * {@link ScrollMetrics} projected onto the active scroll axis, with the distances
 * the built-in positions are derived from already computed.
 *
 * This is the argument handed to
 * {@link UseIntersectionObserverOptions.customPredicate}.
 */
export interface IntersectionMetrics extends ScrollMetrics {
  /** The normalized threshold actually in use, in dp. */
  threshold: number;
  /** `true` when the observer is configured for a horizontal scroll view. */
  horizontal: boolean;
  /** `contentOffset.x` when horizontal, `contentOffset.y` otherwise. */
  offset: number;
  /** Viewport width when horizontal, height otherwise. */
  viewport: number;
  /** Content width when horizontal, height otherwise. */
  content: number;
  /** Distance from the start (top/left) edge of the content. Negative while overscrolling. */
  distanceFromStart: number;
  /** Distance from the viewport's trailing edge to the end of the content. Negative past the end. */
  distanceToEnd: number;
  /** Signed distance from the viewport center to the content center. */
  distanceFromCenter: number;
}

/**
 * Options accepted by {@link useIntersectionObserver}.
 *
 * Note that the callbacks are **flat** here. The convenience hooks
 * (`useScrollToBottom` and friends) instead nest them under a
 * {@link Callbacks} object — see {@link ScrollHookOptions}.
 */
export interface UseIntersectionObserverOptions {
  /**
   * Distance threshold in density-independent points (dp) — the same unit React
   * Native reports scroll metrics in. Defaults to `20`.
   *
   * Non-finite values (`NaN`, `Infinity`, `undefined`) fall back to the default.
   * Negative values are honoured and mean "require overscrolling past the edge by
   * `|threshold|` dp". A threshold of `0` is unreliable because scroll offsets are
   * fractional; `1` is the practical floor.
   */
  threshold?: number;
  /**
   * Position where the intersection should be detected. Defaults to `'bottom'`.
   */
  position?: IntersectionPosition;
  /**
   * Element that will trigger isIntersecting when visible (for position: "element").
   *
   * Attach it to the tracked view. When it is attached — and the hook's own
   * `ref` is attached to the scroll component — the view is measured against the
   * scroll content with `measureLayout`, so a view nested inside wrappers,
   * padding or a list header is tracked correctly.
   *
   * Without it (or when the view cannot be measured) the geometry falls back to
   * {@link UseIntersectionObserverReturn.handleElementLayout}, whose rectangle is
   * relative to the element's immediate parent.
   */
  element?: RefObject<View | null>;
  /**
   * How the intersection is computed, for `position: 'element'` only. Defaults
   * to `'auto'`.
   *
   * On a runtime with no platform `IntersectionObserver` — stable React Native
   * and Expo today — `'auto'` is indistinguishable from `'scroll'`. Where one
   * does exist, the two documented differences in
   * {@link IntersectionStrategy} apply. Pass `'scroll'` to pin the scroll path
   * and get identical behaviour on every runtime.
   */
  strategy?: IntersectionStrategy;
  /**
   * Track a horizontal scroll view instead of a vertical one. Defaults to `false`.
   *
   * With `horizontal: true`, `position: 'top'` means the start (left, in LTR) edge
   * and `position: 'bottom'` means the end (right, in LTR) edge. Horizontal RTL is
   * not supported: iOS and Android disagree about the sign/origin of
   * `contentOffset.x` under `I18nManager.isRTL`.
   */
  horizontal?: boolean;
  /**
   * Required when `position` is `'custom'`. A pure, cheap predicate evaluated on
   * every scroll event. Anything other than a literal `true` is treated as `false`.
   *
   * It must not call `setState` or trigger effects: it runs inside the scroll
   * handler, potentially at 60 fps.
   */
  customPredicate?: (metrics: IntersectionMetrics) => boolean;
  /**
   * Callback function called when intersection starts (element becomes visible).
   *
   * Fires on the `false -> true` transition only — never on mount, and never twice
   * for the same edge.
   */
  onIntersect?: () => void;
  /**
   * Callback function called when intersection ends (element becomes hidden).
   *
   * @remarks
   * The name is backwards relative to its meaning: `onVisible` fires when the
   * observed thing stops being visible (`true -> false`). This is the published
   * 1.x contract and is implemented exactly as documented; a clearer name is
   * planned for a future major version.
   */
  onVisible?: () => void;
  /**
   * Callback function called when intersection changes (both visible and hidden).
   *
   * Receives the **new** value and fires after `onIntersect`/`onVisible`.
   */
  onIntersectionChange?: (isIntersecting: boolean) => void;
}

/**
 * The value returned by all five hooks.
 *
 * @typeParam T - The scrollable component the {@link UseIntersectionObserverReturn.ref}
 * is meant to be attached to. Defaults to `ScrollView`; the convenience hooks infer
 * it from their `type` option.
 */
export interface UseIntersectionObserverReturn<
  T extends ScrollableComponent = ScrollView,
> {
  /**
   * Indicating if the scroll view is intersecting at the specified position
   * or if the element is visible.
   *
   * Starts as `false` and is only ever updated from a scroll (or element layout)
   * event, so it stays `false` until the first event arrives.
   */
  isIntersecting: boolean;
  /**
   * Ref to the scroll view, flat list, or section list.
   *
   * Created by the hook — attach it to your scroll component. The library never
   * dereferences it, so it is safe to leave unattached (as the multi-observer
   * pattern does).
   *
   * @remarks
   * Declared as `RefObject<T>` rather than `RefObject<T | null>` on purpose.
   * Under `@types/react` 18 `RefObject<T>` already means `{ readonly current: T | null }`,
   * and `RefObject<T | null>` is rejected by every component's `ref` prop because
   * `RefObject` is compared variantly. `RefObject<T>` is the one spelling that
   * attaches cleanly under both `@types/react` 18 and 19.
   */
  ref: RefObject<T>;
  /**
   * Function to handle the scroll event.
   *
   * Attach to `onScroll` and set `scrollEventThrottle={16}`. Typed loosely on
   * purpose so hand-built and worklet-forwarded events are accepted; it never
   * throws, whatever it is handed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleScroll: (event: any) => void;
  /**
   * Function to handle the element layout (for position: "element").
   *
   * Attach to the tracked view's `onLayout`. Safe (and inert) to attach for any
   * other position.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleElementLayout: (event: any) => void;
  /**
   * Re-measure the tracked view against the scroll container, for
   * `position: 'element'`.
   *
   * Measurements happen automatically on every layout event and whenever the
   * content or viewport size changes, so this is only needed when the view moves
   * for a reason the hook cannot see — a parent animating, a sibling collapsing,
   * or a scroll container that never emits a layout event for the target.
   *
   * Coalesced (at most one measurement is ever in flight), a no-op for every
   * other position, and stable for the lifetime of the component. It also clears
   * the automatic retry budget, so it re-attempts even after measurement was
   * given up on, and abandons a pass that never answered — React Native returns
   * from `measureLayout` without calling either callback when a shadow node has
   * gone, and such a pass would otherwise block every later measurement.
   */
  measureElement: () => void;
  /**
   * Function to reset the intersection observer.
   *
   * Sets `isIntersecting` back to `false` without firing any callback, so the next
   * event that computes `true` is a fresh `false -> true` transition that re-fires
   * `onIntersect`. Does not clear the captured element layout or the last scroll
   * metrics — it does not have to: a tracked view that has been unmounted is
   * noticed on the next event and its rectangle is dropped then, so a view that
   * is really gone cannot report an intersection again afterwards.
   */
  reset: () => void;
}

/**
 * The three transition callbacks, as accepted by the convenience hooks.
 *
 * Identical in meaning to the flat callbacks on
 * {@link UseIntersectionObserverOptions} — including the `onVisible` naming quirk.
 */
export interface Callbacks {
  /** Called on the `false -> true` transition (it started intersecting). */
  onIntersect?: () => void;
  /** Called on the `true -> false` transition (it stopped being visible). */
  onVisible?: () => void;
  /** Called on every transition, with the new value. */
  onIntersectionChange?: (isIntersecting: boolean) => void;
}

/**
 * Shared option bag for the three scroll-position convenience hooks.
 *
 * @typeParam K - The {@link RefType} literal, inferred from `type`, that decides
 * which component the returned ref is typed for.
 */
export interface ScrollHookOptions<K extends RefType = RefType> {
  /**
   * Which scroll component the ref will be attached to. Defaults to `'scrollview'`.
   * Purely a type-level hint; it does not change any runtime behaviour.
   */
  type?: K;
  /** The transition callbacks. */
  callbacks?: Callbacks;
  /** Track a horizontal scroll view. Defaults to `false`. */
  horizontal?: boolean;
}

/** Options for {@link useScrollToBottom}. See {@link ScrollHookOptions}. */
export interface ScrollToBottomOptions<K extends RefType = RefType>
  extends ScrollHookOptions<K> {}

/** Options for {@link useScrollToTop}. See {@link ScrollHookOptions}. */
export interface ScrollToTopOptions<K extends RefType = RefType>
  extends ScrollHookOptions<K> {}

/** Options for {@link useScrollToCenter}. See {@link ScrollHookOptions}. */
export interface ScrollToCenterOptions<K extends RefType = RefType>
  extends ScrollHookOptions<K> {}

/** Extra, non-callback options for {@link useElementIntersection}. */
export interface ElementIntersectionOptions {
  /** Track a horizontal scroll view. Defaults to `false`. */
  horizontal?: boolean;
  /**
   * How the intersection is computed. Defaults to `'auto'`. See
   * {@link IntersectionStrategy}.
   */
  strategy?: IntersectionStrategy;
}

/**
 * A tracked view's rectangle, normalized to finite numbers and in dp.
 *
 * @remarks
 * The coordinate space depends on where the rectangle came from. A measured
 * rectangle (the `element` ref plus an attached scroll ref) is relative to the
 * **scroll content**, which is the space `contentOffset` lives in. An `onLayout`
 * rectangle — the fallback — is relative to the element's immediate **parent**,
 * so it is only equivalent when the tracked view is a direct child of the scroll
 * content. See {@link useElementIntersection}.
 */
export interface ElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The minimal shape {@link UseIntersectionObserverReturn.handleScroll} consumes.
 *
 * React Native's own `NativeSyntheticEvent<NativeScrollEvent>` is structurally
 * assignable to this, and so is a hand-built test event — which is why this
 * hand-rolled shape is kept instead of aliasing RN's type.
 */
export interface ScrollEvent {
  nativeEvent: {
    layoutMeasurement: {
      height: number;
      width: number;
    };
    contentOffset: {
      x: number;
      y: number;
    };
    contentSize: {
      height: number;
      width: number;
    };
    /** iOS only. Read defensively by the library; absent on Android. */
    contentInset?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
  };
}

/**
 * The minimal shape {@link UseIntersectionObserverReturn.handleElementLayout}
 * consumes. React Native's `LayoutChangeEvent` is structurally assignable to it.
 */
export interface LayoutEvent {
  nativeEvent: {
    layout: ElementLayout;
  };
}
