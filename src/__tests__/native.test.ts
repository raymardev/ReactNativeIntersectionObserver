/**
 * Detection of, and mapping onto, the platform `IntersectionObserver`.
 *
 * The whole point of this file is that nothing is imported: the platform
 * observer is a global that only exists on some React Native builds, so every
 * case here installs (or withholds) a global and asserts what the probe makes of
 * it. The jest environment has neither `document` nor `IntersectionObserver`, so
 * "nothing installed" is the honest default and is asserted first.
 */

import { computeIntersection } from '../geometry';
import {
  CROSS_AXIS_MARGIN,
  buildRootMargin,
  entryToDecision,
  formatRootMarginLength,
  getNativeIntersectionObserver,
  isNativeIntersectionObserverAvailable,
  resolveHostNode,
  setNativeIntersectionObserverOverride,
} from '../native';
import type { NativeIOEntry } from '../native';

import { FakeIntersectionObserver } from './support/fakeIntersectionObserver';

const scope = globalThis as unknown as Record<string, unknown>;

/** Install globals for the duration of one case, then restore them exactly. */
function withGlobals(values: Record<string, unknown>, run: () => void): void {
  const had = new Map<string, boolean>();
  const previous = new Map<string, unknown>();
  for (const key of Object.keys(values)) {
    had.set(key, key in scope);
    previous.set(key, scope[key]);
    scope[key] = values[key];
  }
  // Clear the detection memo so this case probes the globals it just installed.
  setNativeIntersectionObserverOverride(null);
  try {
    run();
  } finally {
    for (const key of Object.keys(values)) {
      if (had.get(key)) {
        scope[key] = previous.get(key);
      } else {
        delete scope[key];
      }
    }
    setNativeIntersectionObserverOverride(null);
  }
}

afterEach(() => {
  setNativeIntersectionObserverOverride(null);
});

describe('detection', () => {
  it('reports nothing on a runtime with no IntersectionObserver at all', () => {
    // Plain node, jest, stable React Native and Expo all land here.
    expect(scope.IntersectionObserver).toBeUndefined();
    expect(isNativeIntersectionObserverAvailable()).toBe(false);
    expect(getNativeIntersectionObserver()).toBeNull();
  });

  it('accepts a well-formed global', () => {
    withGlobals({ IntersectionObserver: FakeIntersectionObserver }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(true);
      expect(getNativeIntersectionObserver()).toBe(FakeIntersectionObserver);
    });
  });

  it('refuses a DOM IntersectionObserver, however well formed', () => {
    // The single most important case: under jsdom, or with a userland polyfill,
    // a global exists but its observe() demands an Element and its root demands
    // an Element/Document — neither of which a React Native ref ever produces.
    withGlobals(
      {
        IntersectionObserver: FakeIntersectionObserver,
        document: { createElement: () => ({}) },
      },
      () => {
        expect(isNativeIntersectionObserverAvailable()).toBe(false);
      }
    );
  });

  it('ignores a document that is not a DOM document', () => {
    withGlobals(
      {
        IntersectionObserver: FakeIntersectionObserver,
        document: { title: 'not a dom' },
      },
      () => {
        expect(isNativeIntersectionObserverAvailable()).toBe(true);
      }
    );
  });

  it('refuses a constructor that throws', () => {
    class Exploding {
      constructor() {
        throw new Error('not really implemented');
      }
    }

    withGlobals({ IntersectionObserver: Exploding }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(false);
    });
  });

  it('refuses a half-implemented observer', () => {
    class Partial {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      // No takeRecords: a stub rather than an implementation.
    }

    withGlobals({ IntersectionObserver: Partial }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(false);
    });
  });

  it('refuses a global that is not a constructor', () => {
    withGlobals({ IntersectionObserver: { observe: () => undefined } }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(false);
    });
  });

  it('accepts an implementation whose methods are own properties', () => {
    // A C++-installed host object can expose its methods on the instance rather
    // than on a prototype, so the probe must not look at the prototype.
    function HostObjectObserver(this: Record<string, unknown>) {
      this.observe = () => undefined;
      this.unobserve = () => undefined;
      this.disconnect = () => undefined;
      this.takeRecords = () => [];
    }

    withGlobals({ IntersectionObserver: HostObjectObserver }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(true);
    });
  });

  it('honours the global kill switch', () => {
    withGlobals(
      {
        IntersectionObserver: FakeIntersectionObserver,
        __RNIO_DISABLE_NATIVE__: true,
      },
      () => {
        expect(isNativeIntersectionObserverAvailable()).toBe(false);
      }
    );
  });

  it('probes once and remembers the answer', () => {
    let constructions = 0;
    class Counting extends FakeIntersectionObserver {
      constructor(
        ...args: ConstructorParameters<typeof FakeIntersectionObserver>
      ) {
        super(...args);
        constructions += 1;
      }
    }

    withGlobals({ IntersectionObserver: Counting }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(true);
      expect(isNativeIntersectionObserverAvailable()).toBe(true);
      expect(isNativeIntersectionObserverAvailable()).toBe(true);
      expect(constructions).toBe(1);
    });
  });
});

