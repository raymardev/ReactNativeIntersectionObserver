/**
 * `strategy: 'auto' | 'native'` — the adapter onto the platform observer.
 *
 * No device is needed: the jest environment has no `IntersectionObserver`, so
 * auto-detection is correctly `false` here and the native path is only ever
 * reached by injecting {@link FakeIntersectionObserver} through
 * `setNativeIntersectionObserverOverride`. That injection is also what proves
 * the default (`'scroll'`) cannot regress: with a perfectly good constructor
 * installed, a hook that does not ask for it never builds one.
 *
 * The centrepiece is the shared contract matrix, where the same expectations run
 * against both drivers — one dispatching scroll events, the other emitting
 * native entries — so the adapter is held to the published state machine rather
 * than to a description of itself.
 */

import { act, renderHook } from '@testing-library/react-native';
import { StrictMode } from 'react';
import type { RefObject } from 'react';
import type { View } from 'react-native';

import { useElementIntersection, useIntersectionObserver } from '../index';
import { setNativeIntersectionObserverOverride } from '../native';
import type { NativeIOEntry } from '../native';
import type { IntersectionPosition } from '../types';
import type {
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn,
} from '../types';

import { FakeIntersectionObserver } from './support/fakeIntersectionObserver';
import { layoutEvent, scrollEvent } from './support/events';
import type { LayoutEventInit, ScrollEventInit } from './support/events';

type Result = { current: UseIntersectionObserverReturn };

/** The success callback React Native hands to a `measureLayout` caller. */
type Success = (x: number, y: number, width: number, height: number) => void;

const HOST_NODE = { id: 'scroll-host' };

function observe(options: UseIntersectionObserverOptions) {
  return renderHook(
    (props: UseIntersectionObserverOptions) => useIntersectionObserver(props),
    { initialProps: options }
  );
}

function fireScroll(result: Result, init: ScrollEventInit = {}): void {
  act(() => {
    result.current.handleScroll(scrollEvent(init));
  });
}

function fireLayout(result: Result, init: LayoutEventInit): void {
  act(() => {
    result.current.handleElementLayout(layoutEvent(init));
  });
}

/**
 * A tracked view.
 *
 * Its `measureLayout` declines immediately, which is what a view that is not a
 * descendant of the reference reports — so whenever these tests fall back to the
 * scroll path they fall back all the way to the `onLayout` rectangle, and the
 * measured path is exercised by `elementMeasurement.test.ts` instead.
 */
function trackedView(): RefObject<View | null> {
  return {
    current: {
      measureLayout: (
        _reference: unknown,
        _onSuccess: unknown,
        onFail?: () => void
      ) => {
        onFail?.();
      },
    },
  } as unknown as RefObject<View | null>;
}

/** A scroll component instance whose host node is {@link HOST_NODE}. */
function scrollInstance() {
  return { getNativeScrollRef: () => HOST_NODE };
}

function attachScrollRef(result: Result, instance: unknown): void {
  (result.current.ref as { current: unknown }).current = instance;
}

function spies() {
  const order: string[] = [];
  return {
    order,
    onIntersect: jest.fn(() => {
      order.push('onIntersect');
    }),
    onVisible: jest.fn(() => {
      order.push('onVisible');
    }),
    onIntersectionChange: jest.fn((value: boolean) => {
      order.push(`onIntersectionChange(${String(value)})`);
    }),
  };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  FakeIntersectionObserver.reset();
  setNativeIntersectionObserverOverride(FakeIntersectionObserver);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  // Mandatory: this also clears the detection memo.
  setNativeIntersectionObserverOverride(null);
  warnSpy.mockRestore();
});

