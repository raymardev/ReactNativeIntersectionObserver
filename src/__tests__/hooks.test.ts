/**
 * Behavioural tests for `useIntersectionObserver`, the hook every other one in
 * the package delegates to.
 *
 * Everything here renders the real hook with `@testing-library/react-native`'s
 * `renderHook` and drives it with the synthetic scroll payloads React Native
 * itself delivers (see `./support/events`). Nothing is stubbed, nothing depends
 * on timers, and no assertion is guarded by a conditional — a missing or broken
 * implementation fails the suite rather than skipping it.
 */

import { act, renderHook } from '@testing-library/react-native';
import { createRef } from 'react';
import type { View } from 'react-native';

import * as library from '../index';
import { useIntersectionObserver } from '../index';
import type {
  IntersectionMetrics,
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn,
} from '../types';

import {
  CENTERED_OFFSET,
  MAX_OFFSET,
  layoutEvent,
  scrollEvent,
} from './support/events';
import type { LayoutEventInit, ScrollEventInit } from './support/events';

type Observer = UseIntersectionObserverReturn;
type Result = { current: Observer };

/** Render the hook with an options bag that can be swapped by `rerender`. */
function observe(options: UseIntersectionObserverOptions = {}) {
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

/** The three transition callbacks, spied, plus a shared ordering log. */
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

describe('public API surface', () => {
  it('exports every documented hook as a callable function', () => {
    // The one assertion that would have caught the package shipping with no
    // implementation at all. It imports the real entry point; it does not read
    // the source as text and it has no fallback branch.
    expect(typeof library.useIntersectionObserver).toBe('function');
    expect(typeof library.useScrollToBottom).toBe('function');
    expect(typeof library.useScrollToTop).toBe('function');
    expect(typeof library.useScrollToCenter).toBe('function');
    expect(typeof library.useElementIntersection).toBe('function');
  });

  it('re-exports the geometry helpers and the documented defaults', () => {
    expect(typeof library.computeIntersection).toBe('function');
    expect(typeof library.readScrollMetrics).toBe('function');
    expect(typeof library.readElementLayout).toBe('function');
    expect(typeof library.projectMetrics).toBe('function');
    expect(typeof library.normalizeThreshold).toBe('function');
    expect(typeof library.toFiniteNumber).toBe('function');
    expect(library.DEFAULT_THRESHOLD).toBe(20);
    expect(library.DEFAULT_POSITION).toBe('bottom');
  });

  it('re-exports the measurement and platform-detection helpers', () => {
    expect(library.readMeasuredRect(0, 920, 300, 100)).toEqual({
      x: 0,
      y: 920,
      width: 300,
      height: 100,
    });

    // No platform IntersectionObserver exists under jest, which is what makes
    // the default strategy the only one these suites exercise implicitly.
    expect(library.isNativeIntersectionObserverAvailable()).toBe(false);
    expect(() =>
      library.setNativeIntersectionObserverOverride(null)
    ).not.toThrow();
  });

  it('returns exactly the documented shape, with nothing extra', () => {
    const { result } = observe();

    expect(Object.keys(result.current).sort()).toEqual([
      'handleElementLayout',
      'handleScroll',
      'isIntersecting',
      'measureElement',
      'ref',
      'reset',
    ]);
    expect(typeof result.current.isIntersecting).toBe('boolean');
    expect(result.current.ref).toHaveProperty('current', null);
    expect(typeof result.current.handleScroll).toBe('function');
    expect(typeof result.current.handleElementLayout).toBe('function');
    expect(typeof result.current.measureElement).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });
});

describe('mount', () => {
  it('starts false and fires nothing before any event arrives', () => {
    const s = spies();
    const { result } = observe({ position: 'top', ...s });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();
  });

  it('renders once, without an effect-driven second pass', () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useIntersectionObserver({ position: 'bottom' });
    });

    expect(renders).toBe(1);
  });
});

