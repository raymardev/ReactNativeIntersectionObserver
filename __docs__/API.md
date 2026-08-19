# API Reference

## Core Hook

### `useIntersectionObserver(options)`

The main hook that provides intersection detection functionality for React Native scroll components.

#### Parameters

| Parameter                      | Type                                                     | Default     | Description                                                 |
| ------------------------------ | -------------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `options.threshold`            | `number`                                                 | `20`        | Distance threshold in density-independent points (dp)        |
| `options.position`             | `'top' \| 'bottom' \| 'center' \| 'custom' \| 'element'` | `'bottom'`  | Position where intersection should be detected              |
| `options.element`              | `React.RefObject<View \| null>`                          | `undefined` | Element ref for position: 'element'                         |
| `options.onIntersect`          | `() => void`                                             | `undefined` | Callback when intersection starts (element becomes visible) |
| `options.onVisible`            | `() => void`                                             | `undefined` | Callback when intersection ends (element becomes hidden)    |
| `options.onIntersectionChange` | `(isIntersecting: boolean) => void`                      | `undefined` | Callback for any intersection change                        |
| `options.horizontal`           | `boolean`                                                | `false`     | Track a horizontal scroll view; `top`/`bottom` become the start/end edge |
| `options.strategy`             | `'auto' \| 'native' \| 'scroll'`                         | `'auto'`    | How the intersection is computed. Only honoured for `position: 'element'` |
| `options.customPredicate`      | `(metrics: IntersectionMetrics) => boolean`              | `undefined` | Required by `position: 'custom'`; evaluated on every scroll event |

#### Returns

| Property              | Type                                                     | Description                            |
| --------------------- | -------------------------------------------------------- | -------------------------------------- |
| `isIntersecting`      | `boolean`                                                | Current intersection state             |
| `ref`                 | `React.RefObject<T \| null>`                             | Ref for the scroll component (`T` defaults to `ScrollView`) |
| `handleScroll`        | `(event: any) => void`                                   | Scroll event handler                   |
| `handleElementLayout` | `(event: any) => void`                                   | Layout handler for element positioning |
| `measureElement`      | `() => void`                                             | Re-measure the tracked element on demand (`position: 'element'`) |
| `reset`               | `() => void`                                             | Reset intersection state               |

#### Example

```tsx
import { useIntersectionObserver } from '@raymardev/react-native-intersection-observer';

const MyComponent = () => {
  const { isIntersecting, ref, handleScroll } = useIntersectionObserver({
    position: 'bottom',
    threshold: 50,
    onIntersect: () => console.log('Reached bottom!'),
    onIntersectionChange: intersecting =>
      console.log('Intersection:', intersecting),
  });

  return (
    <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
      {/* Your content */}
    </ScrollView>
  );
};
```

## Convenience Hooks

### `useScrollToBottom(threshold?, options?)`

Detects when the user has scrolled to the bottom of the scroll view.

#### Parameters

| Parameter           | Type                                          | Default        | Description                             |
| ------------------- | --------------------------------------------- | -------------- | --------------------------------------- |
| `threshold`         | `number`                                      | `20`           | Distance threshold for bottom detection |
| `options.type`      | `'scrollview' \| 'flatlist' \| 'sectionlist'` | `'scrollview'` | Type of scroll component                |
| `options.callbacks` | `Callbacks`                                   | `undefined`    | Callback functions                      |

#### Example

```tsx
import { useScrollToBottom } from '@raymardev/react-native-intersection-observer';

const { isIntersecting, ref, handleScroll } = useScrollToBottom(50, {
  type: 'flatlist',
  callbacks: {
    onIntersect: () => loadMoreData(),
  },
});
```

### `useScrollToTop(threshold?, options?)`

Detects when the user has scrolled to the top of the scroll view.

#### Parameters

| Parameter           | Type                                          | Default        | Description                          |
| ------------------- | --------------------------------------------- | -------------- | ------------------------------------ |
| `threshold`         | `number`                                      | `20`           | Distance threshold for top detection |
| `options.type`      | `'scrollview' \| 'flatlist' \| 'sectionlist'` | `'scrollview'` | Type of scroll component             |
| `options.callbacks` | `Callbacks`                                   | `undefined`    | Callback functions                   |

#### Example

```tsx
import { useScrollToTop } from '@raymardev/react-native-intersection-observer';

const { isIntersecting, ref, handleScroll } = useScrollToTop(10, {
  callbacks: {
    onIntersect: () => triggerPullToRefresh(),
  },
});
```

### `useScrollToCenter(threshold?, options?)`

Detects when the user has scrolled to the center of the scroll view.

#### Parameters

| Parameter           | Type                                          | Default        | Description                             |
| ------------------- | --------------------------------------------- | -------------- | --------------------------------------- |
| `threshold`         | `number`                                      | `20`           | Distance threshold for center detection |
| `options.type`      | `'scrollview' \| 'flatlist' \| 'sectionlist'` | `'scrollview'` | Type of scroll component                |
| `options.callbacks` | `Callbacks`                                   | `undefined`    | Callback functions                      |

#### Example

```tsx
import { useScrollToCenter } from '@raymardev/react-native-intersection-observer';

const { isIntersecting, ref, handleScroll } = useScrollToCenter(100, {
  callbacks: {
    onIntersect: () => showCenterIndicator(),
  },
});
```

### `useElementIntersection(element, threshold?, callbacks?)`

Detects when a specific element becomes visible in the scroll view.

