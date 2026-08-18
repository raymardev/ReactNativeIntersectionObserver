/**
 * Behavioural tests for the intersection math and the event parsers.
 *
 * These exercise the exported predicate directly, so every boundary is pinned
 * by a matched pair (`at the threshold` / `one point outside it`) — a single
 * one-sided case would pass against `<`, `<=` and `>=` alike and pin nothing.
 *
 * This suite imports nothing from `react`, so it is the part of the library
 * that is verifiable in this repo today.
 */

import {
  DEFAULT_POSITION,
  DEFAULT_THRESHOLD,
  computeIntersection,
  normalizeThreshold,
  projectMetrics,
  readElementLayout,
  readScrollMetrics,
  toFiniteNumber,
} from '../geometry';
import type { IntersectionGeometryConfig } from '../geometry';
import type { IntersectionMetrics, ScrollMetrics } from '../types';

import {
  CENTERED_OFFSET,
  MAX_OFFSET,
  layoutEvent,
  scrollEvent,
} from './support/events';
import type { ScrollEventInit } from './support/events';

/** Parse a fixture into metrics, failing loudly if the fixture is unreadable. */
function metrics(init: ScrollEventInit = {}): ScrollMetrics {
  const parsed = readScrollMetrics(scrollEvent(init));
  if (parsed === null) {
    throw new Error('fixture produced an unreadable scroll event');
  }
  return parsed;
}

/** Evaluate a position against a fixture. */
function at(
  init: ScrollEventInit,
  config: IntersectionGeometryConfig
): boolean | null {
  return computeIntersection(metrics(init), config, null);
}

describe('module defaults', () => {
  it('matches the documented defaults', () => {
    expect(DEFAULT_THRESHOLD).toBe(20);
    expect(DEFAULT_POSITION).toBe('bottom');
  });
});

describe('toFiniteNumber', () => {
  it('passes finite numbers through, including zero and negatives', () => {
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-42.5)).toBe(-42.5);
  });

  it('replaces every non-finite or non-numeric value with the fallback', () => {
    expect(toFiniteNumber(Number.NaN)).toBe(0);
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber('800')).toBe(0);
    expect(toFiniteNumber({})).toBe(0);
    expect(toFiniteNumber(Number.NaN, 7)).toBe(7);
  });
});

describe('normalizeThreshold', () => {
  it('falls back to the default only for non-finite values', () => {
    expect(normalizeThreshold(undefined)).toBe(20);
    expect(normalizeThreshold(Number.NaN)).toBe(20);
    expect(normalizeThreshold(Number.POSITIVE_INFINITY)).toBe(20);
  });

  it('honours zero rather than treating it as "unset"', () => {
    expect(normalizeThreshold(0)).toBe(0);
  });

  it('honours negative thresholds ("require overscrolling past the edge")', () => {
    expect(normalizeThreshold(-10)).toBe(-10);
  });
});