describe("position 'bottom' (the default)", () => {
  it('accepts no arguments at all and still defaults to bottom / 20', () => {
    const { result } = renderHook(() => useIntersectionObserver());

    expect(result.current.isIntersecting).toBe(false);
    act(() => {
      result.current.handleScroll(scrollEvent({ y: 1180 }));
    });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('defaults to bottom with a threshold of 20', () => {
    const { result } = observe();

    fireScroll(result, { y: 1180 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('is true at the threshold and false one point outside it', () => {
    const near = observe({ position: 'bottom' });
    fireScroll(near.result, { y: 1180 });
    expect(near.result.current.isIntersecting).toBe(true);

    const far = observe({ position: 'bottom' });
    fireScroll(far.result, { y: 1179 });
    expect(far.result.current.isIntersecting).toBe(false);
  });

  it('is true when scrolled fully to the end', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange).toHaveBeenCalledWith(true);
    expect(s.onVisible).not.toHaveBeenCalled();
  });

  it('stays true while rubber-banding past the end', () => {
    const { result } = observe({ position: 'bottom' });

    fireScroll(result, { y: 1250 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('honours a threshold of 0 rather than falling back to 20', () => {
    const { result } = observe({ position: 'bottom', threshold: 0 });

    fireScroll(result, { y: MAX_OFFSET });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: MAX_OFFSET - 1 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('is true when the content is shorter than the viewport', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: 0, contentH: 400 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('ignores the zero-sized event an empty list emits on first layout', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: 0, contentH: 0 });
    fireScroll(result, { y: 0, layoutH: 0, contentH: 0 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();
  });

  it('does not let a zero-sized event clear an established intersection', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    fireScroll(result, { y: 0, contentH: 0 });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onVisible).not.toHaveBeenCalled();
  });
});

describe('malformed events', () => {
  it('never throws, whatever handleScroll is handed', () => {
    const { result } = observe({ position: 'bottom' });

    expect(() => {
      act(() => {
        result.current.handleScroll(undefined);
        result.current.handleScroll(null);
        result.current.handleScroll('scroll');
        result.current.handleScroll(42);
        result.current.handleScroll({});
        result.current.handleScroll({ nativeEvent: null });
        result.current.handleScroll({ nativeEvent: {} });
        result.current.handleScroll({
          nativeEvent: { contentOffset: { y: 1200 } },
        });
      });
    }).not.toThrow();
  });

  it('leaves the state and the callbacks untouched for an unreadable event', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    act(() => {
      result.current.handleScroll({ nativeEvent: {} });
      result.current.handleScroll(undefined);
    });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onVisible).not.toHaveBeenCalled();
  });

  it('never throws, whatever handleElementLayout is handed', () => {
    const { result } = observe({ position: 'element' });

    expect(() => {
      act(() => {
        result.current.handleElementLayout(undefined);
        result.current.handleElementLayout(null);
        result.current.handleElementLayout({});
        result.current.handleElementLayout({ nativeEvent: {} });
        result.current.handleElementLayout({ nativeEvent: { layout: null } });
      });
    }).not.toThrow();
    expect(result.current.isIntersecting).toBe(false);
  });
});

describe('defensive error handling', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('survives an event whose nativeEvent getter throws', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });

    const hostile = {
      get nativeEvent(): never {
        throw new Error('event was recycled');
      },
    };
    expect(() => {
      act(() => {
        result.current.handleScroll(hostile);
      });
    }).not.toThrow();

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Intersection calculation failed:',
      expect.any(Error)
    );
  });

  it('survives a layout event whose nativeEvent getter throws', () => {
    const { result } = observe({ position: 'element' });

    const hostile = {
      get nativeEvent(): never {
        throw new Error('event was recycled');
      },
    };
    expect(() => {
      act(() => {
        result.current.handleElementLayout(hostile);
      });
    }).not.toThrow();

    expect(result.current.isIntersecting).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      'Intersection calculation failed:',
      expect.any(Error)
    );
  });

  it('survives a customPredicate that throws, leaving the state untouched', () => {
    // A user predicate runs inside a 60fps scroll handler; letting it throw
    // would take the whole scroll handler down with it.
    const s = spies();
    const { result } = observe({
      position: 'custom',
      customPredicate: () => {
        throw new Error('bad predicate');
      },
      ...s,
    });

    expect(() => {
      fireScroll(result, { y: MAX_OFFSET });
    }).not.toThrow();

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Intersection calculation failed:',
      expect.any(Error)
    );
  });
});

