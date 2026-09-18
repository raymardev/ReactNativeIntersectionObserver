/**
 * Runtime detection of the platform `IntersectionObserver`.
 *
 * React Native 0.83 ships a C++ `IntersectionObserver` on the New Architecture,
 * installed as a global rather than exported from a module. It is behind a
 * feature flag and is not present in stable React Native or in Expo Go, so this
 * module never imports it, never requires a particular React Native version and
 * never adds a peer dependency — it only asks, at runtime, whether a usable
 * implementation happens to be installed.
 *
 * Nothing here imports `react` or `react-native`, so the compiled file stays
 * loadable in a plain Node process, and the probe is lazy so importing the
 * package still has no side effect.
 */

/**
 * `globalThis` is ES2020 and the package compiles against the ES2018 lib, so it
 * is declared locally and always read through `typeof` — a bundler targeting an
 * older runtime cannot make this throw.
 */
declare const globalThis: Record<string, unknown> | undefined;

/** The rectangle shape carried by a native `IntersectionObserverEntry`. */
export interface NativeIORect {
  /** Distance from the root's left edge, in dp. */
  x: number;
  /** Distance from the root's top edge, in dp. */
  y: number;
  /** Width of the target, in dp. */
  width: number;
  /** Height of the target, in dp. */
  height: number;
}

/**
 * The subset of `IntersectionObserverEntry` this library reads.
 *
 * Declared structurally instead of referencing the DOM lib: the package is
 * compiled without `lib.dom`, and the native entry is a host object that only
 * resembles the DOM one.
 */
export interface NativeIOEntry {
  /** The observed node, as it was handed to `observe()`. */
  target: unknown;
  /** Whether the target rect currently intersects the root rect. */
  isIntersecting: boolean;
  /** Fraction of the target that is inside the root. Unused by this library. */
  intersectionRatio: number;
  /** The target's rectangle, or `null` when the target is not rendered. */
  boundingClientRect: NativeIORect | null;
  /** The root's size, or `null` when the root has not been measured. */
  rootBounds: { width: number; height: number } | null;
}

/** The observer instance returned by the platform constructor. */
export interface NativeIOInstance {
  /** Start observing a node. */
  observe(target: unknown): void;
  /** Stop observing a node. */
  unobserve(target: unknown): void;
  /** Stop observing everything and drop queued records. */
  disconnect(): void;
  /** Drain and return the queued records. */
  takeRecords(): NativeIOEntry[];
}

/** The options bag accepted by the platform constructor. */
export interface NativeIOOptions {
  /** The node whose rectangle the target is tested against. */
  root?: unknown;
  /** CSS-style margin string that grows or shrinks the root rectangle. */
  rootMargin?: string;
  /** Ratio (or ratios) at which entries are delivered. */
  threshold?: number | number[];
}

/** The callback signature the platform constructor takes. */
export type NativeIOCallback = (
  entries: NativeIOEntry[],
  observer: NativeIOInstance
) => void;

/** The platform `IntersectionObserver` constructor. */
export type NativeIOConstructor = new (
  callback: NativeIOCallback,
  options?: NativeIOOptions
) => NativeIOInstance;

/**
 * How far the inactive axis is expanded so that a two-dimensional native
 * intersection test reproduces this library's single-axis one, in dp.
 *
 * Also the clamp applied to the active axis: `String(1e21)` is `'1e+21'`, which
 * is not valid CSS length syntax, so every emitted value stays decimal.
 */
export const CROSS_AXIS_MARGIN = 1e6;

/** `undefined` until the probe has run; `null` once it has run and found nothing. */
let probedConstructor: NativeIOConstructor | null | undefined;

/** A constructor forces the native path on, `false` forces it off, `null` is auto. */
let overrideConstructor: NativeIOConstructor | false | null = null;

/** The global scope, or `null` on a runtime without one. */
function getGlobalScope(): Record<string, unknown> | null {
  return typeof globalThis === 'undefined' || globalThis === null
    ? null
    : globalThis;
}