describe('strategy selection', () => {
  it('builds an observer by default when the platform provides one', () => {
    // The default is 'auto', so a runtime that has a usable observer gets it
    // without the caller opting in.
    const element = trackedView();
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.last?.targets).toEqual([element.current]);
    // 'auto' never explains itself; only 'native' reports a fallback.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to the scroll path by default when there is no platform one', () => {
    // The case that covers every stable React Native and Expo runtime today:
    // the default must be indistinguishable from 'scroll' there.
    setNativeIntersectionObserverOverride(false);

    const element = trackedView();
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("pins the scroll path when asked for it explicitly", () => {
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'scroll',
    });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("builds one for strategy 'auto' once both refs are attached", () => {
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
    });

    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.last?.targets).toEqual([element.current]);
  });

  it.each<IntersectionPosition>(['top', 'bottom', 'center', 'custom'])(
    "falls back silently for position '%s' under 'auto'",
    position => {
      const element = trackedView();
      const { result } = observe({
        position,
        element,
        strategy: 'auto',
        customPredicate: () => false,
      });

      attachScrollRef(result, scrollInstance());
      fireScroll(result, { y: 0 });

      expect(FakeIntersectionObserver.instances).toHaveLength(0);
      expect(warnSpy).not.toHaveBeenCalled();
    }
  );

  it.each<IntersectionPosition>(['top', 'bottom', 'center', 'custom'])(
    "warns exactly once for position '%s' under 'native'",
    position => {
      const element = trackedView();
      observe({
        position,
        element,
        strategy: 'native',
        customPredicate: () => false,
      });

      expect(FakeIntersectionObserver.instances).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain(
        "only applies to position: 'element'"
      );
    }
  );

  it('warns once, and uses the scroll path, when the platform has no observer', () => {
    setNativeIntersectionObserverOverride(false);

    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'native',
    });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'no usable IntersectionObserver'
    );
  });

  it('falls back to the scroll path when the scroll ref is never attached', () => {
    // A null root would mean "the whole screen" to the platform observer, which
    // is a different measurement — so it is refused rather than substituted.
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'native',
    });

    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(result.current.isIntersecting).toBe(true);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'attached to their refs'
    );
  });

  it("falls back when 'auto' is set but no element ref is supplied", () => {
    // position 'element' without a ref is legal — the geometry then comes from
    // handleElementLayout — and there is nothing for a platform observer to
    // observe, so it must not try.
    const { result } = observe({ position: 'element', strategy: 'auto' });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(result.current.isIntersecting).toBe(true);
  });

  it('threads the strategy through useElementIntersection', () => {
    const element = trackedView();
    const { result } = renderHook(() =>
      useElementIntersection(element, 100, undefined, { strategy: 'auto' })
    );

    attachScrollRef(result as Result, scrollInstance());
    fireScroll(result as Result, { y: 0 });

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.last?.options?.rootMargin).toBe(
      '100px 1000000px 100px 1000000px'
    );
  });

  it('keeps the documented return shape on the native path', () => {
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
    });

    expect(Object.keys(result.current).sort()).toEqual([
      'handleElementLayout',
      'handleScroll',
      'isIntersecting',
      'measureElement',
      'ref',
      'reset',
    ]);
  });
});