describe('__DEV__ gating of advisory warnings', () => {
  const globals = globalThis as unknown as { __DEV__?: boolean };
  let warnSpy: jest.SpyInstance;
  let had: boolean;
  let previous: boolean | undefined;

  beforeEach(() => {
    had = '__DEV__' in globals;
    previous = globals.__DEV__;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete globals.__DEV__;
    Object.assign(globals, had ? { __DEV__: previous } : {});
  });

  it('stays silent when __DEV__ is false (a production RN bundle)', () => {
    globals.__DEV__ = false;
    const { result } = observe({ position: 'custom' });

    fireScroll(result, { y: MAX_OFFSET });

    expect(result.current.isIntersecting).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when __DEV__ is undefined, so misconfiguration surfaces off-Metro', () => {
    delete globals.__DEV__;
    const { result } = observe({ position: 'custom' });

    fireScroll(result, { y: MAX_OFFSET });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warns when __DEV__ is true', () => {
    globals.__DEV__ = true;
    const { result } = observe({ position: 'custom' });

    fireScroll(result, { y: MAX_OFFSET });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('transition callbacks', () => {
  it('fires onIntersect once per entry, not once per scroll event', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    for (let i = 0; i < 10; i += 1) {
      fireScroll(result, { y: MAX_OFFSET });
    }

    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange).toHaveBeenCalledTimes(1);
    expect(s.onVisible).not.toHaveBeenCalled();
  });

  it('fires onVisible when the intersection ENDS (documented inverted naming)', () => {
    // `onVisible` firing on hide reads backwards but is the published 1.x
    // contract, restated in the API docs and every example. Pinned here so the
    // inversion is visible in CI output rather than being quietly "fixed".
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    fireScroll(result, { y: 0 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('reports every transition of an enter / leave / re-enter sequence', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    fireScroll(result, { y: 0 });
    fireScroll(result, { y: MAX_OFFSET });

    expect(s.onIntersect).toHaveBeenCalledTimes(2);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange.mock.calls).toEqual([
      [true],
      [false],
      [true],
    ]);
  });

  it('fires onIntersect / onVisible before onIntersectionChange', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    fireScroll(result, { y: 0 });

    expect(s.order).toEqual([
      'onIntersect',
      'onIntersectionChange(true)',
      'onVisible',
      'onIntersectionChange(false)',
    ]);
  });

  it('works with only some of the callbacks supplied', () => {
    const onIntersectionChange = jest.fn();
    const { result } = observe({ position: 'bottom', onIntersectionChange });

    fireScroll(result, { y: MAX_OFFSET });
    fireScroll(result, { y: 0 });

    expect(onIntersectionChange.mock.calls).toEqual([[true], [false]]);
    expect(result.current.isIntersecting).toBe(false);
  });
});

describe('render economy', () => {
  it('does not re-render while the boolean is unchanged', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useIntersectionObserver({ position: 'bottom' });
    });

    expect(renders).toBe(1);

    // Twenty events, all comfortably away from the end: no state, no renders.
    for (let i = 0; i < 20; i += 1) {
      act(() => {
        result.current.handleScroll(scrollEvent({ y: i * 10 }));
      });
    }
    expect(result.current.isIntersecting).toBe(false);
    expect(renders).toBe(1);

    // One transition costs exactly one render.
    act(() => {
      result.current.handleScroll(scrollEvent({ y: MAX_OFFSET }));
    });
    expect(result.current.isIntersecting).toBe(true);
    expect(renders).toBe(2);

    // Different geometry, same boolean: still no further render.
    for (const y of [1210, 1180, 1300, 1190]) {
      act(() => {
        result.current.handleScroll(scrollEvent({ y }));
      });
    }
    expect(renders).toBe(2);
  });
});

