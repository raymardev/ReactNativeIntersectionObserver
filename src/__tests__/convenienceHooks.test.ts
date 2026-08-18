/**
 * Behavioural tests for the four convenience hooks.
 *
 * Each one is a thin wrapper over `useIntersectionObserver`, so the cases here
 * do two things: pin the documented defaults (threshold 20, the position each
 * hook is fixed to, the nested `callbacks` bag) and prove the wrapper produces
 * exactly the same booleans as the core hook it delegates to across a sweep of
 * offsets — which is what stops a wrapper from silently drifting.
 */

import { act, renderHook } from '@testing-library/react-native';
import { createRef } from 'react';
import type { View } from 'react-native';

import {
  useElementIntersection,
  useIntersectionObserver,
  useScrollToBottom,
  useScrollToCenter,
  useScrollToTop,
} from '../index';
import type { UseIntersectionObserverReturn } from '../types';

import {
  CENTERED_OFFSET,
  MAX_OFFSET,
  layoutEvent,
  scrollEvent,
} from './support/events';
import type { LayoutEventInit, ScrollEventInit } from './support/events';

/**
 * Structural handle over any observer result. Typed loosely on purpose: the
 * convenience hooks are generic over the ref's component type, so a helper
 * pinned to `UseIntersectionObserverReturn<ScrollView>` would reject the
 * `type: 'flatlist'` cases — which is exactly the ref-typing behaviour those
 * cases are there to exercise.
 */
type Result = {
  current: {
    handleScroll: (event: unknown) => void;
    handleElementLayout: (event: unknown) => void;
  };
};

/** Offsets that straddle every boundary the library has. */
const OFFSET_SWEEP = [
  -180, -60, -1, 0, 1, 20, 21, 300, 579, 580, 600, 620, 621, 1149, 1150, 1179,
  1180, 1199, 1200, 1250,
];

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

describe('return shape', () => {
  const cases: Array<[string, () => UseIntersectionObserverReturn]> = [
    ['useScrollToBottom', () => useScrollToBottom()],
    ['useScrollToTop', () => useScrollToTop()],
    ['useScrollToCenter', () => useScrollToCenter()],
    ['useElementIntersection', () => useElementIntersection(createRef<View>())],
  ];

  it.each(cases)('%s returns the full documented shape', (_name, hook) => {
    const { result } = renderHook(hook);

    expect(Object.keys(result.current).sort()).toEqual([
      'handleElementLayout',
      'handleScroll',
      'isIntersecting',
      'ref',
      'reset',
    ]);
    expect(result.current.isIntersecting).toBe(false);
    expect(result.current.ref).toHaveProperty('current', null);
    expect(typeof result.current.handleScroll).toBe('function');
    expect(typeof result.current.handleElementLayout).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });
});

