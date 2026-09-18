/**
 * `position: 'element'` measured against the scroll container.
 *
 * `onLayout` reports a rectangle in the tracked view's **parent's** coordinate
 * space, while `contentOffset` lives in the scroll view's content space, so the
 * two only agree when the tracked view is a direct child of the scroll content.
 * These tests drive the `measureLayout` path that closes that gap, with hand
 * written ref instances rather than mocks of `react-native`: the hook only ever
 * duck-types the accessors, so a plain object is a faithful stand-in for a
 * `ScrollView` instance and for a host view.
 *
 * Standard fixture geometry (see `./support/events`): viewport 800, content
 * 2000, default threshold 20.
 */

import { act, renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';

import { useIntersectionObserver } from '../index';
import type {
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn,
} from '../types';

import { layoutEvent, scrollEvent } from './support/events';
import type { LayoutEventInit, ScrollEventInit } from './support/events';

type Result = { current: UseIntersectionObserverReturn };

/** The success callback React Native hands to a `measureLayout` caller. */
type Success = (x: number, y: number, width: number, height: number) => void;

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

/** The hook's ref is readonly to consumers; a test stands in for React here. */
function attachScrollRef(result: Result, instance: unknown): void {
  (result.current.ref as { current: unknown }).current = instance;
}

/** A `ScrollView` instance whose content container resolves to `contentView`. */
function scrollInstance(contentView: object) {
  return { getInnerViewRef: () => contentView };
}

function elementRef(measureLayout: jest.Mock): RefObject<View | null> {
  return { current: { measureLayout } } as unknown as RefObject<View | null>;
}

/** A `measureLayout` that answers synchronously with a fixed rectangle. */
function respondWith(...rects: Array<[number, number, number, number]>) {
  let call = 0;
  return jest.fn((_reference: unknown, onSuccess: Success) => {
    const rect = rects[Math.min(call, rects.length - 1)];
    call += 1;
    onSuccess(rect[0], rect[1], rect[2], rect[3]);
  });
}

const spies = () => ({
  onIntersect: jest.fn(),
  onVisible: jest.fn(),
  onIntersectionChange: jest.fn(),
});

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('measured element geometry', () => {
  it('uses the content-space rectangle for a nested view, not the parent-relative one', () => {
    // The regression this whole path exists for. The target sits at y=20 inside
    // a card at y=900, so its content-space position is 920 and its
    // parent-relative position is 20. Reading the onLayout value would report
    // the element as visible at offset 0 (20 <= 820), which is wrong by 900dp.
    const s = spies();
    const contentView = {};
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, ...s });

    attachScrollRef(result, scrollInstance(contentView));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });

    expect(measureLayout).toHaveBeenCalledTimes(1);
    expect(measureLayout.mock.calls[0][0]).toBe(contentView);

    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();

    // 920 <= 100 + 800 + 20 — the exact edge.
    fireScroll(result, { y: 100 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('measures the x axis for a horizontal scroll view', () => {
    const measureLayout = respondWith([1500, 0, 100, 300]);
    const element = elementRef(measureLayout);
    const { result } = observe({
      position: 'element',
      horizontal: true,
      element,
    });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 20, y: 0, width: 100, height: 300 });

    const wide: ScrollEventInit = { contentW: 2000, layoutW: 400 };
    fireScroll(result, { ...wide, x: 1079 });
    expect(result.current.isIntersecting).toBe(false);

    // 1500 <= 1080 + 400 + 20
    fireScroll(result, { ...wide, x: 1080 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('lets a successful measurement supersede every later onLayout rectangle', () => {
    const s = spies();
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, ...s });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });

    // One pass per layout event, and never one per scroll event.
    expect(measureLayout).toHaveBeenCalledTimes(2);
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();
  });

  it('re-measures when the content size changes, but not while it is stable', () => {
    const measureLayout = respondWith([0, 920, 300, 100], [0, 1420, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    expect(measureLayout).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 0, contentH: 2000 });
    fireScroll(result, { y: 10, contentH: 2000 });
    fireScroll(result, { y: 20, contentH: 2000 });
    expect(measureLayout).toHaveBeenCalledTimes(1);
    expect(result.current.isIntersecting).toBe(false);

    // A page loaded above the target: the content grew, so the cached
    // content-space rectangle is stale and is measured again.
    fireScroll(result, { y: 20, contentH: 2500 });
    expect(measureLayout).toHaveBeenCalledTimes(2);
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 600, contentH: 2500 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('re-measures when the viewport size changes (rotation, keyboard, split view)', () => {
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    expect(measureLayout).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 0, layoutH: 500 });
    expect(measureLayout).toHaveBeenCalledTimes(2);
  });

  it('measures from the first scroll event when no onLayout is wired', () => {
    // Previously non-functional: with a ref but no onLayout there was no
    // geometry at all. The first scroll event now starts the measurement.
    const measureLayout = respondWith([0, 700, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireScroll(result, { y: 0 });

    expect(measureLayout).toHaveBeenCalledTimes(1);
    expect(result.current.isIntersecting).toBe(true);
  });

  it('re-measures on demand through measureElement()', () => {
    const measureLayout = respondWith([0, 920, 300, 100], [0, 700, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(false);

    // The card animated upwards; nothing the hook can observe by itself.
    act(() => {
      result.current.measureElement();
    });

    expect(measureLayout).toHaveBeenCalledTimes(2);
    expect(result.current.isIntersecting).toBe(true);
  });

  it('is a no-op to call measureElement() for another position', () => {
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'bottom', element });

    attachScrollRef(result, scrollInstance({}));
    act(() => {
      result.current.measureElement();
    });

    expect(measureLayout).not.toHaveBeenCalled();
  });

  it('discards a measurement the tracked view has already invalidated', () => {
    const pending: Success[] = [];
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      pending.push(onSuccess);
    });
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    // A second layout while the first pass is in flight: coalesced, not queued.
    fireLayout(result, { x: 0, y: 40, width: 300, height: 100 });
    expect(measureLayout).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 0 });
    act(() => {
      pending[0](0, 700, 300, 100);
    });

    // The first result is applied (something beats nothing) and a fresh pass is
    // started immediately, because the geometry moved while it was in flight.
    expect(result.current.isIntersecting).toBe(true);
    expect(measureLayout).toHaveBeenCalledTimes(2);

    act(() => {
      pending[1](0, 1900, 300, 100);
    });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('reports a measured view that collapses to nothing as hidden', () => {
    // The ordinary way an app hides something: `display: 'none'`, or a wrapper
    // that renders no children, lays the view out as 0x0 and reports it. That is
    // a measurement, not a measurement failure — discarding it used to keep the
    // last good rectangle and freeze the observer at `true`.
    const s = spies();
    const measureLayout = respondWith([0, 100, 300, 100], [0, 100, 0, 0]);
    const element = elementRef(measureLayout);
    const { result } = observe({
      position: 'element',
      element,
      threshold: 0,
      ...s,
    });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 100, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);

    fireLayout(result, { x: 0, y: 100, width: 0, height: 0 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange.mock.calls).toEqual([[true], [false]]);
    // A collapse is not a failure, so nothing is diagnosed as one.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not resurrect a collapsed view when the user scrolls to where it was', () => {
    // The over-counting half of the same defect: a stale rectangle kept for a
    // view with no extent fires a fresh impression for something that is not on
    // screen at all.
    const s = spies();
    const measureLayout = respondWith([0, 1500, 300, 100], [0, 1500, 0, 0]);
    const element = elementRef(measureLayout);
    const { result } = observe({
      position: 'element',
      element,
      threshold: 0,
      ...s,
    });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 0, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    expect(result.current.isIntersecting).toBe(false);

    fireLayout(result, { x: 0, y: 0, width: 0, height: 0 });
    fireScroll(result, { y: 800 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
  });

  it('does not cache a 0x0 answer that arrives before anything was measured', () => {
    // React Native answers from a shadow node that has not been laid out yet
    // with zeroes, and that is not the view saying it is empty. Nothing is
    // cached from it, so the onLayout rectangle still answers and the pass is
    // retried.
    const measureLayout = respondWith([0, 0, 0, 0]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, threshold: 0 });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 100, width: 300, height: 100 });
    fireScroll(result, { y: 0 });

    expect(result.current.isIntersecting).toBe(true);
    expect(measureLayout).toHaveBeenCalledTimes(2);
  });

  it('drops the cached rectangle when the tracked view unmounts', () => {
    // Conditionally rendering the tracked view sets its ref to null and fires no
    // onLayout at all, so the cached rectangle is the only thing left — and it
    // keeps reporting intersections for a view that no longer exists. It is not
    // "unmeasured" either: it has been measured, and it is not visible.
    const s = spies();
    const measureLayout = respondWith([0, 1000, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, ...s });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);

    (element as { current: unknown }).current = null;
    fireScroll(result, { y: 301 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);

    // And it stays gone: the ghost rectangle cannot come back on a later event,
    // which is what made reset() look broken.
    fireScroll(result, { y: 302 });
    act(() => {
      result.current.reset();
    });
    fireScroll(result, { y: 303 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    // An unmount is not a wiring mistake, so it is never reported as one.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not resurrect an unmounted view from its onLayout rectangle', () => {
    // The sibling case above leaves an onLayout rectangle that is out of view
    // anyway, so it cannot tell whether the rectangle was dropped. Here the
    // parent-relative rectangle (350..450) *is* inside the viewport after the
    // unmount, so a rectangle left behind would report the ghost as visible
    // again on the very next scroll event.
    const s = spies();
    const measureLayout = respondWith([0, 1000, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, ...s });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 350, width: 300, height: 100 });
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);

    (element as { current: unknown }).current = null;
    fireScroll(result, { y: 301 });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onVisible).toHaveBeenCalledTimes(1);

    // The event after the unmount is the one that would bring the ghost back.
    fireScroll(result, { y: 302 });
    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('measures again when the tracked view is mounted a second time', () => {
    const measureLayout = respondWith([0, 1000, 300, 100], [0, 400, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, threshold: 0 });
    const view = element.current;

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);

    (element as { current: unknown }).current = null;
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(false);

    (element as { current: unknown }).current = view;
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });

    expect(measureLayout).toHaveBeenCalledTimes(2);
    expect(result.current.isIntersecting).toBe(true);
  });

  it('resets the measurement when the tracked element ref is swapped', () => {
    const first = respondWith([0, 920, 300, 100]);
    const second = respondWith([0, 700, 300, 100]);
    const { result, rerender } = renderHook(
      (props: UseIntersectionObserverOptions) => useIntersectionObserver(props),
      { initialProps: { position: 'element', element: elementRef(first) } }
    );

    attachScrollRef(result as Result, scrollInstance({}));
    fireLayout(result as Result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result as Result, { y: 0 });
    expect(result.current.isIntersecting).toBe(false);

    rerender({ position: 'element', element: elementRef(second) });

    expect(second).toHaveBeenCalledTimes(1);
    expect(result.current.isIntersecting).toBe(true);
  });
});