describe('exotic runtimes', () => {
  it('reports nothing when the runtime has no global scope object', () => {
    // `globalThis` is ES2020, and the package supports React Native back to
    // 0.60, whose oldest JavaScriptCore builds predate it. The probe reads it
    // through `typeof`, so its absence is an answer rather than a ReferenceError.
    const globalObject = globalThis as unknown as Record<string, unknown>;
    setNativeIntersectionObserverOverride(null);

    // Nothing else may run while the binding is missing — jest's own matchers
    // reach for it — so the answer is captured first and asserted afterwards.
    let available = true;
    delete globalObject.globalThis;
    try {
      available = isNativeIntersectionObserverAvailable();
    } finally {
      globalObject.globalThis = globalObject;
    }
    setNativeIntersectionObserverOverride(null);

    expect(available).toBe(false);
  });
});

describe('overrides', () => {
  it('forces the native path on with an injected constructor', () => {
    setNativeIntersectionObserverOverride(FakeIntersectionObserver);
    expect(getNativeIntersectionObserver()).toBe(FakeIntersectionObserver);
  });

  it('forces the native path off, even with a usable global', () => {
    withGlobals({ IntersectionObserver: FakeIntersectionObserver }, () => {
      setNativeIntersectionObserverOverride(false);
      expect(isNativeIntersectionObserverAvailable()).toBe(false);
    });
  });

  it('restores auto-detection, and clears the memo, on null', () => {
    setNativeIntersectionObserverOverride(FakeIntersectionObserver);
    expect(isNativeIntersectionObserverAvailable()).toBe(true);

    setNativeIntersectionObserverOverride(null);
    expect(isNativeIntersectionObserverAvailable()).toBe(false);

    withGlobals({ IntersectionObserver: FakeIntersectionObserver }, () => {
      expect(isNativeIntersectionObserverAvailable()).toBe(true);
    });
  });
});

describe('rootMargin mapping', () => {
  it('expands the active axis by the threshold and the other one without bound', () => {
    expect(buildRootMargin(50, false)).toBe('50px 1000000px 50px 1000000px');
    expect(buildRootMargin(50, true)).toBe('1000000px 50px 1000000px 50px');
  });

  it('maps a negative threshold straight through, contracting the root', () => {
    expect(buildRootMargin(-30, false)).toBe('-30px 1000000px -30px 1000000px');
  });

  it('keeps fractional points intact', () => {
    expect(formatRootMarginLength(20.5)).toBe('20.5px');
  });

  it('never emits exponent notation', () => {
    const margin = buildRootMargin(1e30, false);
    expect(margin).not.toMatch(/e/i);
    expect(margin.startsWith(`${CROSS_AXIS_MARGIN}px`)).toBe(true);
  });

  it('treats a non-finite length as zero rather than emitting NaN', () => {
    expect(formatRootMarginLength(Number.NaN)).toBe('0px');
  });
});