describe('useScrollToBottom', () => {
  it('defaults to a threshold of 20', () => {
    const near = renderHook(() => useScrollToBottom());
    fireScroll(near.result, { y: 1180 });
    expect(near.result.current.isIntersecting).toBe(true);

    const far = renderHook(() => useScrollToBottom());
    fireScroll(far.result, { y: 1179 });
    expect(far.result.current.isIntersecting).toBe(false);
  });

  it('honours an explicit threshold and the nested callbacks bag', () => {
    const onIntersect = jest.fn();
    const onVisible = jest.fn();
    const onIntersectionChange = jest.fn();
    const { result } = renderHook(() =>
      useScrollToBottom(50, {
        type: 'flatlist',
        callbacks: { onIntersect, onVisible, onIntersectionChange },
      })
    );

    fireScroll(result, { y: 1149 }); // distance 51
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 1150 }); // distance 50
    expect(result.current.isIntersecting).toBe(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 0 });
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(onIntersectionChange.mock.calls).toEqual([[true], [false]]);
  });

  it('gives identical results whichever ref type is declared', () => {
    const { result } = renderHook(() => ({
      scrollview: useScrollToBottom(50, { type: 'scrollview' }),
      flatlist: useScrollToBottom(50, { type: 'flatlist' }),
      sectionlist: useScrollToBottom(50, { type: 'sectionlist' }),
    }));

    for (const y of OFFSET_SWEEP) {
      act(() => {
        const event = scrollEvent({ y });
        result.current.scrollview.handleScroll(event);
        result.current.flatlist.handleScroll(event);
        result.current.sectionlist.handleScroll(event);
      });

      const expected = result.current.scrollview.isIntersecting;
      expect(result.current.flatlist.isIntersecting).toBe(expected);
      expect(result.current.sectionlist.isIntersecting).toBe(expected);
    }
  });

  it('matches the core hook across the whole offset sweep', () => {
    const { result } = renderHook(() => ({
      wrapper: useScrollToBottom(),
      core: useIntersectionObserver({ position: 'bottom', threshold: 20 }),
    }));

    for (const y of OFFSET_SWEEP) {
      act(() => {
        // One event, several observers — the documented fan-out pattern.
        const event = scrollEvent({ y });
        result.current.wrapper.handleScroll(event);
        result.current.core.handleScroll(event);
      });
      expect(result.current.wrapper.isIntersecting).toBe(
        result.current.core.isIntersecting
      );
    }
  });

  it('measures the end of the x axis when horizontal', () => {
    const { result } = renderHook(() =>
      useScrollToBottom(20, { horizontal: true })
    );

    fireScroll(result, { x: 1580, contentW: 2000, layoutW: 400 });
    expect(result.current.isIntersecting).toBe(true);
  });
});