describe('measurement handoff', () => {
  it('suppresses the parent-relative rectangle while the first pass is in flight', () => {
    // Without the window, the first scroll event would answer from the onLayout
    // rectangle (y=20 => visible), and the measurement landing at y=700 would
    // immediately contradict it: a spurious impression plus a visible flicker.
    const s = spies();
    let resolve: Success = () => undefined;
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      resolve = onSuccess;
    });
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, ...s });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });

    expect(result.current.isIntersecting).toBe(false);
    expect(s.onIntersect).not.toHaveBeenCalled();
    expect(s.onIntersectionChange).not.toHaveBeenCalled();

    act(() => {
      resolve(0, 700, 300, 100);
    });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onIntersectionChange.mock.calls).toEqual([[true]]);
  });

  it('falls back to the onLayout rectangle if the measurement never answers', () => {
    // Exactly what React Native's own jest view mock does: a measureLayout that
    // records nothing and calls neither callback. The suppression window is
    // bounded so the observer cannot be wedged by it.
    const measureLayout = jest.fn(() => undefined);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });

    for (let i = 0; i < 3; i += 1) {
      fireScroll(result, { y: 180 });
      expect(result.current.isIntersecting).toBe(false);
    }

    fireScroll(result, { y: 180 });
    expect(result.current.isIntersecting).toBe(true);
    expect(measureLayout).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached rectangle when a superseded pass answers with stale geometry', () => {
    // React Native's measureLayout is asynchronous, so a layout landing while a
    // pass is in flight is the ordinary case. That pass is answering about the
    // geometry from before the move, and applying it would show a hide/show pair
    // that never happened on screen.
    const s = spies();
    const pending: Success[] = [];
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      pending.push(onSuccess);
    });
    const element = elementRef(measureLayout);
    const { result } = observe({
      position: 'element',
      element,
      threshold: 0,
      ...s,
    });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    act(() => {
      pending[0](0, 700, 300, 100);
    });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);

    // Two more layout events: the first starts pass 2, the second coalesces into
    // it and marks its answer as already out of date.
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    expect(measureLayout).toHaveBeenCalledTimes(2);

    act(() => {
      pending[1](0, 1900, 300, 100);
    });

    expect(result.current.isIntersecting).toBe(true);
    expect(s.onVisible).not.toHaveBeenCalled();
    expect(s.onIntersectionChange.mock.calls).toEqual([[true]]);
    // ...and a fresh pass was started instead of trusting the stale answer.
    expect(measureLayout).toHaveBeenCalledTimes(3);

    act(() => {
      pending[2](0, 700, 300, 100);
    });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
  });

  it('ignores a measurement that lands after unmount', () => {
    const s = spies();
    let resolve: Success = () => undefined;
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      resolve = onSuccess;
    });
    const element = elementRef(measureLayout);
    const { result, unmount } = observe({ position: 'element', element, ...s });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 0 });
    unmount();

    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    expect(() => {
      act(() => {
        resolve(0, 100, 300, 100);
      });
    }).not.toThrow();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(s.onIntersect).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('measurement failure ladder', () => {
  it('falls back to the onLayout rectangle on a failed pass, silently', () => {
    const measureLayout = jest.fn(
      (_reference: unknown, _onSuccess: Success, onFail?: () => void) => {
        onFail?.();
      }
    );
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once, and stops retrying, after three consecutive failures', () => {
    const measureLayout = jest.fn(
      (_reference: unknown, _onSuccess: Success, onFail?: () => void) => {
        onFail?.();
      }
    );
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    for (let i = 0; i < 5; i += 1) {
      fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    }

    expect(measureLayout).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'measurement kept failing'
    );

    // measureElement() clears the budget, so it is always worth another try.
    act(() => {
      result.current.measureElement();
    });
    expect(measureLayout).toHaveBeenCalledTimes(4);
  });

  it('counts a repeated failure callback only once', () => {
    // React Native has no obligation to call back exactly once, and a late
    // callback from a superseded pass must not spend the retry budget.
    const fails: Array<() => void> = [];
    const measureLayout = jest.fn(
      (_reference: unknown, _onSuccess: Success, onFail?: () => void) => {
        if (onFail) {
          fails.push(onFail);
        }
      }
    );
    const element = elementRef(measureLayout);
    const { result, unmount } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });

    act(() => {
      fails[0]();
      fails[0]();
      fails[0]();
    });

    // Three real failures would have warned; one failure reported three times
    // must not.
    expect(warnSpy).not.toHaveBeenCalled();

    unmount();
    expect(() => {
      act(() => {
        fails[0]();
      });
    }).not.toThrow();
  });

  it('keeps the last good rectangle when a later pass fails', () => {
    let fail = false;
    const measureLayout = jest.fn(
      (_reference: unknown, onSuccess: Success, onFail?: () => void) => {
        if (fail) {
          onFail?.();
          return;
        }
        onSuccess(0, 920, 300, 100);
      }
    );
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 100 });
    expect(result.current.isIntersecting).toBe(true);

    fail = true;
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });

    // A detach during a re-parent is transient: the measured rectangle survives
    // rather than the parent-relative one taking over and flipping the state.
    expect(result.current.isIntersecting).toBe(true);
    fireScroll(result, { y: 99 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('treats a garbage measurement as a failure and keeps the good rectangle', () => {
    const measureLayout = respondWith(
      [0, 920, 300, 100],
      [Number.NaN, Number.NaN, 0, 0]
    );
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 100 });
    expect(result.current.isIntersecting).toBe(true);

    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('recovers, through measureElement(), from a pass that never answers', () => {
    // ReactNativeElement.measureLayout returns without calling either callback
    // when a shadow node has gone. A pass stuck at 'pending' blocks every later
    // trigger, so the documented escape hatch has to abandon it rather than wait.
    const pending: Success[] = [];
    const measureLayout = jest.fn((_reference: unknown, onSuccess: Success) => {
      pending.push(onSuccess);
    });
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, threshold: 0 });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    expect(measureLayout).toHaveBeenCalledTimes(1);

    // Every automatic trigger is dropped while that pass is in flight.
    fireScroll(result, { y: 0 });
    fireLayout(result, { x: 0, y: 30, width: 300, height: 100 });
    expect(measureLayout).toHaveBeenCalledTimes(1);
    expect(result.current.isIntersecting).toBe(false);

    act(() => {
      result.current.measureElement();
    });
    expect(measureLayout).toHaveBeenCalledTimes(2);

    act(() => {
      pending[1](0, 700, 300, 100);
    });
    expect(result.current.isIntersecting).toBe(true);

    // The abandoned pass answering late is still ignored.
    act(() => {
      pending[0](0, 1900, 300, 100);
    });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('falls back to the onLayout rectangle when measurement never succeeds', () => {
    // The "falling back to onLayout coordinates" advisory is aimed at the case
    // where measureLayout never answered at all, so there is no content-space
    // rectangle to prefer. That is the only case in which onLayout wins.
    const measureLayout = jest.fn(
      (_reference: unknown, _onSuccess: Success, onFail?: () => void) => {
        onFail?.();
      }
    );
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element, threshold: 0 });

    attachScrollRef(result, scrollInstance({}));
    for (let i = 0; i < 3; i += 1) {
      fireLayout(result, { x: 0, y: 100, width: 300, height: 100 });
    }
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'measurement kept failing'
    );

    // Nothing was ever measured, so the onLayout rectangle (100..200) decides.
    fireScroll(result, { y: 150 });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: 900 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('keeps the measured rectangle when measurement later gives up', () => {
    // Giving up on measurement does not invalidate the rectangle already
    // measured against the scroll container. A failure spree is usually a
    // transient detach (a list recycling the row), and preferring the
    // parent-relative onLayout rectangle here would answer from the wrong
    // origin for the rest of the component's life.
    let fail = false;
    const measureLayout = jest.fn(
      (_reference: unknown, onSuccess: Success, onFail?: () => void) => {
        if (fail) {
          onFail?.();
          return;
        }
        onSuccess(0, 1000, 300, 100);
      }
    );
    const element = elementRef(measureLayout);
    const s = spies();
    const { result } = observe({
      position: 'element',
      element,
      threshold: 0,
      ...s,
    });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 100, width: 300, height: 100 });
    fireScroll(result, { y: 300 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);

    fail = true;
    for (let i = 0; i < 3; i += 1) {
      fireLayout(result, { x: 0, y: 100, width: 300, height: 100 });
    }

    // The measured rectangle (1000..1100) still decides. The onLayout one
    // (100..200) would report false here, and would have flipped again on the
    // way back, firing a phantom onIntersect.
    fireScroll(result, { y: 301 });
    expect(result.current.isIntersecting).toBe(true);
    expect(s.onIntersect).toHaveBeenCalledTimes(1);
    expect(s.onVisible).not.toHaveBeenCalled();
  });

  it('gives up immediately, and once, on a ref that is not a native view', () => {
    // A class component or a wrapper that does not forward its ref: there is no
    // measureLayout to call, and no amount of retrying will produce one.
    const element = {
      current: { notAView: true },
    } as unknown as RefObject<View | null>;
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });
    fireScroll(result, { y: 181 });

    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'does not hold a native view'
    );
  });

  it('never measures — and never warns — when the scroll ref is unattached', () => {
    // The documented multi-observer pattern deliberately leaves `ref` off the
    // scroll component, and must keep working from the event payload alone.
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 180 });

    expect(measureLayout).not.toHaveBeenCalled();
    expect(result.current.isIntersecting).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once about an unattached ref after three scroll-driven attempts', () => {
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    for (let i = 0; i < 6; i += 1) {
      fireScroll(result, { y: i, contentH: 2000 + i });
    }

    expect(measureLayout).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'attach the `element` ref'
    );
  });

  it('does not accuse a correctly wired observer of missing handleElementLayout', () => {
    // The 1.x warning fired on the first scroll event for anyone whose tracked
    // view had simply not been laid out yet.
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireScroll(result, { y: 0 });
    fireScroll(result, { y: 100 });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('survives a measureLayout that throws', () => {
    const measureLayout = jest.fn(() => {
      throw new Error('view is gone');
    });
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    expect(() => {
      fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
      fireScroll(result, { y: 180 });
    }).not.toThrow();

    expect(result.current.isIntersecting).toBe(true);
  });
});

describe('backward compatibility', () => {
  it('never measures when no element ref is supplied', () => {
    const { result } = observe({ position: 'element' });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 1000, width: 300, height: 100 });
    fireScroll(result, { y: 179 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 180 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('keeps both rectangles across reset()', () => {
    const measureLayout = respondWith([0, 920, 300, 100]);
    const element = elementRef(measureLayout);
    const { result } = observe({ position: 'element', element });

    attachScrollRef(result, scrollInstance({}));
    fireLayout(result, { x: 0, y: 20, width: 300, height: 100 });
    fireScroll(result, { y: 100 });
    expect(result.current.isIntersecting).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 101 });
    expect(result.current.isIntersecting).toBe(true);
    expect(measureLayout).toHaveBeenCalledTimes(1);
  });
});