/**
 * Look for a usable platform `IntersectionObserver`.
 *
 * @returns The constructor, or `null` when none is installed or the installed
 * one is not the React Native implementation.
 */
function probeNativeConstructor(): NativeIOConstructor | null {
  const scope = getGlobalScope();
  if (scope === null) {
    return null;
  }

  // Bundler-settable kill switch, readable without importing anything.
  if (scope.__RNIO_DISABLE_NATIVE__ === true) {
    return null;
  }

  // A real DOM means jsdom or a browser, whose IntersectionObserver is the DOM
  // one: `observe()` demands an `Element` and `root` demands an
  // `Element`/`Document`, neither of which a React Native ref ever produces.
  // Rejecting on the presence of a DOM (rather than on the absence of React
  // Native) is what keeps this safe under jsdom and under a userland polyfill.
  const doc = scope.document as { createElement?: unknown } | null | undefined;
  if (
    doc !== null &&
    typeof doc === 'object' &&
    typeof doc.createElement === 'function'
  ) {
    return null;
  }

  const candidate = scope.IntersectionObserver;
  if (typeof candidate !== 'function') {
    return null;
  }

  // Construct and dispose: a stub, a half-polyfill or an implementation that
  // rejects an options bag fails here rather than at the first `observe()`.
  // Methods are checked on the instance, not the prototype, because a
  // C++-installed host object may expose them as own properties.
  try {
    const probe = new (candidate as NativeIOConstructor)(() => undefined, {
      threshold: 0,
    });
    if (
      probe === null ||
      typeof probe !== 'object' ||
      typeof probe.observe !== 'function' ||
      typeof probe.unobserve !== 'function' ||
      typeof probe.disconnect !== 'function' ||
      typeof probe.takeRecords !== 'function'
    ) {
      return null;
    }
    probe.disconnect();
  } catch {
    // Anything that throws while being constructed is not usable.
    return null;
  }

  return candidate as NativeIOConstructor;
}

/**
 * The platform `IntersectionObserver` constructor, if this runtime has a usable
 * one.
 *
 * @returns The constructor, or `null` on stable React Native, Expo, Node, Jest
 * and every browser-like environment.
 *
 * @remarks
 * The result is memoized: the probe constructs an object, and an app may mount
 * hundreds of observers. {@link setNativeIntersectionObserverOverride} clears
 * the memo, as does reloading the module.
 */
export function getNativeIntersectionObserver(): NativeIOConstructor | null {
  if (overrideConstructor !== null) {
    return overrideConstructor === false ? null : overrideConstructor;
  }
  if (probedConstructor === undefined) {
    probedConstructor = probeNativeConstructor();
  }
  return probedConstructor;
}

/**
 * Whether this runtime has a usable platform `IntersectionObserver`.
 *
 * @returns `true` only where `strategy: 'auto'` can actually take the native
 * path.
 *
 * @example
 * ```ts
 * import { isNativeIntersectionObserverAvailable } from '@raymardev/react-native-intersection-observer';
 *
 * console.log(isNativeIntersectionObserverAvailable()); // false on stable RN
 * ```
 */
export function isNativeIntersectionObserverAvailable(): boolean {
  return getNativeIntersectionObserver() !== null;
}

/**
 * Force the native path on or off, process-wide.
 *
 * @param value - A constructor to use instead of the detected one, `false` to
 * disable the native path everywhere, or `null` to restore auto-detection.
 *
 * @remarks
 * Passing `null` also clears the detection memo, which is what makes it usable
 * from a test teardown. The equivalent of `false` without importing anything is
 * setting `globalThis.__RNIO_DISABLE_NATIVE__ = true` before the first observer
 * mounts, which a bundler `define` can do.
 *
 * @example
 * ```ts
 * afterEach(() => setNativeIntersectionObserverOverride(null));
 * ```
 */
export function setNativeIntersectionObserverOverride(
  value: NativeIOConstructor | false | null
): void {
  overrideConstructor = value;
  probedConstructor = undefined;
}