describe('readScrollMetrics', () => {
  it('returns null for anything that is not a scroll event', () => {
    expect(readScrollMetrics(undefined)).toBeNull();
    expect(readScrollMetrics(null)).toBeNull();
    expect(readScrollMetrics(42)).toBeNull();
    expect(readScrollMetrics('scroll')).toBeNull();
    expect(readScrollMetrics({})).toBeNull();
    expect(readScrollMetrics({ nativeEvent: null })).toBeNull();
    expect(readScrollMetrics({ nativeEvent: {} })).toBeNull();
  });

  it('returns null when any of the three measurement blocks is missing', () => {
    const full = scrollEvent({ y: 100 }).nativeEvent;
    expect(
      readScrollMetrics({
        nativeEvent: {
          contentOffset: full.contentOffset,
          contentSize: full.contentSize,
        },
      })
    ).toBeNull();
    expect(
      readScrollMetrics({
        nativeEvent: {
          contentOffset: full.contentOffset,
          layoutMeasurement: full.layoutMeasurement,
        },
      })
    ).toBeNull();
    expect(
      readScrollMetrics({
        nativeEvent: {
          layoutMeasurement: full.layoutMeasurement,
          contentSize: full.contentSize,
        },
      })
    ).toBeNull();
  });

  it('defaults a missing contentInset to zeroes (the Android case)', () => {
    expect(metrics().contentInset).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });

  it('copies the numbers out rather than retaining the event object', () => {
    const event = scrollEvent({ y: 100 });
    const parsed = readScrollMetrics(event) as ScrollMetrics;

    expect(parsed.contentOffset).not.toBe(event.nativeEvent.contentOffset);
    event.nativeEvent.contentOffset.y = 999;
    expect(parsed.contentOffset.y).toBe(100);
  });

  it('coerces NaN, Infinity and non-numeric fields to zero', () => {
    const parsed = readScrollMetrics({
      nativeEvent: {
        contentOffset: { x: Number.NaN, y: '1200' },
        layoutMeasurement: { width: null, height: Number.POSITIVE_INFINITY },
        contentSize: { width: undefined, height: 2000 },
      },
    }) as ScrollMetrics;

    expect(parsed).toEqual({
      contentOffset: { x: 0, y: 0 },
      layoutMeasurement: { width: 0, height: 0 },
      contentSize: { width: 0, height: 2000 },
      contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  });
});

describe('readElementLayout', () => {
  it('returns null for anything that is not a layout event', () => {
    expect(readElementLayout(undefined)).toBeNull();
    expect(readElementLayout(null)).toBeNull();
    expect(readElementLayout('layout')).toBeNull();
    expect(readElementLayout({})).toBeNull();
    expect(readElementLayout({ nativeEvent: {} })).toBeNull();
    expect(readElementLayout({ nativeEvent: { layout: null } })).toBeNull();
  });

  it('normalizes a real layout rectangle', () => {
    expect(
      readElementLayout(
        layoutEvent({ x: 10, y: 1000, width: 300, height: 120 })
      )
    ).toEqual({ x: 10, y: 1000, width: 300, height: 120 });
  });

  it('coerces non-finite rectangle fields to zero', () => {
    expect(
      readElementLayout({
        nativeEvent: {
          layout: { x: Number.NaN, y: 500, width: '300', height: 100 },
        },
      })
    ).toEqual({ x: 0, y: 500, width: 0, height: 100 });
  });
});

describe('projectMetrics', () => {
  it('projects onto the y axis and precomputes the three distances', () => {
    const projected = projectMetrics(metrics({ y: 1180 }), 20, false);

    expect(projected.offset).toBe(1180);
    expect(projected.viewport).toBe(800);
    expect(projected.content).toBe(2000);
    expect(projected.threshold).toBe(20);
    expect(projected.horizontal).toBe(false);
    expect(projected.distanceFromStart).toBe(1180);
    expect(projected.distanceToEnd).toBe(20);
    expect(projected.distanceFromCenter).toBe(580);
  });

  it('projects onto the x axis when horizontal', () => {
    const projected = projectMetrics(
      metrics({ x: 1580, contentW: 2000, layoutW: 400 }),
      20,
      true
    );

    expect(projected.offset).toBe(1580);
    expect(projected.viewport).toBe(400);
    expect(projected.content).toBe(2000);
    expect(projected.distanceToEnd).toBe(20);
  });

  it('folds contentInset into the start and end distances', () => {
    const projected = projectMetrics(
      metrics({ y: 1180, inset: { top: 60, bottom: 50 } }),
      20,
      false
    );

    expect(projected.distanceFromStart).toBe(1240);
    expect(projected.distanceToEnd).toBe(70);
  });
});

describe('measurement guard', () => {
  it('returns null (no decision) for a zero-height viewport', () => {
    expect(at({ layoutH: 0 }, { position: 'bottom' })).toBeNull();
    expect(at({ layoutH: 0 }, { position: 'top' })).toBeNull();
    expect(at({ layoutH: 0 }, { position: 'center' })).toBeNull();
  });

  it('returns null (no decision) for zero content, as an empty list reports', () => {
    // This is the mount-time event an empty FlatList emits. Without the guard
    // the bottom predicate reads 0 <= 20 and fires a phantom page load.
    expect(at({ contentH: 0 }, { position: 'bottom' })).toBeNull();
    expect(at({ contentH: 0 }, { position: 'top' })).toBeNull();
  });

  it('guards on the projected axis, not always on height', () => {
    expect(
      at(
        { contentW: 0, contentH: 2000 },
        { position: 'bottom', horizontal: true }
      )
    ).toBeNull();
    expect(
      at({ contentW: 0, contentH: 2000 }, { position: 'bottom' })
    ).not.toBeNull();
  });
});

describe("position 'bottom'", () => {
  const bottom: IntersectionGeometryConfig = { position: 'bottom' };

  it('is the default when no position is given', () => {
    expect(at({ y: MAX_OFFSET }, {})).toBe(true);
    expect(at({ y: 0 }, {})).toBe(false);
  });

  it('is true exactly at the threshold and false one point outside it', () => {
    // distanceToEnd = 2000 - (1180 + 800) = 20
    expect(at({ y: 1180 }, bottom)).toBe(true);
    expect(at({ y: 1179 }, bottom)).toBe(false);
  });

  it('is true when scrolled fully to the end', () => {
    expect(at({ y: MAX_OFFSET }, bottom)).toBe(true);
  });

  it('stays true while rubber-banding past the end (negative distance)', () => {
    // A `distance >= 0 && distance <= threshold` implementation flips to false
    // here, which is the classic "infinite scroll stops firing" bug.
    expect(at({ y: 1250 }, bottom)).toBe(true);
    expect(at({ y: 5000 }, bottom)).toBe(true);
  });

  it('honours a threshold of 0 instead of falling back to 20', () => {
    const exact: IntersectionGeometryConfig = {
      position: 'bottom',
      threshold: 0,
    };
    expect(at({ y: MAX_OFFSET }, exact)).toBe(true);
    expect(at({ y: MAX_OFFSET - 1 }, exact)).toBe(false);
  });

  it('honours a negative threshold as "require overscrolling past the end"', () => {
    const past: IntersectionGeometryConfig = {
      position: 'bottom',
      threshold: -10,
    };
    expect(at({ y: MAX_OFFSET }, past)).toBe(false);
    expect(at({ y: MAX_OFFSET + 10 }, past)).toBe(true);
  });

  it('falls back to the default threshold for a non-finite threshold', () => {
    expect(at({ y: 1180 }, { position: 'bottom', threshold: Number.NaN })).toBe(
      true
    );
    expect(at({ y: 1179 }, { position: 'bottom', threshold: Number.NaN })).toBe(
      false
    );
  });

  it('is true when the content is shorter than the viewport', () => {
    // Nothing to scroll: the user is already looking at the end, which is what
    // FlatList's own onEndReached reports too.
    expect(at({ y: 0, contentH: 400 }, bottom)).toBe(true);
  });

  it('folds the iOS bottom contentInset into the distance', () => {
    expect(at({ y: 1180, inset: { bottom: 50 } }, bottom)).toBe(false);
    expect(at({ y: 1230, inset: { bottom: 50 } }, bottom)).toBe(true);
  });

  it('measures the x axis when horizontal', () => {
    const horizontal: IntersectionGeometryConfig = {
      position: 'bottom',
      horizontal: true,
    };
    const wide: ScrollEventInit = {
      contentW: 2000,
      layoutW: 400,
      contentH: 2000,
    };

    expect(at({ ...wide, x: 1580 }, horizontal)).toBe(true);
    expect(at({ ...wide, x: 1579 }, horizontal)).toBe(false);
    // The same event on the vertical axis is nowhere near the end.
    expect(at({ ...wide, x: 1580 }, { position: 'bottom' })).toBe(false);
  });
});

describe("position 'top'", () => {
  const top: IntersectionGeometryConfig = { position: 'top' };

  it('is true at rest at the very top', () => {
    expect(at({ y: 0 }, top)).toBe(true);
  });

  it('is true exactly at the threshold and false one point past it', () => {
    expect(at({ y: 20 }, top)).toBe(true);
    expect(at({ y: 21 }, top)).toBe(false);
  });

  it('stays true while pull-to-refresh overscrolls above the top', () => {
    // The predicate is deliberately one-sided: Math.abs(offset) <= threshold
    // would report false at the exact moment the user is furthest past the top.
    expect(at({ y: -60 }, top)).toBe(true);
    expect(at({ y: -400 }, top)).toBe(true);
  });

  it('honours a threshold of 0', () => {
    const exact: IntersectionGeometryConfig = { position: 'top', threshold: 0 };
    expect(at({ y: 0 }, exact)).toBe(true);
    expect(at({ y: 1 }, exact)).toBe(false);
  });

  it('folds the iOS top contentInset in, so the resting offset counts as the top', () => {
    // Under a RefreshControl the resting offset is -contentInset.top, not 0.
    const inset = { top: 60 };
    expect(at({ y: -60, inset }, top)).toBe(true);
    expect(at({ y: -30, inset }, top)).toBe(false);
  });

  it('is true when the content is shorter than the viewport', () => {
    expect(at({ y: 0, contentH: 400 }, top)).toBe(true);
  });

  it('measures the x axis when horizontal', () => {
    const wide: ScrollEventInit = { contentW: 2000, layoutW: 400 };
    expect(
      at({ ...wide, x: 20, y: 900 }, { position: 'top', horizontal: true })
    ).toBe(true);
    expect(
      at({ ...wide, x: 21, y: 900 }, { position: 'top', horizontal: true })
    ).toBe(false);
  });
});

describe("position 'center'", () => {
  const center: IntersectionGeometryConfig = { position: 'center' };

  it('is true when the viewport centre sits on the content centre', () => {
    // |(600 + 400) - 1000| = 0
    expect(at({ y: CENTERED_OFFSET }, center)).toBe(true);
  });

  it('is symmetric: true at +/- the threshold, false one point beyond either', () => {
    expect(at({ y: 620 }, center)).toBe(true);
    expect(at({ y: 621 }, center)).toBe(false);
    expect(at({ y: 580 }, center)).toBe(true);
    expect(at({ y: 579 }, center)).toBe(false);
  });

  it('is false at both ends of the content', () => {
    expect(at({ y: 0 }, center)).toBe(false);
    expect(at({ y: MAX_OFFSET }, center)).toBe(false);
  });

  it('honours a threshold of 0', () => {
    const exact: IntersectionGeometryConfig = {
      position: 'center',
      threshold: 0,
    };
    expect(at({ y: CENTERED_OFFSET }, exact)).toBe(true);
    expect(at({ y: CENTERED_OFFSET + 1 }, exact)).toBe(false);
  });

  it('is always true when the content cannot scroll', () => {
    expect(at({ y: 0, contentH: 300 }, center)).toBe(true);
    expect(at({ y: 0, contentH: 800 }, center)).toBe(true);
  });

  it('deliberately ignores contentInset, unlike top and bottom', () => {
    expect(
      at({ y: CENTERED_OFFSET, inset: { top: 60, bottom: 50 } }, center)
    ).toBe(true);
  });

  it('measures the x axis when horizontal', () => {
    const wide: ScrollEventInit = { contentW: 2000, layoutW: 400 };
    const centeredX = 2000 / 2 - 400 / 2;
    expect(
      at({ ...wide, x: centeredX }, { position: 'center', horizontal: true })
    ).toBe(true);
    expect(
      at(
        { ...wide, x: centeredX + 21 },
        { position: 'center', horizontal: true }
      )
    ).toBe(false);
  });
});

describe("position 'element'", () => {
  const element: IntersectionGeometryConfig = { position: 'element' };
  const rect = { x: 0, y: 1000, width: 300, height: 100 };

  it('returns null (no decision) before any layout has been captured', () => {
    expect(computeIntersection(metrics({ y: 0 }), element, null)).toBeNull();
  });

  it('returns null for a fully degenerate rectangle', () => {
    expect(
      computeIntersection(metrics({ y: 0 }), element, {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      })
    ).toBeNull();
  });

  it('is false while the element is below the expanded viewport', () => {
    // viewport ends at 800; the threshold expands it to 820; the element starts
    // at 1000.
    expect(computeIntersection(metrics({ y: 0 }), element, rect)).toBe(false);
  });

  it('becomes true exactly when the element reaches the expanded viewport edge', () => {
    // The threshold expands the viewport, so detection fires `threshold` points
    // BEFORE the element is on screen: 1000 <= offset + 800 + 20 => offset >= 180.
    expect(computeIntersection(metrics({ y: 180 }), element, rect)).toBe(true);
    expect(computeIntersection(metrics({ y: 179 }), element, rect)).toBe(false);
  });

  it('counts any overlap, not full visibility', () => {
    expect(computeIntersection(metrics({ y: 250 }), element, rect)).toBe(true);
    expect(computeIntersection(metrics({ y: 1000 }), element, rect)).toBe(true);
  });

  it('becomes false again once the element passes above the expanded viewport', () => {
    // element end 1100 >= offset - 20 => offset <= 1120
    expect(computeIntersection(metrics({ y: 1120 }), element, rect)).toBe(true);
    expect(computeIntersection(metrics({ y: 1121 }), element, rect)).toBe(
      false
    );
  });

  it('honours a threshold of 0 as "the element touches the viewport"', () => {
    const exact: IntersectionGeometryConfig = {
      position: 'element',
      threshold: 0,
    };
    expect(computeIntersection(metrics({ y: 200 }), exact, rect)).toBe(true);
    expect(computeIntersection(metrics({ y: 199 }), exact, rect)).toBe(false);
  });

  it('honours a negative threshold as "the element must be that far inside"', () => {
    const inset: IntersectionGeometryConfig = {
      position: 'element',
      threshold: -50,
    };
    expect(computeIntersection(metrics({ y: 250 }), inset, rect)).toBe(true);
    expect(computeIntersection(metrics({ y: 249 }), inset, rect)).toBe(false);
  });

  it('reports a collapsed (zero-height) element as intersecting — known quirk', () => {
    // The degenerate guard requires BOTH width and height to be non-positive,
    // so a view collapsed to height 0 in a vertical list still counts as
    // visible. Pinned here so the behaviour cannot change silently; arguably it
    // should be false on the projected axis.
    expect(
      computeIntersection(metrics({ y: 0 }), element, {
        x: 0,
        y: 500,
        width: 300,
        height: 0,
      })
    ).toBe(true);
  });

  it('checks only the active axis', () => {
    const horizontal: IntersectionGeometryConfig = {
      position: 'element',
      horizontal: true,
    };
    const wide: ScrollEventInit = { contentW: 2000, layoutW: 400 };
    const wideRect = { x: 1000, y: 0, width: 100, height: 300 };

    // 1000 <= x + 400 + 20 => x >= 580
    expect(
      computeIntersection(metrics({ ...wide, x: 580 }), horizontal, wideRect)
    ).toBe(true);
    expect(
      computeIntersection(metrics({ ...wide, x: 579 }), horizontal, wideRect)
    ).toBe(false);
  });
});

describe("position 'custom'", () => {
  it('is false and warns through the injected sink when no predicate is supplied', () => {
    const warn = jest.fn();
    const config: IntersectionGeometryConfig = { position: 'custom', warn };

    expect(at({ y: 0 }, config)).toBe(false);
    expect(at({ y: MAX_OFFSET }, config)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('customPredicate');
  });

  it('does not throw when no predicate and no warn sink are supplied', () => {
    expect(() => at({ y: 0 }, { position: 'custom' })).not.toThrow();
    expect(at({ y: 0 }, { position: 'custom' })).toBe(false);
  });

  it('delegates the decision to the predicate', () => {
    const config: IntersectionGeometryConfig = {
      position: 'custom',
      threshold: 100,
      customPredicate: (m: IntersectionMetrics) => m.offset > 500,
    };

    expect(at({ y: 501 }, config)).toBe(true);
    expect(at({ y: 500 }, config)).toBe(false);
  });

  it('hands the predicate fully projected metrics', () => {
    const seen: IntersectionMetrics[] = [];
    at(
      { y: 1180 },
      {
        position: 'custom',
        threshold: 20,
        customPredicate: (m: IntersectionMetrics) => {
          seen.push(m);
          return false;
        },
      }
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      offset: 1180,
      viewport: 800,
      content: 2000,
      threshold: 20,
      horizontal: false,
      distanceToEnd: 20,
      distanceFromStart: 1180,
    });
    expect(seen[0].contentOffset).toEqual({ x: 0, y: 1180 });
  });

  it('coerces a truthy non-boolean result to false', () => {
    const config: IntersectionGeometryConfig = {
      position: 'custom',
      customPredicate: (() => 'yes') as unknown as (
        m: IntersectionMetrics
      ) => boolean,
    };

    expect(at({ y: 0 }, config)).toBe(false);
  });

  it('is still gated by the measurement guard', () => {
    const customPredicate = jest.fn(() => true);
    expect(
      at({ contentH: 0 }, { position: 'custom', customPredicate })
    ).toBeNull();
    expect(customPredicate).not.toHaveBeenCalled();
  });
});
