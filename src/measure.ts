/**
 * Resolution helpers for measuring a tracked view against its scroll container.
 *
 * `onLayout` reports a rectangle in the element's **parent's** coordinate space,
 * while `contentOffset` lives in the scroll view's content space; the two only
 * coincide when the tracked view is a direct child of the scroll content.
 * `measureLayout(reference, ...)` closes that gap: it resolves both tags in the
 * shadow tree, so the rectangle it returns is content-relative and — crucially —
 * scroll-invariant, which is why it can be measured on layout changes only and
 * never on the scroll hot path.
 *
 * Everything here is duck-typed. Nothing in this module imports `react` or
 * `react-native`: the accessors travel on the ref values themselves, so no
 * React Native symbol is referenced at runtime and `findNodeHandle` is not
 * needed (it is discouraged on the New Architecture, where a numeric handle
 * makes `measureLayout` log an error and call neither callback).
 */

/** The success callback `measureLayout` invokes, in dp. */
export type MeasureSuccess = (
  x: number,
  y: number,
  width: number,
  height: number
) => void;

/** The measurement surface a host component ref exposes. */
export interface Measurable {
  /**
   * Measure this view's rectangle relative to `reference`.
   *
   * @param reference - A ref/instance of an ancestor host view. Never a numeric
   * node handle: Fabric rejects those and calls neither callback.
   * @param onSuccess - Receives `x`, `y`, `width`, `height` in dp.
   * @param onFail - Invoked when either view is gone or they are unrelated.
   */
  measureLayout(
    reference: unknown,
    onSuccess: MeasureSuccess,
    onFail?: () => void
  ): void;
}

/** The accessors a `ScrollView`/`FlatList`/`SectionList` instance exposes. */
interface ScrollHost {
  /** `ScrollView`: a ref to the content container host view. */
  getInnerViewRef?: () => unknown;
  /** `ScrollView`: a ref to the outer scroll host view. */
  getNativeScrollRef?: () => unknown;
  /** `FlatList`/`SectionList`: the underlying `ScrollView` instance. */
  getScrollResponder?: () => unknown;
}

/** How far the `getScrollResponder` chain is followed before giving up. */
const MAX_SCROLL_HOST_DEPTH = 4;

/** Whether a value is a non-null object, the only thing worth duck-typing. */
function isObject(value: unknown): value is object {
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
    // A ref that is mid-unmount can throw from its own accessors; that is a
    // "cannot measure right now", not an error worth surfacing.
    return null;
  }
}

/**
 * Whether a ref value can be measured.
 *
 * @param value - Whatever the tracked element's ref currently holds.
 * @returns `true` when it exposes a callable `measureLayout`.
 *
 * @remarks
 * A class component instance or a wrapper that does not forward its ref to a
 * host view fails this check, which is a permanent condition rather than a
 * transient one.
 */
export function isMeasurable(value: unknown): value is Measurable {
  return (
    isObject(value) && typeof (value as Measurable).measureLayout === 'function'
  );
}

/**
 * Walk a scroll component instance and its scroll responder, deduped.
 *
 * @param instance - The value held by the hook's scroll ref.
 * @returns The instance followed by each distinct responder, nearest first.
 */
function scrollHostChain(instance: unknown): object[] {
  const chain: object[] = [];
  const seen = new Set<unknown>();
  let node: unknown = instance;

  while (
    isObject(node) &&
    !seen.has(node) &&
    chain.length < MAX_SCROLL_HOST_DEPTH
  ) {
    seen.add(node);
    chain.push(node);
    node = callAccessor((node as ScrollHost).getScrollResponder);
  }

  return chain;
}

/**
 * Resolve the view a tracked element should be measured against.
 *
 * @param instance - The value held by the hook's scroll ref: a `ScrollView`,
 * `FlatList` or `SectionList` instance, or `null` when the ref is unattached.
 * @returns The reference view, or `null` when measurement is impossible and the
 * `onLayout` rectangle has to be used instead.
 *
 * @remarks
 * The content container (`getInnerViewRef`) is preferred because it is
 * unambiguously the origin of content space; the outer scroll host
 * (`getNativeScrollRef`) is the fallback and differs only by any border or
 * padding on the scroll view itself. Both live in the shadow tree, so both
 * yield scroll-invariant coordinates.
 *
 * `getScrollableNode`/`getInnerViewNode` are deliberately never used: they
 * return numeric node handles, which the New Architecture refuses.
 *
 * @example
 * ```ts
 * resolveMeasurementReference(scrollViewInstance); // the content container ref
 * resolveMeasurementReference(null); // null — fall back to onLayout
 * ```
 */
export function resolveMeasurementReference(instance: unknown): object | null {
  const chain = scrollHostChain(instance);

  for (const node of chain) {
    const inner = callAccessor((node as ScrollHost).getInnerViewRef);
    if (isObject(inner)) {
      return inner;
    }
  }

  for (const node of chain) {
    const outer = callAccessor((node as ScrollHost).getNativeScrollRef);
    if (isObject(outer)) {
      return outer;
    }
  }

  return null;
}