/**
 * Format one `rootMargin` length.
 *
 * @param value - The length in dp; React Native treats a `px` length in
 * `rootMargin` as a dp value, so the conversion is 1:1.
 * @returns A decimal CSS length, clamped to {@link CROSS_AXIS_MARGIN}.
 *
 * @remarks
 * The clamp exists because `String(1e21)` is `'1e+21'`, which no CSS length
 * parser accepts. Fractional dp survive unchanged.
 *
 * @example
 * ```ts
 * formatRootMarginLength(20.5); // '20.5px'
 * formatRootMarginLength(-30); // '-30px'
 * ```
 */
export function formatRootMarginLength(value: number): string {
  const finite = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(
    -CROSS_AXIS_MARGIN,
    Math.min(CROSS_AXIS_MARGIN, finite)
  );
  return `${String(clamped)}px`;
}

/**
 * Build the `rootMargin` that makes a native observer agree with this library's
 * single-axis geometry.
 *
 * @param threshold - The already-normalized threshold, in dp.
 * @param horizontal - `true` when the observed scroll view scrolls horizontally.
 * @returns The four-value `'top right bottom left'` margin string.
 *
 * @remarks
 * The active axis is expanded by `threshold` (a negative threshold contracts the
 * root, which is exactly "the element must be that far inside"). The inactive
 * axis is expanded by {@link CROSS_AXIS_MARGIN} so that an element pushed far
 * off to the side still counts, matching `computeIntersection`, which only ever
 * tests the active axis.
 *
 * @example
 * ```ts
 * buildRootMargin(50, false); // '50px 1000000px 50px 1000000px'
 * buildRootMargin(50, true); // '1000000px 50px 1000000px 50px'
 * ```
 */
export function buildRootMargin(
  threshold: number,
  horizontal: boolean
): string {
  const active = formatRootMarginLength(threshold);
  const cross = formatRootMarginLength(CROSS_AXIS_MARGIN);
  return horizontal
    ? `${cross} ${active} ${cross} ${active}`
    : `${active} ${cross} ${active} ${cross}`;
}

/**
 * Turn a native entry into this library's tri-state decision.
 *
 * @param entry - One `IntersectionObserverEntry`.
 * @param horizontal - `true` when the observed scroll view scrolls
 * horizontally, so the target's extent is read off the x axis. Defaults to
 * `false`.
 * @returns `true`/`false` for a real decision, or `null` for "no decision", so
 * the observer's state is left untouched.
 *
 * @remarks
 * The tri-state means the same thing here as in `./geometry`, case for case, so
 * a component that changes strategy at runtime cannot change its answers:
 *
 * - an unmeasured root is `null` — the parity of the `viewport <= 0`
 *   measurement guard, and the only "nothing has been measured yet" case the
 *   platform reports;
 * - a target with no rectangle (the entry's own contract for "not rendered") is
 *   `false`, and so is one collapsed on the active axis — the parity of
 *   `computeIntersection`'s `elementSize <= 0` branch. Both are a view that is
 *   genuinely not visible, and returning `null` for them would latch an
 *   observer that is already `true` for the rest of the component's life;
 * - a non-finite extent is `null`, matching `readMeasuredRect`: garbage is an
 *   unusable measurement rather than an answer.
 *
 * The active axis is projected exactly as the scroll path projects it, so a
 * view collapsed to zero height at full width is classified identically by both.
 * `isIntersecting` is read directly and `intersectionRatio` is ignored, because
 * the published contract is "any overlap counts".
 */
export function entryToDecision(
  entry: NativeIOEntry,
  horizontal = false
): boolean | null {
  const root = entry.rootBounds;
  if (root === null || typeof root !== 'object') {
    return null;
  }
  if (!(root.width > 0) || !(root.height > 0)) {
    return null;
  }

  const rect = entry.boundingClientRect;
  if (rect === null || typeof rect !== 'object') {
    // The target is not rendered, which is a decision: it is not visible.
    return false;
  }

  const size = horizontal ? rect.width : rect.height;
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return null;
  }
  if (size <= 0) {
    return false;
  }

  return entry.isIntersecting === true;
}