describe('observer construction', () => {
  function build(options: UseIntersectionObserverOptions) {
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...options,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });
    return { element, result };
  }

  it('roots the observer at the scroll host and observes the tracked view', () => {
    const { element } = build({});

    expect(FakeIntersectionObserver.last?.options?.root).toBe(HOST_NODE);
    expect(FakeIntersectionObserver.last?.targets).toEqual([element.current]);
  });

  it('asks for a ratio of 0, because any overlap counts', () => {
    build({});
    expect(FakeIntersectionObserver.last?.options?.threshold).toBe(0);
  });

  it('maps the threshold onto the active axis and frees the other one', () => {
    build({ threshold: 50 });
    expect(FakeIntersectionObserver.last?.options?.rootMargin).toBe(
      '50px 1000000px 50px 1000000px'
    );

    FakeIntersectionObserver.reset();
    build({ threshold: 50, horizontal: true });
    expect(FakeIntersectionObserver.last?.options?.rootMargin).toBe(
      '1000000px 50px 1000000px 50px'
    );
  });

  it('maps a negative threshold, and a non-finite one', () => {
    build({ threshold: -30 });
    expect(FakeIntersectionObserver.last?.options?.rootMargin).toBe(
      '-30px 1000000px -30px 1000000px'
    );

    FakeIntersectionObserver.reset();
    build({ threshold: Number.NaN });
    expect(FakeIntersectionObserver.last?.options?.rootMargin).toBe(
      '20px 1000000px 20px 1000000px'
    );
  });

  it('resolves the tracked view and the scroll view through their host accessors', () => {
    const targetHost = { id: 'target-host' };
    const element = {
      current: { getNativeScrollRef: () => targetHost },
    } as unknown as RefObject<View | null>;
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
    });

    attachScrollRef(result, { getScrollableNode: () => HOST_NODE });
    fireScroll(result, { y: 0 });

    expect(FakeIntersectionObserver.last?.targets).toEqual([targetHost]);
    expect(FakeIntersectionObserver.last?.options?.root).toBe(HOST_NODE);
  });
});

describe('the published contract, driven from both sources', () => {
  interface Driver {
    /** Render an observer and return a way to push a decision into it. */
    start(options: UseIntersectionObserverOptions): {
      result: Result;
      drive: (value: boolean | null) => void;
      unmount: () => void;
    };
  }

  const scrollDriver: Driver = {
    start(options) {
      const { result, unmount } = observe({ position: 'element', ...options });
      fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
      return {
        result,
        drive(value) {
          if (value === null) {
            // A zero-sized measurement: nothing has been laid out, so there is
            // no decision to make.
            fireScroll(result, { y: 300, contentH: 0 });
            return;
          }
          fireScroll(result, { y: value ? 300 : 1121 });
        },
        unmount,
      };
    },
  };

  const nativeDriver: Driver = {
    start(options) {
      const element = trackedView();
      const { result, unmount } = observe({
        position: 'element',
        element,
        strategy: 'auto',
        ...options,
      });
      attachScrollRef(result, scrollInstance());
      fireScroll(result, { y: 0 });
      return {
        result,
        drive(value) {
          act(() => {
            const observer = FakeIntersectionObserver.last;
            if (value === null) {
              // An unmeasured root: the native parity of a scroll event whose
              // measurements are still zero-sized, and the only case the
              // platform reports that is genuinely "no decision".
              observer?.emit({ rootBounds: null });
              return;
            }
            observer?.emit({ isIntersecting: value });
          });
        },
        unmount,
      };
    },
  };

  describe.each<[string, Driver]>([
    ['scroll', scrollDriver],
    ['native', nativeDriver],
  ])('%s path', (_name, driver) => {
    it('fires onIntersect exactly once on the false -> true edge', () => {
      const s = spies();
      const { result, drive } = driver.start(s);

      drive(true);

      expect(result.current.isIntersecting).toBe(true);
      expect(s.onIntersect).toHaveBeenCalledTimes(1);
    });

    it('fires nothing at all for a repeated true', () => {
      const s = spies();
      const { drive } = driver.start(s);

      drive(true);
      drive(true);
      drive(true);

      expect(s.onIntersect).toHaveBeenCalledTimes(1);
      expect(s.onVisible).not.toHaveBeenCalled();
      expect(s.onIntersectionChange).toHaveBeenCalledTimes(1);
    });

    it('fires onVisible on the true -> false edge', () => {
      const s = spies();
      const { result, drive } = driver.start(s);

      drive(true);
      drive(false);

      expect(result.current.isIntersecting).toBe(false);
      expect(s.onVisible).toHaveBeenCalledTimes(1);
      expect(s.onIntersectionChange.mock.calls).toEqual([[true], [false]]);
    });

    it('runs onIntersectionChange after onIntersect and onVisible', () => {
      const s = spies();
      const { drive } = driver.start(s);

      drive(true);
      drive(false);

      expect(s.order).toEqual([
        'onIntersect',
        'onIntersectionChange(true)',
        'onVisible',
        'onIntersectionChange(false)',
      ]);
    });

    it('leaves everything untouched for a no-decision input', () => {
      const s = spies();
      const { result, drive } = driver.start(s);

      drive(null);

      expect(result.current.isIntersecting).toBe(false);
      expect(s.onIntersect).not.toHaveBeenCalled();
      expect(s.onIntersectionChange).not.toHaveBeenCalled();
    });

    it('survives being driven after unmount', () => {
      const s = spies();
      const { drive, unmount } = driver.start(s);

      unmount();

      expect(() => {
        drive(true);
      }).not.toThrow();
    });

    it('re-arms onIntersect after reset()', () => {
      const s = spies();
      const { result, drive } = driver.start(s);

      drive(true);
      act(() => {
        result.current.reset();
      });
      expect(result.current.isIntersecting).toBe(false);

      drive(true);
      expect(result.current.isIntersecting).toBe(true);
      expect(s.onIntersect).toHaveBeenCalledTimes(2);
    });
  });
});

