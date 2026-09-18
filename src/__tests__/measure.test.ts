/**
 * Unit tests for the reference-resolution helpers.
 *
 * These are pure functions over duck-typed objects, so every case is written as
 * the literal shape React Native hands back — a `ScrollView` instance, a
 * `FlatList` instance that delegates to one, or a ref that holds neither.
 */

import { isMeasurable, resolveMeasurementReference } from '../measure';
import { readMeasuredRect } from '../geometry';

describe('isMeasurable', () => {
  it('accepts a value carrying a callable measureLayout', () => {
    expect(isMeasurable({ measureLayout: () => undefined })).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isMeasurable(null)).toBe(false);
    expect(isMeasurable(undefined)).toBe(false);
    expect(isMeasurable(42)).toBe(false);
    expect(isMeasurable('view')).toBe(false);
    expect(isMeasurable({})).toBe(false);
    expect(isMeasurable({ measureLayout: 'yes' })).toBe(false);
  });
});

describe('resolveMeasurementReference', () => {
  it('prefers the content container of a ScrollView instance', () => {
    const contentView = { id: 'content' };
    const outerView = { id: 'outer' };
    const instance = {
      getInnerViewRef: () => contentView,
      getNativeScrollRef: () => outerView,
    };

    expect(resolveMeasurementReference(instance)).toBe(contentView);
  });

  it('falls back to the outer scroll host when there is no content ref', () => {
    const outerView = { id: 'outer' };
    const instance = {
      getInnerViewRef: () => undefined,
      getNativeScrollRef: () => outerView,
    };

    expect(resolveMeasurementReference(instance)).toBe(outerView);
  });

  it('follows a FlatList through to its ScrollView, without looping', () => {
    const contentView = { id: 'content' };
    const scrollView: Record<string, unknown> = {
      getInnerViewRef: () => contentView,
    };
    // A ScrollView's own getScrollResponder returns itself; the walk must
    // terminate rather than recurse forever.
    scrollView.getScrollResponder = () => scrollView;
    const list = { getScrollResponder: () => scrollView };

    expect(resolveMeasurementReference(list)).toBe(contentView);
  });

  it('never uses a numeric node handle', () => {
    // Numeric handles are what getScrollableNode/getInnerViewNode return, and
    // the New Architecture rejects them outright (it logs and then calls
    // neither callback), so measurement has to be declined instead.
    const instance = {
      getInnerViewNode: () => 42,
      getScrollableNode: () => 42,
      getInnerViewRef: () => 42,
      getNativeScrollRef: () => 42,
    };

    expect(resolveMeasurementReference(instance)).toBeNull();
  });

  it('returns null for an unattached ref', () => {
    expect(resolveMeasurementReference(null)).toBeNull();
    expect(resolveMeasurementReference(undefined)).toBeNull();
    expect(resolveMeasurementReference({})).toBeNull();
  });

  it('swallows an accessor that throws', () => {
    const instance = {
      getInnerViewRef: () => {
        throw new Error('detached');
      },
      getNativeScrollRef: () => {
        throw new Error('detached');
      },
      getScrollResponder: () => {
        throw new Error('detached');
      },
    };

    expect(() => resolveMeasurementReference(instance)).not.toThrow();
    expect(resolveMeasurementReference(instance)).toBeNull();
  });

  it('stops walking after a bounded number of scroll responders', () => {
    // A pathological chain must not be followed indefinitely.
    const contentView = { id: 'content' };
    const chain = [0, 1, 2, 3, 4, 5].map(() => ({}) as Record<string, unknown>);
    chain.forEach((node, index) => {
      node.getScrollResponder = () => chain[index + 1];
    });
    chain[5].getInnerViewRef = () => contentView;

    expect(resolveMeasurementReference(chain[0])).toBeNull();
  });
});

describe('readMeasuredRect', () => {
  it('accepts a well-formed measurement', () => {
    expect(readMeasuredRect(0, 920, 300, 100)).toEqual({
      x: 0,
      y: 920,
      width: 300,
      height: 100,
    });
  });

  it('accepts negative coordinates, which a scrolled-past element reports', () => {
    expect(readMeasuredRect(-10, -400, 300, 100)).toEqual({
      x: -10,
      y: -400,
      width: 300,
      height: 100,
    });
  });

  it('rejects a measurement with any non-finite field', () => {
    expect(readMeasuredRect(Number.NaN, 0, 300, 100)).toBeNull();
    expect(readMeasuredRect(0, Number.POSITIVE_INFINITY, 300, 100)).toBeNull();
    expect(readMeasuredRect(0, 0, Number.NaN, 100)).toBeNull();
    expect(readMeasuredRect(0, 0, 300, Number.NaN)).toBeNull();
    expect(readMeasuredRect(undefined, 0, 300, 100)).toBeNull();
    expect(readMeasuredRect(0, '920', 300, 100)).toBeNull();
  });

  it('keeps a fully collapsed rectangle, which is a measurement not a failure', () => {
    // A tracked view hidden with `display: 'none'`, or emptied of its children,
    // lays out as 0x0 and reports it. Discarding it here would leave the last
    // good rectangle cached and latch an observer that is already `true`; the
    // caller decides what an empty rectangle means.
    expect(readMeasuredRect(0, 100, 0, 0)).toEqual({
      x: 0,
      y: 100,
      width: 0,
      height: 0,
    });
  });

  it('keeps a rectangle collapsed on one axis only', () => {
    // The active-axis decision belongs to computeIntersection, not here.
    expect(readMeasuredRect(0, 500, 300, 0)).toEqual({
      x: 0,
      y: 500,
      width: 300,
      height: 0,
    });
  });
});