/** The accessors a `ScrollView`/`FlatList`/`SectionList` instance exposes. */
interface HostNodeSource {
  /** `ScrollView`: a ref to the outer scroll host view. */
  getNativeScrollRef?: () => unknown;
  /** `FlatList`/`SectionList`: the underlying `ScrollView` instance. */
  getScrollResponder?: () => unknown;
  /** Legacy: a numeric node handle on the old architecture. */
  getScrollableNode?: () => unknown;
}

/** How far the `getScrollResponder` chain is followed before giving up. */
const MAX_SCROLL_HOST_DEPTH = 4;

/** Whether a value is a non-null object — the only thing worth duck-typing. */
function isHostCandidate(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

/**
 * Invoke a duck-typed accessor without letting anything escape.
 *
 * @param accessor - A candidate function read off a foreign object.
 * @returns Its return value, or `null` when it is absent or throws.
 */
function callAccessor(accessor: unknown): unknown {
  if (typeof accessor !== 'function') {
    return null;
  }
  try {
    return (accessor as () => unknown)();
  } catch {
    // A ref that is mid-unmount can throw from its own accessors.
    return null;
  }
}

/**
 * Walk a scroll component instance and its scroll responders, deduped.
 *
 * @param instance - A composite component instance or a host node.
 * @returns The instance followed by each distinct responder, nearest first.
 *
 * @remarks
 * Deliberately a local copy of the walk in `./measure` rather than an import:
 * this module has no imports at all, which is what keeps the compiled file
 * loadable anywhere and is asserted by the packaging suite.
 */
function scrollHostChain(instance: unknown): object[] {
  const chain: object[] = [];
  const seen = new Set<unknown>();
  let node: unknown = instance;

  while (
    isHostCandidate(node) &&
    !seen.has(node) &&
    chain.length < MAX_SCROLL_HOST_DEPTH
  ) {
    seen.add(node);
    chain.push(node);
    node = callAccessor((node as HostNodeSource).getScrollResponder);
  }

  return chain;
}

/**
 * Resolve a ref value to the host node a native observer can take.
 *
 * @param instance - Whatever a ref currently holds: a composite component
 * instance, a host node, or `null`.
 * @returns The host node, or `null` when there is nothing to observe.
 *
 * @remarks
 * `ScrollView`, `FlatList` and `SectionList` refs hold composite instances, and
 * both `observe()` and `root` want the underlying host view. Only `ScrollView`
 * exposes `getNativeScrollRef` directly, so the `getScrollResponder` chain is
 * followed first — that is the one route a `SectionList` has to its host view,
 * and it is the same walk `./measure` uses to find the measurement reference.
 *
 * `getScrollableNode` is consulted last and only when it yields an object: on
 * the old architecture it returns a numeric `findNodeHandle` tag, and a number
 * is not a node. Handing one to the platform observer as `root` either makes
 * the constructor throw or silently roots the observation at the whole screen,
 * which is a different measurement — so a numeric tag is skipped and the
 * instance itself is returned, leaving the observer to refuse it (caught at
 * construction) or be downgraded on the first silent scroll event.
 *
 * The accessors are duck-typed rather than imported, so no React Native symbol
 * is referenced at runtime. The result is always a non-null object or `null`.
 */
export function resolveHostNode(instance: unknown): unknown {
  if (!isHostCandidate(instance)) {
    return null;
  }

  const chain = scrollHostChain(instance);

  for (const node of chain) {
    const host = callAccessor((node as HostNodeSource).getNativeScrollRef);
    if (isHostCandidate(host)) {
      return host;
    }
  }

  for (const node of chain) {
    const scrollable = callAccessor((node as HostNodeSource).getScrollableNode);
    if (isHostCandidate(scrollable)) {
      return scrollable;
    }
  }

  return instance;
}
