/// <reference types="@testing-library/react-native/extend-expect" />

/**
 * End-to-end tests through real React Native components.
 *
 * The hook suites drive `handleScroll` directly; these render an actual
 * `ScrollView` / `FlatList` / `SectionList`, attach the returned `ref` and
 * `onScroll`, and dispatch the scroll through `fireEvent`. That covers two
 * things the hook-level suites cannot:
 *
 * 1. The returned `ref` actually type-checks against — and attaches to — each
 *    of the three components. `ref` used to be declared in a way TypeScript
 *    rejected on every one of them (TS2769); this file is compiled by ts-jest,
 *    so that defect would fail the suite at build time, not at runtime.
 * 2. The handlers are wired the way the README tells people to wire them.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useRef } from 'react';
import { FlatList, ScrollView, SectionList, Text, View } from 'react-native';

import {
  useElementIntersection,
  useIntersectionObserver,
  useScrollToBottom,
  useScrollToTop,
} from '../index';
import type { UseIntersectionObserverReturn } from '../types';
import { MAX_OFFSET, layoutEvent, scrollEvent } from './support/events';

interface ScreenProps {
  onAttached?: (instance: unknown) => void;
  onIntersect?: () => void;
}

function ScrollViewScreen({ onAttached, onIntersect }: ScreenProps) {
  const { isIntersecting, ref, handleScroll } = useScrollToBottom(20, {
    callbacks: { onIntersect },
  });

  useEffect(() => {
    onAttached?.(ref.current);
  }, [onAttached, ref]);

  return (
    <ScrollView
      testID="scrollview"
      ref={ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <Text testID="status">{isIntersecting ? 'at-end' : 'scrolling'}</Text>
    </ScrollView>
  );
}

function FlatListScreen({ onAttached }: ScreenProps) {
  const { isIntersecting, ref, handleScroll } = useScrollToBottom(20, {
    type: 'flatlist',
  });

  useEffect(() => {
    onAttached?.(ref.current);
  }, [onAttached, ref]);

  return (
    <FlatList
      testID="flatlist"
      ref={ref}
      data={['a', 'b', 'c']}
      keyExtractor={item => item}
      renderItem={({ item }) => <Text>{item}</Text>}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      ListFooterComponent={
        <Text testID="status">{isIntersecting ? 'at-end' : 'scrolling'}</Text>
      }
    />
  );
}

function SectionListScreen({ onAttached }: ScreenProps) {
  const { isIntersecting, ref, handleScroll } = useScrollToTop(20, {
    type: 'sectionlist',
  });

  useEffect(() => {
    onAttached?.(ref.current);
  }, [onAttached, ref]);

  return (
    <SectionList
      testID="sectionlist"
      ref={ref}
      sections={[{ title: 'one', data: ['a', 'b'] }]}
      keyExtractor={item => item}
      renderItem={({ item }) => <Text>{item}</Text>}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      ListFooterComponent={
        <Text testID="status">{isIntersecting ? 'at-top' : 'scrolled'}</Text>
      }
    />
  );
}

function ElementScreen({ onIntersect }: ScreenProps) {
  const elementRef = useRef<View>(null);
  const { isIntersecting, ref, handleScroll, handleElementLayout } =
    useElementIntersection(elementRef, 20, { onIntersect });

  return (
    <ScrollView
      testID="scrollview"
      ref={ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={{ height: 900 }} />
      <View
        testID="target"
        ref={elementRef}
        onLayout={handleElementLayout}
        style={{ height: 200 }}
      >
        <Text testID="status">{isIntersecting ? 'visible' : 'hidden'}</Text>
      </View>
    </ScrollView>
  );
}

interface NestedScreenProps extends ScreenProps {
  onReady?: (refs: { scroll: unknown; target: unknown }) => void;
}

/**
 * The tracked view nested inside a card, which is the shape `onLayout` alone
 * cannot handle: its rectangle is reported relative to the card, not to the
 * scroll content.
 */