describe('entryToDecision', () => {
  const entry = (overrides: Partial<NativeIOEntry>): NativeIOEntry => ({
    target: {},
    isIntersecting: true,
    intersectionRatio: 1,
    boundingClientRect: { x: 0, y: 0, width: 300, height: 100 },
    rootBounds: { width: 400, height: 800 },
    ...overrides,
  });

  it('reads the decision from isIntersecting, not from the ratio', () => {
    // "Any overlap counts" is the published contract, and the specification's
    // isIntersecting is exactly that.
    expect(
      entryToDecision(entry({ isIntersecting: true, intersectionRatio: 0 }))
    ).toBe(true);
    expect(
      entryToDecision(entry({ isIntersecting: false, intersectionRatio: 1 }))
    ).toBe(false);
  });

  it('coerces a non-boolean isIntersecting rather than trusting it', () => {
    expect(
      entryToDecision(entry({ isIntersecting: 1 as unknown as boolean }))
    ).toBe(false);
  });

  it('reports a target with no rectangle as not intersecting', () => {
    // The entry's own contract for that field is "null when the target is not
    // rendered", which is a decision — the same one the scroll path makes for a
    // view that has stopped being rendered. Answering `null` here would latch an
    // observer that is already `true` for the rest of the component's life.
    expect(entryToDecision(entry({ boundingClientRect: null }))).toBe(false);
  });

  it('reports a fully collapsed target as not intersecting', () => {
    expect(
      entryToDecision(
        entry({ boundingClientRect: { x: 0, y: 0, width: 0, height: 0 } })
      )
    ).toBe(false);
  });

  it('projects the collapse onto the active axis, exactly as the scroll path does', () => {
    // Zero height at full width is the normal React Native collapse shape, and
    // says nothing at all about a horizontal observer.
    const flat = entry({
      boundingClientRect: { x: 0, y: 0, width: 300, height: 0 },
    });
    expect(entryToDecision(flat)).toBe(false);
    expect(entryToDecision(flat, true)).toBe(true);

    const thin = entry({
      boundingClientRect: { x: 0, y: 0, width: 0, height: 100 },
    });
    expect(entryToDecision(thin)).toBe(true);
    expect(entryToDecision(thin, true)).toBe(false);
  });

  it('agrees with computeIntersection on the same collapse', () => {
    // The two decision paths have to be interchangeable: a component that swaps
    // strategy at runtime must not swap answers with it.
    const collapsed = { x: 0, y: 1000, width: 0, height: 0 };
    expect(
      computeIntersection(
        {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 400, height: 800 },
          contentSize: { width: 400, height: 2000 },
          contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
        },
        { position: 'element', threshold: 0 },
        collapsed
      )
    ).toBe(false);
    expect(
      entryToDecision(
        entry({
          isIntersecting: false,
          boundingClientRect: { x: 0, y: 0, width: 0, height: 0 },
        })
      )
    ).toBe(false);
  });

  it('makes no decision for an unmeasured root', () => {
    // The parity of the scroll path's `viewport <= 0` measurement guard, and the
    // only "nothing has been measured yet" case the platform reports.
    expect(entryToDecision(entry({ rootBounds: null }))).toBeNull();
    expect(
      entryToDecision(entry({ rootBounds: { width: 0, height: 800 } }))
    ).toBeNull();
    expect(
      entryToDecision(entry({ rootBounds: { width: 400, height: 0 } }))
    ).toBeNull();
    // Even for a target that is not rendered: with no root there is no geometry
    // to be right about.
    expect(
      entryToDecision(entry({ rootBounds: null, boundingClientRect: null }))
    ).toBeNull();
  });

  it('makes no decision from garbage in the rectangle fields', () => {
    // Non-finite is unusable rather than empty, which is exactly how
    // readMeasuredRect treats the same numbers on the scroll path.
    expect(
      entryToDecision(
        entry({
          boundingClientRect: {
            x: 0,
            y: 0,
            width: Number.NaN,
            height: Number.NaN,
          },
        })
      )
    ).toBeNull();
  });
});

describe('resolveHostNode', () => {
  it('prefers the native scroll ref of a ScrollView instance', () => {
    const host = { id: 'host' };
    expect(
      resolveHostNode({
        getNativeScrollRef: () => host,
        getScrollableNode: () => ({ id: 'other' }),
      })
    ).toBe(host);
  });

  it('falls back to the scrollable node', () => {
    const node = { id: 'node' };
    expect(
      resolveHostNode({
        getNativeScrollRef: () => null,
        getScrollableNode: () => node,
      })
    ).toBe(node);
  });

  it('returns a plain host instance unchanged', () => {
    const instance = { id: 'plain' };
    expect(resolveHostNode(instance)).toBe(instance);
  });

  it('follows the scroll responder chain, which is all a SectionList has', () => {
    // SectionList exposes getScrollResponder and getScrollableNode only: the
    // host view is reachable through the underlying ScrollView, and nowhere else.
    const host = { id: 'section-list-host' };
    const scrollView = { getNativeScrollRef: () => host };
    const virtualizedList = {
      getScrollResponder: () => scrollView,
      getScrollableNode: () => 4711,
    };
    const sectionList = {
      getScrollResponder: () => virtualizedList,
      getScrollableNode: () => 4711,
    };

    expect(resolveHostNode(sectionList)).toBe(host);
  });

  it('never hands back a numeric node handle', () => {
    // getScrollableNode returns findNodeHandle(...), a number — which the New
    // Architecture refuses, and which as a `root` would silently mean "the whole
    // screen" instead of "this list". The instance is returned instead, so the
    // observer refuses it and the scroll path takes over.
    const instance = { getScrollableNode: () => 4711 };
    expect(resolveHostNode(instance)).toBe(instance);

    const nulled = {
      getNativeScrollRef: () => 4711,
      getScrollableNode: () => null,
    };
    expect(resolveHostNode(nulled)).toBe(nulled);
  });

  it('stops walking a self-referential responder chain', () => {
    const looping: Record<string, unknown> = {};
    looping.getScrollResponder = () => looping;
    expect(resolveHostNode(looping)).toBe(looping);
  });

  it('survives an accessor that throws while the view is unmounting', () => {
    const instance = {
      getNativeScrollRef: () => {
        throw new Error('view is gone');
      },
    };
    expect(resolveHostNode(instance)).toBe(instance);
  });

  it('returns null for an unattached ref, or for anything that is not a node', () => {
    expect(resolveHostNode(null)).toBeNull();
    expect(resolveHostNode(undefined)).toBeNull();
    expect(resolveHostNode(4711)).toBeNull();
  });
});