describe('useScrollToTop', () => {
  it('defaults to a threshold of 20', () => {
    const { result } = renderHook(() => useScrollToTop());

    fireScroll(result, { y: 20 });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: 21 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('honours an explicit threshold and the nested callbacks bag', () => {
    const onIntersect = jest.fn();
    const { result } = renderHook(() =>
      useScrollToTop(10, { callbacks: { onIntersect } })
    );

    fireScroll(result, { y: 11 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 10 });
    expect(result.current.isIntersecting).toBe(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it('stays true through pull-to-refresh overscroll', () => {
    const { result } = renderHook(() => useScrollToTop());

    fireScroll(result, { y: -60 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('matches the core hook across the whole offset sweep', () => {
    const { result } = renderHook(() => ({
      wrapper: useScrollToTop(),
      core: useIntersectionObserver({ position: 'top', threshold: 20 }),
    }));

    for (const y of OFFSET_SWEEP) {
      act(() => {
        const event = scrollEvent({ y });
        result.current.wrapper.handleScroll(event);
        result.current.core.handleScroll(event);
      });
      expect(result.current.wrapper.isIntersecting).toBe(
        result.current.core.isIntersecting
      );
    }
  });
});

describe('useScrollToCenter', () => {
  it('defaults to a threshold of 20 around the content centre', () => {
    const { result } = renderHook(() => useScrollToCenter());

    fireScroll(result, { y: CENTERED_OFFSET });
    expect(result.current.isIntersecting).toBe(true);

    fireScroll(result, { y: CENTERED_OFFSET + 30 });
    expect(result.current.isIntersecting).toBe(false);
  });

  it('honours an explicit threshold and the nested callbacks bag', () => {
    const onIntersect = jest.fn();
    const { result } = renderHook(() =>
      useScrollToCenter(100, { callbacks: { onIntersect } })
    );

    fireScroll(result, { y: 690 }); // 90 from the centre
    expect(result.current.isIntersecting).toBe(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);

    fireScroll(result, { y: 705 }); // 105 from the centre
    expect(result.current.isIntersecting).toBe(false);
  });

  it('matches the core hook across the whole offset sweep', () => {
    const { result } = renderHook(() => ({
      wrapper: useScrollToCenter(),
      core: useIntersectionObserver({ position: 'center', threshold: 20 }),
    }));

    for (const y of OFFSET_SWEEP) {
      act(() => {
        const event = scrollEvent({ y });
        result.current.wrapper.handleScroll(event);
        result.current.core.handleScroll(event);
      });
      expect(result.current.wrapper.isIntersecting).toBe(
        result.current.core.isIntersecting
      );
    }
  });
});

describe('useElementIntersection', () => {
  const rect: LayoutEventInit = { x: 0, y: 1000, width: 300, height: 100 };

  it('takes its callbacks flat, not nested under a callbacks key', () => {
    const onIntersect = jest.fn();
    const element = createRef<View>();
    const { result } = renderHook(() =>
      useElementIntersection(element, 50, { onIntersect })
    );

    fireLayout(result, rect);
    // 1000 <= offset + 800 + 50  =>  offset >= 150
    fireScroll(result, { y: 149 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 150 });
    expect(result.current.isIntersecting).toBe(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it('defaults to a threshold of 20', () => {
    const { result } = renderHook(() =>
      useElementIntersection(createRef<View>())
    );

    fireLayout(result, rect);
    fireScroll(result, { y: 179 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { y: 180 });
    expect(result.current.isIntersecting).toBe(true);
  });

  it('matches the core hook configured for position element', () => {
    const element = createRef<View>();
    const { result } = renderHook(() => ({
      wrapper: useElementIntersection(element, 50),
      core: useIntersectionObserver({
        position: 'element',
        element,
        threshold: 50,
      }),
    }));

    act(() => {
      const event = layoutEvent(rect);
      result.current.wrapper.handleElementLayout(event);
      result.current.core.handleElementLayout(event);
    });

    for (const y of OFFSET_SWEEP) {
      act(() => {
        const event = scrollEvent({ y });
        result.current.wrapper.handleScroll(event);
        result.current.core.handleScroll(event);
      });
      expect(result.current.wrapper.isIntersecting).toBe(
        result.current.core.isIntersecting
      );
    }
  });

  it('supports reset() to re-arm impression counting', () => {
    const onIntersect = jest.fn();
    const { result } = renderHook(() =>
      useElementIntersection(createRef<View>(), 20, { onIntersect })
    );

    fireLayout(result, rect);
    fireScroll(result, { y: 300 });
    expect(onIntersect).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.reset();
    });
    fireScroll(result, { y: 300 });
    expect(onIntersect).toHaveBeenCalledTimes(2);
  });

  it('measures the x axis when horizontal', () => {
    const { result } = renderHook(() =>
      useElementIntersection(createRef<View>(), 20, undefined, {
        horizontal: true,
      })
    );

    fireLayout(result, { x: 1000, y: 0, width: 100, height: 300 });
    // 1000 <= x + 400 + 20  =>  x >= 580
    fireScroll(result, { x: 579, contentW: 2000, layoutW: 400 });
    expect(result.current.isIntersecting).toBe(false);

    fireScroll(result, { x: 580, contentW: 2000, layoutW: 400 });
    expect(result.current.isIntersecting).toBe(true);
  });
});

describe('several observers sharing one scroll event', () => {
  it('keeps independent state and fires each hook once per transition', () => {
    const top = jest.fn();
    const bottom = jest.fn();
    const { result } = renderHook(() => ({
      top: useScrollToTop(20, { callbacks: { onIntersect: top } }),
      bottom: useScrollToBottom(20, { callbacks: { onIntersect: bottom } }),
    }));

    const dispatch = (y: number): void => {
      act(() => {
        const event = scrollEvent({ y });
        result.current.top.handleScroll(event);
        result.current.bottom.handleScroll(event);
      });
    };

    dispatch(0);
    expect(result.current.top.isIntersecting).toBe(true);
    expect(result.current.bottom.isIntersecting).toBe(false);

    dispatch(MAX_OFFSET);
    expect(result.current.top.isIntersecting).toBe(false);
    expect(result.current.bottom.isIntersecting).toBe(true);

    expect(top).toHaveBeenCalledTimes(1);
    expect(bottom).toHaveBeenCalledTimes(1);
  });
});