function NestedElementScreen({ onIntersect, onReady }: NestedScreenProps) {
  const elementRef = useRef<View>(null);
  const { isIntersecting, ref, handleScroll, handleElementLayout } =
    useElementIntersection(elementRef, 20, { onIntersect });

  useEffect(() => {
    onReady?.({ scroll: ref.current, target: elementRef.current });
  }, [onReady, ref]);

  return (
    <ScrollView
      testID="scrollview"
      ref={ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={{ height: 900 }} />
      <View testID="card">
        <View
          testID="target"
          ref={elementRef}
          onLayout={handleElementLayout}
          style={{ height: 100, marginTop: 20 }}
        >
          <Text testID="status">{isIntersecting ? 'visible' : 'hidden'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** Dispatches a scroll event from a passive effect, as a child component. */
function ScrollFromEffect({
  observer,
  y,
}: {
  observer: UseIntersectionObserverReturn;
  y: number;
}) {
  useEffect(() => {
    observer.handleScroll(scrollEvent({ y }));
  }, [observer, y]);

  return null;
}

function FreshCallbackScreen({
  y,
  onIntersect,
}: {
  y: number;
  onIntersect: () => void;
}) {
  const observer = useIntersectionObserver({ position: 'bottom', onIntersect });

  return <ScrollFromEffect observer={observer} y={y} />;
}

describe('callback freshness', () => {
  it('never calls a callback from a render that has already been replaced', () => {
    // A child's passive effect runs before the parent's, so an event dispatched
    // from one lands in the window between the commit and the parent's passive
    // flush. The hook syncs its options in a layout effect precisely so that
    // window cannot see the previous render's callbacks.
    const first = jest.fn();
    const second = jest.fn();

    const { rerender } = render(
      <FreshCallbackScreen y={0} onIntersect={first} />
    );
    expect(first).not.toHaveBeenCalled();

    rerender(<FreshCallbackScreen y={MAX_OFFSET} onIntersect={second} />);

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('ScrollView', () => {
  it('attaches the returned ref to a real ScrollView instance', () => {
    const onAttached = jest.fn();
    render(<ScrollViewScreen onAttached={onAttached} />);

    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(onAttached.mock.calls[0][0]).not.toBeNull();
  });

  it('updates the tree when a real scroll event reaches the end', () => {
    const onIntersect = jest.fn();
    render(<ScrollViewScreen onIntersect={onIntersect} />);

    expect(screen.getByTestId('status')).toHaveTextContent('scrolling');

    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 0 }));
    expect(screen.getByTestId('status')).toHaveTextContent('scrolling');
    expect(onIntersect).not.toHaveBeenCalled();

    fireEvent.scroll(
      screen.getByTestId('scrollview'),
      scrollEvent({ y: MAX_OFFSET })
    );
    expect(screen.getByTestId('status')).toHaveTextContent('at-end');
    expect(onIntersect).toHaveBeenCalledTimes(1);

    // Still one call after further scrolling within the threshold band.
    fireEvent.scroll(
      screen.getByTestId('scrollview'),
      scrollEvent({ y: 1190 })
    );
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });
});

describe('FlatList', () => {
  it("attaches a ref declared with type: 'flatlist'", () => {
    const onAttached = jest.fn();
    render(<FlatListScreen onAttached={onAttached} />);

    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(onAttached.mock.calls[0][0]).not.toBeNull();
  });

  it('reacts to a scroll event dispatched on the list', () => {
    render(<FlatListScreen />);

    expect(screen.getByTestId('status')).toHaveTextContent('scrolling');
    fireEvent.scroll(
      screen.getByTestId('flatlist'),
      scrollEvent({ y: MAX_OFFSET })
    );
    expect(screen.getByTestId('status')).toHaveTextContent('at-end');
  });
});

describe('SectionList', () => {
  it("attaches a ref declared with type: 'sectionlist'", () => {
    const onAttached = jest.fn();
    render(<SectionListScreen onAttached={onAttached} />);

    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(onAttached.mock.calls[0][0]).not.toBeNull();
  });

  it('reacts to a scroll event dispatched on the list', () => {
    render(<SectionListScreen />);

    fireEvent.scroll(screen.getByTestId('sectionlist'), scrollEvent({ y: 0 }));
    expect(screen.getByTestId('status')).toHaveTextContent('at-top');

    fireEvent.scroll(
      screen.getByTestId('sectionlist'),
      scrollEvent({ y: 500 })
    );
    expect(screen.getByTestId('status')).toHaveTextContent('scrolled');
  });
});

describe('useElementIntersection with a nested tracked view', () => {
  it('measures the tracked view against the scroll content, not against its card', () => {
    // The target sits 20dp inside a card that starts at y=900, so its content
    // space position is 920 and the onLayout rectangle says 20. Deciding from
    // the onLayout value would report it visible at offset 0, 900dp early.
    const onIntersect = jest.fn();
    const contentView = { id: 'content-container' };
    const measureLayout = jest.fn(
      (
        _reference: unknown,
        onSuccess: (x: number, y: number, w: number, h: number) => void
      ) => {
        onSuccess(0, 920, 300, 100);
      }
    );

    render(
      <NestedElementScreen
        onIntersect={onIntersect}
        onReady={({ scroll, target }) => {
          // React Native's own jest mocks answer these with `undefined`, so the
          // instances are given the shapes a real ScrollView and a real host
          // view expose.
          (scroll as { getInnerViewRef: () => unknown }).getInnerViewRef = () =>
            contentView;
          (target as { measureLayout: unknown }).measureLayout = measureLayout;
        }}
      />
    );

    fireEvent(
      screen.getByTestId('target'),
      'layout',
      layoutEvent({ x: 0, y: 20, width: 300, height: 100 })
    );
    expect(measureLayout).toHaveBeenCalledTimes(1);
    expect(measureLayout.mock.calls[0][0]).toBe(contentView);

    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 0 }));
    expect(screen.getByTestId('status')).toHaveTextContent('hidden');
    expect(onIntersect).not.toHaveBeenCalled();

    // 920 <= 100 + 800 + 20 — the exact edge.
    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 100 }));
    expect(screen.getByTestId('status')).toHaveTextContent('visible');
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it('falls back to the onLayout rectangle when the container cannot be resolved', () => {
    // React Native's ScrollView mock answers every host accessor with
    // `undefined`, which is exactly the "cannot measure" case: the observer has
    // to keep working from the layout event alone.
    const onIntersect = jest.fn();
    render(<NestedElementScreen onIntersect={onIntersect} />);

    fireEvent(
      screen.getByTestId('target'),
      'layout',
      layoutEvent({ x: 0, y: 920, width: 300, height: 100 })
    );
    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 0 }));
    expect(screen.getByTestId('status')).toHaveTextContent('hidden');

    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 100 }));
    expect(screen.getByTestId('status')).toHaveTextContent('visible');
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });
});

describe('useElementIntersection wired to onLayout', () => {
  it('detects the tracked view once its layout and a scroll have both arrived', () => {
    const onIntersect = jest.fn();
    render(<ElementScreen onIntersect={onIntersect} />);

    expect(screen.getByTestId('status')).toHaveTextContent('hidden');

    fireEvent(
      screen.getByTestId('target'),
      'layout',
      layoutEvent({ x: 0, y: 900, width: 300, height: 200 })
    );
    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 0 }));
    expect(screen.getByTestId('status')).toHaveTextContent('hidden');
    expect(onIntersect).not.toHaveBeenCalled();

    // 900 <= offset + 800 + 20  =>  offset >= 80
    fireEvent.scroll(screen.getByTestId('scrollview'), scrollEvent({ y: 80 }));
    expect(screen.getByTestId('status')).toHaveTextContent('visible');
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });
});