#### Parameters

| Parameter   | Type                            | Default     | Description                              |
| ----------- | ------------------------------- | ----------- | ---------------------------------------- |
| `element`   | `React.RefObject<View \| null>` | -           | Element ref to track                     |
| `threshold` | `number`                        | `20`        | Distance threshold for element detection |
| `callbacks` | `Callbacks`                     | `undefined` | Callback functions                       |

#### Example

```tsx
import { useElementIntersection } from '@raymardev/react-native-intersection-observer';

const elementRef = useRef<View>(null);
const { isIntersecting, ref, handleScroll, handleElementLayout } =
  useElementIntersection(elementRef, 50, {
    onIntersect: () => console.log('Element is visible!'),
  });

return (
  <ScrollView ref={ref} onScroll={handleScroll}>
    <View ref={elementRef} onLayout={handleElementLayout}>
      <Text>Tracked element</Text>
    </View>
  </ScrollView>
);
```

## Types

### `IntersectionPosition`

```tsx
type IntersectionPosition = 'top' | 'bottom' | 'center' | 'custom' | 'element';
```

### `UseIntersectionObserverOptions`

```tsx
interface UseIntersectionObserverOptions {
  threshold?: number;
  position?: IntersectionPosition;
  element?: React.RefObject<View | null>;
  horizontal?: boolean;
  strategy?: IntersectionStrategy;
  customPredicate?: (metrics: IntersectionMetrics) => boolean;
  onIntersect?: () => void;
  onVisible?: () => void;
  onIntersectionChange?: (isIntersecting: boolean) => void;
}
```

### `UseIntersectionObserverReturn`

```tsx
interface UseIntersectionObserverReturn {
  isIntersecting: boolean;
  ref: React.RefObject<T | null>;
  handleScroll: (event: any) => void;
  handleElementLayout: (event: any) => void;
  measureElement: () => void;
  reset: () => void;
}
```

### `Callbacks`

```tsx
interface Callbacks {
  onIntersect?: () => void;
  onVisible?: () => void;
  onIntersectionChange?: (isIntersecting: boolean) => void;
}
```

### `IntersectionStrategy`

```tsx
type IntersectionStrategy = 'auto' | 'native' | 'scroll';
```

## Native IntersectionObserver

React Native 0.83 added a C++ `IntersectionObserver` on the New Architecture, but
it is gated behind a feature flag and only exists at the **canary** release
level. It is absent from stable React Native and from Expo.

This library never imports it. It is detected off `globalThis` at runtime, so the
package behaves identically whether or not the platform provides one.

**Only `position: 'element'` can use it.** `top`, `bottom` and `center` are
predicates over `contentOffset`, `contentSize` and `contentInset` — values an
`IntersectionObserverEntry` does not carry — and `custom` receives
`IntersectionMetrics`, which the native entry cannot supply. Those four positions
always use the scroll path.

| `strategy`  | Behaviour                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| `'auto'`    | Default. Uses the platform observer when one is available, otherwise falls back silently. |
| `'native'`  | Same selection as `'auto'`, but reports every reason for falling back through a development warning. |
| `'scroll'`  | Always uses the scroll-event path, on every runtime.                      |

On stable React Native and Expo there is no platform observer, so `'auto'` is
indistinguishable from `'scroll'`. Where one does exist, the native path differs
in two ways worth knowing before you rely on it:

- it reports an element that is **already visible shortly after mount**, rather
  than waiting for the first scroll event;
- its callbacks arrive **on a later tick**, rather than synchronously inside
  `onScroll`.

Pass `strategy: 'scroll'` if you need identical behaviour on every runtime.

```tsx
import {
  isNativeIntersectionObserverAvailable,
  setNativeIntersectionObserverOverride,
} from '@raymardev/react-native-intersection-observer';

// Whether the platform observer was detected.
isNativeIntersectionObserverAvailable(); // boolean

// Force the detection result. `false` disables the native path app-wide,
// a constructor injects one (used by tests), `null` restores detection.
setNativeIntersectionObserverOverride(false);
```

The scroll path remains the reference implementation: both paths are held to the
same observable contract, and the same tests run against each.

## Geometry primitives

These are exported for advanced use — building a custom predicate, or computing
an intersection outside a hook. They are pure functions with no React
dependency, and they are covered by semver like the rest of the public API.

| Export                | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `computeIntersection` | The decision function every position goes through              |
| `projectMetrics`      | Projects scroll metrics onto the active axis                   |
| `readScrollMetrics`   | Normalizes a raw scroll event into finite numbers              |
| `readElementLayout`   | Normalizes a raw layout event                                  |
| `readMeasuredRect`    | Normalizes a `measureLayout` result                            |
| `normalizeThreshold`  | Applies the default and rejects non-finite values              |
| `toFiniteNumber`      | Coerces an unknown value to a finite number                    |
| `DEFAULT_THRESHOLD`   | `20`                                                           |
| `DEFAULT_POSITION`    | `'bottom'`                                                     |

## Performance Considerations

- Use `scrollEventThrottle={16}` for smooth 60fps scroll events
- The hook automatically optimizes re-renders by only updating state when intersection status changes
- For large lists, consider using the convenience hooks which are optimized for specific use cases
- Element intersection tracking requires layout measurements, so use sparingly for performance

## Browser Compatibility

This library is designed for React Native and works with:

- React Native 0.60+
- React 16.8+ (hooks support required)
- iOS and Android platforms
- Expo managed workflow