describe('handler identity', () => {
  it('keeps the ref and all four functions stable across re-renders', () => {
    const { result, rerender } = observe({ position: 'bottom', threshold: 20 });
    const first = { ...result.current };

    rerender({
      position: 'bottom',
      threshold: 20,
      onIntersect: () => undefined,
    });
    rerender({
      position: 'bottom',
      threshold: 20,
      onIntersect: () => undefined,
    });

    expect(result.current.ref).toBe(first.ref);
    expect(result.current.handleScroll).toBe(first.handleScroll);
    expect(result.current.handleElementLayout).toBe(first.handleElementLayout);
    // Documented as stable, and consumers put it in dependency arrays and hand
    // it to memoized rows: an identity that changes per render re-runs their
    // effects on every parent render.
    expect(result.current.measureElement).toBe(first.measureElement);
    expect(result.current.reset).toBe(first.reset);
  });

  it('keeps them stable across a transition too', () => {
    const { result } = observe({ position: 'bottom' });
    const first = { ...result.current };

    fireScroll(result, { y: MAX_OFFSET });

    expect(result.current.isIntersecting).toBe(true);
    expect(result.current.handleScroll).toBe(first.handleScroll);
    expect(result.current.handleElementLayout).toBe(first.handleElementLayout);
    expect(result.current.measureElement).toBe(first.measureElement);
    expect(result.current.reset).toBe(first.reset);
  });
});

