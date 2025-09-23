# API Reference

## Core Hook

### `useIntersectionObserver(options)`

The main hook that provides intersection detection functionality for React Native scroll components.

#### Parameters

| Parameter                      | Type                                                     | Default     | Description                                                 |
| ------------------------------ | -------------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `options.threshold`            | `number`                                                 | `20`        | Distance threshold in pixels for intersection detection     |
| `options.position`             | `'top' \| 'bottom' \| 'center' \| 'custom' \| 'element'` | `'bottom'`  | Position where intersection should be detected              |
| `options.element`              | `React.RefObject<View \| null>`                          | `undefined` | Element ref for position: 'element'                         |
| `options.onIntersect`          | `() => void`                                             | `undefined` | Callback when intersection starts (element becomes visible) |
| `options.onVisible`            | `() => void`                                             | `undefined` | Callback when intersection ends (element becomes hidden)    |
| `options.onIntersectionChange` | `(isIntersecting: boolean) => void`                      | `undefined` | Callback for any intersection change                        |

#### Returns

| Property              | Type                                                     | Description                            |
| --------------------- | -------------------------------------------------------- | -------------------------------------- |
| `isIntersecting`      | `boolean`                                                | Current intersection state             |
| `ref`                 | `React.RefObject<ScrollView \| FlatList \| SectionList>` | Ref for the scroll component           |
| `handleScroll`        | `(event: any) => void`                                   | Scroll event handler                   |
| `handleElementLayout` | `(event: any) => void`                                   | Layout handler for element positioning |
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
  onIntersect?: () => void;
  onVisible?: () => void;
  onIntersectionChange?: (isIntersecting: boolean) => void;
}
```

### `UseIntersectionObserverReturn`

```tsx
interface UseIntersectionObserverReturn {
  isIntersecting: boolean;
  ref: React.RefObject<ScrollView | FlatList | SectionList>;
  handleScroll: (event: any) => void;
  handleElementLayout: (event: any) => void;
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