describe('native lifecycle', () => {
  function mounted(options: UseIntersectionObserverOptions = {}) {
    const element = trackedView();
    const rendered = renderHook(
      (props: UseIntersectionObserverOptions) => useIntersectionObserver(props),
      {
        initialProps: {
          position: 'element' as IntersectionPosition,
          element,
          strategy: 'auto' as const,
          ...options,
        },
      }
    );
    attachScrollRef(rendered.result as Result, scrollInstance());
    fireScroll(rendered.result as Result, { y: 0 });
    return { ...rendered, element };
  }

  it('rebuilds the observer when the threshold changes, disconnecting the old one', () => {
    const { rerender, element } = mounted({ threshold: 20 });
    const first = FakeIntersectionObserver.last;

    rerender({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 80,
    });

    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(first?.disconnectCalls).toBe(1);
    expect(FakeIntersectionObserver.last?.options?.rootMargin).toBe(
      '80px 1000000px 80px 1000000px'
    );
  });

  it('rebuilds against a tracked view that was swapped without a re-render', () => {
    const { result, element } = mounted();
    const replacement = { id: 'new-target' };

    (element as { current: unknown }).current = replacement;
    fireLayout(result as Result, { x: 0, y: 20, width: 300, height: 100 });

    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(FakeIntersectionObserver.last?.targets).toEqual([replacement]);
  });

  it('does not rebuild while the refs are unchanged', () => {
    const { result } = mounted();

    fireScroll(result as Result, { y: 10 });
    fireScroll(result as Result, { y: 20 });
    fireLayout(result as Result, { x: 0, y: 20, width: 300, height: 100 });

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it('disconnects on unmount, and ignores an entry delivered anyway', () => {
    const s = spies();
    const { unmount } = mounted(s);
    const observer = FakeIntersectionObserver.last;

    unmount();
    expect(observer?.disconnectCalls).toBe(1);

    act(() => {
      observer?.emit({ isIntersecting: true });
    });
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('re-observes on reset() so a still-visible element is reported again', () => {
    const { result } = mounted();
    const observer = FakeIntersectionObserver.last;

    act(() => {
      observer?.emit({ isIntersecting: true });
    });
    act(() => {
      (result as Result).current.reset();
    });

    expect(observer?.unobserveCalls).toBe(1);
    expect(observer?.observeCalls).toBe(2);
  });

  it('leaves exactly one live observer under StrictMode', () => {
    const s = spies();
    const element = trackedView();
    const { result } = renderHook(
      () =>
        useIntersectionObserver({
          position: 'element',
          element,
          strategy: 'auto',
          ...s,
        }),
      { wrapper: StrictMode }
    );

    attachScrollRef(result as Result, scrollInstance());
    fireScroll(result as Result, { y: 0 });

    const live = FakeIntersectionObserver.instances.filter(o => o.connected);
    expect(live).toHaveLength(1);
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('ignores a delivery that is not a list of entries', () => {
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    expect(() => {
      act(() => {
        FakeIntersectionObserver.last?.deliver(
          undefined as unknown as NativeIOEntry[]
        );
      });
    }).not.toThrow();
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('survives an entry that throws while being read', () => {
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    const observer = FakeIntersectionObserver.last;
    const hostile = {
      target: observer?.targets[0],
      isIntersecting: true,
      intersectionRatio: 1,
      get boundingClientRect(): null {
        throw new Error('host object is gone');
      },
      rootBounds: { width: 400, height: 800 },
    } as unknown as NativeIOEntry;

    expect(() => {
      act(() => {
        observer?.deliver([hostile]);
      });
    }).not.toThrow();
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('ignores entries for a target it is not tracking', () => {
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    act(() => {
      FakeIntersectionObserver.last?.emit({
        target: { id: 'someone else' },
        isIntersecting: true,
      });
    });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('uses only the last entry of a batch, as the scroll path skips states', () => {
    // The batch has to disagree with itself end to end, or 'last' and 'first'
    // are the same reading: several frames coalescing into one dispatch is
    // exactly the shape a real batch has.
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    act(() => {
      FakeIntersectionObserver.last?.emitBatch([
        { isIntersecting: false },
        { isIntersecting: true },
      ]);
    });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onVisible).not.toHaveBeenCalled();
  });

  it('uses the last entry when the batch ends with the view hidden, too', () => {
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    act(() => {
      FakeIntersectionObserver.last?.emitBatch([
        { isIntersecting: true },
        { isIntersecting: false },
      ]);
    });

    // The platform has already superseded the `true`, so replaying it would
    // report a state that never reached the screen.
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();
  });

  it('reports the tracked view leaving the tree, rather than latching', () => {
    // `boundingClientRect: null` is the entry's own way of saying "the target is
    // not rendered". The scroll path calls that `false`; so does this one.
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    const observer = FakeIntersectionObserver.last;
    act(() => {
      observer?.emit({ isIntersecting: true });
    });
    expect(result.current.isIntersecting).toBe(true);

    act(() => {
      observer?.emit({ isIntersecting: false, boundingClientRect: null });
    });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reports a collapsed tracked view as hidden, on the active axis', () => {
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    const observer = FakeIntersectionObserver.last;
    act(() => {
      observer?.emit({ isIntersecting: true });
    });

    act(() => {
      observer?.emit({
        isIntersecting: false,
        boundingClientRect: { x: 0, y: 0, width: 300, height: 0 },
      });
    });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
  });

  it('ignores the observer when it contradicts a layout event', () => {
    // `handleElementLayout` re-evaluates on every layout event, and the scroll
    // path's geometry there is the parent-relative rectangle — which the
    // platform observer has already been asked about. Whoever owns the decision
    // owns all of it.
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    act(() => {
      FakeIntersectionObserver.last?.emit({ isIntersecting: false });
    });

    // y=200 with the standard 800dp viewport: the scroll path would call this
    // visible, and the observer has just said it is not.
    fireLayout(result, { x: 0, y: 200, width: 300, height: 100 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('ignores the observer when an option change contradicts it', () => {
    const s = spies();
    const element = trackedView();
    const { result, rerender } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 20,
      ...s,
    });
    attachScrollRef(result, scrollInstance());
    fireScroll(result, { y: 0 });

    act(() => {
      FakeIntersectionObserver.last?.emit({ isIntersecting: false });
    });
    fireLayout(result, { x: 0, y: 200, width: 300, height: 100 });

    // Changing the threshold re-runs the option effect, which re-evaluates —
    // and rebuilds the observer, which must not open a window for the scroll
    // path to answer in.
    rerender({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 400,
      ...s,
    });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('keeps the observer alive when a user callback throws', () => {
    // On the scroll path an exception propagates out of the consumer's own event
    // handler and the next event still works. Inside a native dispatch it can
    // kill every later delivery for that observer, so it is re-thrown
    // asynchronously instead: the observer survives and the error still reaches
    // the global handler.
    jest.useFakeTimers();
    try {
      const onIntersect = jest.fn(() => {
        throw new Error('consumer bug');
      });
      const onVisible = jest.fn();
      const element = trackedView();
      const { result } = observe({
        position: 'element',
        element,
        strategy: 'auto',
        onIntersect,
        onVisible,
      });
      attachScrollRef(result, scrollInstance());
      fireScroll(result, { y: 0 });

      const observer = FakeIntersectionObserver.last;
      expect(() => {
        act(() => {
          observer?.emit({ isIntersecting: true });
        });
      }).not.toThrow();

      act(() => {
        observer?.emit({ isIntersecting: false });
      });
      expect(onVisible).toHaveBeenCalledTimes(1);
      expect(result.current.isIntersecting).toBe(false);

      expect(() => {
        jest.runOnlyPendingTimers();
      }).toThrow('consumer bug');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('native fallbacks at runtime', () => {
  it('downgrades permanently when observe() throws', () => {
    class Refusing extends FakeIntersectionObserver {
      observe(): void {
        throw new Error('unsupported node');
      }
    }
    setNativeIntersectionObserverOverride(Refusing);

    const element = trackedView();
    const { result, rerender } = observe({
      position: 'element',
      element,
      strategy: 'auto',
    });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'refused the tracked view'
    );
    expect(FakeIntersectionObserver.last?.disconnectCalls).toBe(1);

    // ...and it stays down: a rebuild that would otherwise be triggered by an
    // option change does not try the platform observer again.
    const attempts = FakeIntersectionObserver.instances.length;
    rerender({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 80,
    });
    fireLayout(result, { x: 0, y: 900, width: 300, height: 100 });
    fireScroll(result, { y: 181 });
    expect(FakeIntersectionObserver.instances).toHaveLength(attempts);
  });

  it('downgrades when the observer accepts the view and then says nothing', () => {
    const s = spies();
    const element = trackedView();
    const { result, rerender } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });

    // First scroll: the observer owns the decision and has simply not spoken.
    fireScroll(result, { y: 180 });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();

    // Second: it has still said nothing, so the scroll path takes over. Because
    // the observer never reported, no transition can be manufactured by this.
    fireScroll(result, { y: 180 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange.mock.calls).toEqual([[true]]);
    expect(String(warnSpy.mock.calls[0][0])).toContain('reported nothing');

    // ...and it stays down, exactly as the refused-view downgrade does: the
    // warning promises the scroll path for the rest of this component's life,
    // and a rebuild would put the hook back inside the suppression window on
    // every option change.
    const attempts = FakeIntersectionObserver.instances.length;
    rerender({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 80,
      ...s,
    });
    fireScroll(result, { y: 181 });
    expect(FakeIntersectionObserver.instances).toHaveLength(attempts);
  });

  it('never downgrades once the observer has reported', () => {
    const s = spies();
    const element = trackedView();
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      ...s,
    });

    attachScrollRef(result, scrollInstance());
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    act(() => {
      FakeIntersectionObserver.last?.emit({ isIntersecting: false });
    });

    for (let i = 0; i < 5; i += 1) {
      fireScroll(result, { y: 180 + i });
    }

    // The scroll path would say true here; the observer owns the answer and has
    // said false, and a mid-flight handoff would manufacture an edge.
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.last?.connected).toBe(true);
  });

  it('hands the decision back when the position stops being element', () => {
    const element = trackedView();
    const { result, rerender } = renderHook(
      (props: UseIntersectionObserverOptions) => useIntersectionObserver(props),
      {
        initialProps: {
          position: 'element' as IntersectionPosition,
          element,
          strategy: 'auto' as const,
        },
      }
    );

    attachScrollRef(result as Result, scrollInstance());
    fireScroll(result as Result, { y: 0 });
    const observer = FakeIntersectionObserver.last;

    rerender({ position: 'bottom', element, strategy: 'auto' });
    fireScroll(result as Result, { y: 1190 });

    expect(observer?.disconnectCalls).toBe(1);
    expect((result as Result).current.isIntersecting).toBe(true);
  });

  it('stops measuring through measureLayout once the observer owns the state', () => {
    const measureLayout = jest.fn();
    const element = {
      current: { measureLayout },
    } as unknown as RefObject<View | null>;
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
    });

    attachScrollRef(result, {
      getNativeScrollRef: () => HOST_NODE,
      getInnerViewRef: () => ({ id: 'content' }),
    });
    // The refs attach after mount, so this event both starts a measurement and
    // triggers the rebuild that hands the geometry to the platform observer.
    fireScroll(result, { y: 0 });
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const measuredBefore = measureLayout.mock.calls.length;

    // The observer reports, so ownership is permanent from here on.
    act(() => {
      FakeIntersectionObserver.last?.emit({ isIntersecting: false });
    });

    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 100 });
    fireScroll(result, { y: 200, contentH: 3000 });

    expect(measureLayout).toHaveBeenCalledTimes(measuredBefore);
  });

  it('measures again once the decision comes back to the scroll path', () => {
    // The downgrade on its own is harmless; the danger is what it leaves behind.
    // `handleScroll` cannot measure while the platform observer owns the answer,
    // so if the scroll path inherits the decision with nothing measured it has to
    // be re-armed — otherwise it answers from the parent-relative onLayout
    // rectangle for the rest of the component's life, which is exactly the bug
    // measuring against the scroll container exists to fix.
    const s = spies();
    const pending: Success[] = [];
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      pending.push(onSuccess);
    });
    const element = {
      current: { measureLayout },
    } as unknown as RefObject<View | null>;
    const { result } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 0,
      ...s,
    });

    attachScrollRef(result, {
      getNativeScrollRef: () => HOST_NODE,
      getInnerViewRef: () => ({ id: 'content' }),
    });
    // onLayout says y=50 (relative to the card the view sits in); the tracked
    // view really sits at y=1000 in content space.
    fireLayout(result, { x: 0, y: 50, width: 300, height: 100 });
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    // The pass started by that layout is abandoned when the observer takes over,
    // so nothing has been measured when the downgrade happens.
    expect(measureLayout).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 0 });
    fireScroll(result, { y: 0 });
    expect(String(warnSpy.mock.calls[0][0])).toContain('reported nothing');

    // Re-armed: a fresh pass, and no answer from the onLayout rectangle in the
    // meantime.
    expect(measureLayout).toHaveBeenCalledTimes(2);
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();

    act(() => {
      pending[1](0, 1000, 300, 100);
    });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('measures again when a runtime strategy change hands the decision back', () => {
    const pending: Success[] = [];
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      pending.push(onSuccess);
    });
    const element = {
      current: { measureLayout },
    } as unknown as RefObject<View | null>;
    const { result, rerender } = observe({
      position: 'element',
      element,
      strategy: 'auto',
      threshold: 0,
    });

    attachScrollRef(result, {
      getNativeScrollRef: () => HOST_NODE,
      getInnerViewRef: () => ({ id: 'content' }),
    });
    fireLayout(result, { x: 0, y: 50, width: 300, height: 100 });
    act(() => {
      FakeIntersectionObserver.last?.emit({ isIntersecting: false });
    });
    fireScroll(result, { y: 0 });
    expect(measureLayout).toHaveBeenCalledTimes(1);

    rerender({
      position: 'element',
      element,
      strategy: 'scroll',
      threshold: 0,
    });

    expect(measureLayout).toHaveBeenCalledTimes(2);
    act(() => {
      pending[1](0, 1000, 300, 100);
    });

    expect(result.current.isIntersecting).toBe(false);
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);
  });
});