describe('stale closure protection', () => {
  it('uses the callback from the latest render, not the first', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = observe({
      position: 'bottom',
      onIntersect: first,
    });

    rerender({ position: 'bottom', onIntersect: second });
    fireScroll(result, { y: MAX_OFFSET });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('sees fresh inline arrows that close over the latest props', () => {
    // The shape every documented example uses: a brand-new arrow function on
    // every render, closing over current props.
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      (props: { label: string }) =>
        useIntersectionObserver({
          position: 'bottom',
          onIntersect: () => seen.push(props.label),
        }),
      { initialProps: { label: 'first' } }
    );

    rerender({ label: 'second' });
    fireScroll(result, { y: MAX_OFFSET });
    fireScroll(result, { y: 0 });
    rerender({ label: 'third' });
    fireScroll(result, { y: MAX_OFFSET });

    expect(seen).toEqual(['second', 'third']);
  });

  it('reads the threshold at evaluation time and re-applies it on change', () => {
    const onIntersect = jest.fn();
    const { result, rerender } = observe({
      position: 'bottom',
      threshold: 20,
      onIntersect,
    });

    fireScroll(result, { y: 1179 }); // distance 21, outside a threshold of 20
    expect(result.current.isIntersecting).toBe(false);

    // Widening the threshold re-evaluates against the last event immediately,
    // without waiting for another scroll.
    rerender({ position: 'bottom', threshold: 50, onIntersect });

    expect(result.current.isIntersecting).toBe(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it('reads the position at evaluation time and re-applies it on change', () => {
    const onIntersect = jest.fn();
    const { result, rerender } = observe({ position: 'bottom', onIntersect });

    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(false);

    rerender({ position: 'top', onIntersect });

    expect(result.current.isIntersecting).toBe(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it('does not re-evaluate merely because a callback identity changed', () => {
    const { result, rerender } = observe({ position: 'bottom' });

    fireScroll(result, { y: 0 });

    const onIntersect = jest.fn();
    rerender({ position: 'bottom', onIntersect });

    expect(result.current.isIntersecting).toBe(false);
    expect(onIntersect).not.toHaveBeenCalled();
  });
});

describe("position 'top'", () => {
  it('is true at the top and fires onIntersect once', () => {
    const s = spies();
    const { result } = observe({ position: 'top', ...s });

    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('is true at the threshold and false one point past it', () => {
    const { result } = observe({ position: 'top' });

    fireScroll(result, { y: 20 });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: 21 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('stays true through pull-to-refresh overscroll', () => {
    const s = spies();
    const { result } = observe({ position: 'top', ...s });

    fireScroll(result, { y: 0 });
    fireScroll(result, { y: -60 });
    fireScroll(result, { y: -180 });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('honours a threshold of 0', () => {
    const { result } = observe({ position: 'top', threshold: 0 });

    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: 1 });
    expect(result.current.isIntersecting).toBe(false);
  });
});

describe("position 'center'", () => {
  it('is true at the content centre and false at both ends', () => {
    const s = spies();
    const { result } = observe({ position: 'center', ...s });

    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: CENTERED_OFFSET });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: MAX_OFFSET });
    expect(result.current.isIntersecting).toBe(false);

    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
  });

  it('is symmetric around the centre', () => {
    const { result } = observe({ position: 'center' });

    fireScroll(result, { y: 620 });
    expect(result.current.isIntersecting).toBe(true);
    fireScroll(result, { y: 621 });
    expect(result.current.isIntersecting).toBe(false);
    fireScroll(result, { y: 580 });
    expect(result.current.isIntersecting).toBe(true);
    fireScroll(result, { y: 579 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('is true for content that cannot scroll', () => {
    const { result } = observe({ position: 'center' });

    fireScroll(result, { y: 0, contentH: 300 });
    expect(result.current.isIntersecting).toBe(true);
  });
});

describe("position 'element'", () => {
  const rect: LayoutEventInit = { x: 0, y: 1000, width: 300, height: 100 };
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('reports nothing until a layout has been captured', () => {
    const s = spies();
    const element = createRef<View>();
    const { result } = observe({ position: 'element', element, ...s });

    fireScroll(result, { y: 0 });
    fireScroll(result, { y: MAX_OFFSET });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();
  });

  it('warns once — not once per scroll event — about the missing onLayout', () => {
    const { result } = observe({ position: 'element' });

    for (let i = 0; i < 5; i += 1) {
      fireScroll(result, { y: i });
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('handleElementLayout');
  });

  it('is false while the element is below the expanded viewport', () => {
    const { result } = observe({ position: 'element' });

    fireLayout(result, rect);
    fireScroll(result, { y: 0 });

    expect(result.current.isIntersecting).toBe(false);
  });

  it('becomes true when the element reaches the expanded viewport edge', () => {
    // The threshold expands the viewport rather than requiring N points of the
    // element to be on screen, so detection fires 20dp early:
    // elementStart(1000) <= offset + viewport(800) + threshold(20).
    const s = spies();
    const { result } = observe({ position: 'element', ...s });

    fireLayout(result, rect);
    fireScroll(result, { y: 179 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 180 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('fires onVisible when the element scrolls back out above the viewport', () => {
    const s = spies();
    const { result } = observe({ position: 'element', ...s });

    fireLayout(result, rect);
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: 1121 });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange.mock.calls).toEqual([[true], [false]]);
  });

  it('re-evaluates when a layout arrives after the first scroll', () => {
    // An element that becomes visible through a re-layout rather than a scroll
    // must still be detected, without waiting for the next scroll event.
    const s = spies();
    const { result } = observe({ position: 'element', ...s });

    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(false);

    fireLayout(result, rect);
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('does not guess before the first scroll event, however many layouts arrive', () => {
    const s = spies();
    const { result } = observe({ position: 'element', ...s });

    fireLayout(result, rect);
    fireLayout(result, { ...rect, y: 0 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('tolerates a null element ref, and an omitted one', () => {
    const withNullRef = observe({
      position: 'element',
      element: { current: null },
    });
    expect(() => {
      fireLayout(withNullRef.result, rect);
      fireScroll(withNullRef.result, { y: 300 });
    }).not.toThrow();
    expect(withNullRef.result.current.isIntersecting).toBe(true);

    const withoutRef = observe({ position: 'element' });
    expect(() => {
      fireScroll(withoutRef.result, { y: 300 });
    }).not.toThrow();
    expect(withoutRef.result.current.isIntersecting).toBe(false);
  });

  it('ignores a fully degenerate rectangle', () => {
    const { result } = observe({ position: 'element' });

    fireLayout(result, { x: 0, y: 0, width: 0, height: 0 });
    fireScroll(result, { y: 0 });

    expect(result.current.isIntersecting).toBe(false);
  });
});

describe("position 'custom'", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('delegates the decision to customPredicate', () => {
    const s = spies();
    const { result } = observe({
      position: 'custom',
      customPredicate: (m: IntersectionMetrics) => m.distanceFromStart > 500,
      ...s,
    });

    fireScroll(result, { y: 400 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 501 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 500 });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
  });

  it('hands the predicate the projected metrics for the configured axis', () => {
    const seen: IntersectionMetrics[] = [];
    const { result } = observe({
      position: 'custom',
      threshold: 42,
      customPredicate: (m: IntersectionMetrics) => {
        seen.push(m);
        return false;
      },
    });

    fireScroll(result, { y: 1180 });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      offset: 1180,
      viewport: 800,
      content: 2000,
      threshold: 42,
      horizontal: false,
      distanceToEnd: 20,
    });
  });

  it('applies a changed predicate immediately, like a changed threshold', () => {
    const { result, rerender } = observe({
      position: 'custom',
      customPredicate: () => false,
    });

    fireScroll(result, { y: 400 });
    expect(result.current.isIntersecting).toBe(false);

    rerender({ position: 'custom', customPredicate: () => true });
    expect(result.current.isIntersecting).toBe(true);

    rerender({ position: 'custom', customPredicate: () => false });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('never intersects — and warns exactly once — without a predicate', () => {
    const s = spies();
    const { result } = observe({ position: 'custom', ...s });

    for (const y of [0, 600, MAX_OFFSET]) {
      fireScroll(result, { y });
    }

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('customPredicate');
  });
});

describe('horizontal scroll views', () => {
  const wide: ScrollEventInit = {
    contentW: 2000,
    layoutW: 400,
    contentH: 2000,
  };

  it("measures 'bottom' as the end of the x axis", () => {
    const { result } = observe({ position: 'bottom', horizontal: true });

    fireScroll(result, { ...wide, x: 1579 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { ...wide, x: 1580 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it("measures 'top' as the start of the x axis", () => {
    const { result } = observe({ position: 'top', horizontal: true });

    fireScroll(result, { ...wide, x: 0, y: 900 });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { ...wide, x: 21, y: 900 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('re-applies immediately when the axis changes', () => {
    const { result, rerender } = observe({ position: 'bottom' });

    fireScroll(result, { ...wide, x: 1580, y: 0 });
    expect(result.current.isIntersecting).toBe(false);

    rerender({ position: 'bottom', horizontal: true });
    expect(result.current.isIntersecting).toBe(true);
  });
});

describe('reset()', () => {
  it('clears an active intersection without firing any callback', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    expect(result.current.isIntersecting).toBe(true);

    act(() => {
      result.current.reset();
    });

    // reset() is an imperative host action, not an observed transition, so it
    // deliberately fires neither onVisible nor onIntersectionChange.
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange).toHaveBeenCalledWith(true);
  });

  it('re-arms onIntersect for the same geometry — its whole purpose', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    fireScroll(result, { y: MAX_OFFSET });
    act(() => {
      result.current.reset();
    });
    fireScroll(result, { y: MAX_OFFSET });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(2);
    expect(s.onIntersectionChange.mock.calls).toEqual([[true], [true]]);
  });

  it('is a safe no-op before any event has arrived', () => {
    const s = spies();
    const { result } = observe({ position: 'bottom', ...s });

    expect(() => {
      act(() => {
        result.current.reset();
        result.current.reset();
      });
    }).not.toThrow();

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();
  });

  it('does not discard the captured element layout', () => {
    const { result } = observe({ position: 'element' });

    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.isIntersecting).toBe(false);

    // The layout survives, so the very next scroll re-detects the element.
    fireScroll(result, { y: 301 });
    expect(result.current.isIntersecting).toBe(true);
  });
});
