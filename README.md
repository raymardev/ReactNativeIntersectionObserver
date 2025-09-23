# React Native Intersection Observer

<div align="center">

![npm version](https://img.shields.io/npm/v/react-native-intersection-observer)
![npm downloads](https://img.shields.io/npm/dm/react-native-intersection-observer)
![License](https://img.shields.io/npm/l/react-native-intersection-observer)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![React Native](https://img.shields.io/badge/React%20Native-0.60%2B-lightblue)

A powerful and flexible React Native hook for detecting scroll intersections with ScrollView, FlatList, and SectionList components. This library provides an easy-to-use API similar to the web's Intersection Observer API, but specifically designed for React Native's scroll components.

[📖 Documentation](__docs__/API.md) • [💡 Examples](__docs__/EXAMPLES.md) • [🐛 Issues](https://github.com/raymardev/ReactNativeIntersectionObserver/issues) • [💬 Discussions](https://github.com/raymardev/ReactNativeIntersectionObserver/discussions)

</div>

## ✨ Features

- 🎯 **Multiple Detection Positions**: Detect intersections at top, bottom, center, or custom element positions
- 📱 **Cross-Platform**: Works with ScrollView, FlatList, and SectionList components
- 🔧 **TypeScript Support**: Full TypeScript support with comprehensive type definitions
- ⚡ **Performance Optimized**: Efficient scroll event handling with minimal re-renders
- 🎨 **Flexible API**: Multiple convenience hooks for common use cases
- 📊 **Custom Thresholds**: Configurable intersection thresholds
- 🔄 **Callback Support**: Rich callback system for intersection events
- 🚀 **Zero Dependencies**: No external dependencies, lightweight and fast
- 📚 **Comprehensive Docs**: Detailed documentation and examples

## 📦 Installation

```bash
npm install react-native-intersection-observer
```

or

```bash
yarn add react-native-intersection-observer
```

### Requirements

- React Native 0.60+
- React 16.8+ (hooks support required)
- TypeScript 4.0+ (optional but recommended)

## 🚀 Quick Start

```tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useScrollToBottom } from 'react-native-intersection-observer';

export default function App() {
  const { isIntersecting, ref, handleScroll } = useScrollToBottom(50, {
    type: 'scrollview',
    callbacks: {
      onIntersect: () => console.log('Reached bottom!'),
      onVisible: () => console.log('Left bottom area'),
    },
  });

  return (
    <ScrollView
      ref={ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={{ height: 2000 }}>
        <Text>Scroll to bottom to trigger intersection</Text>
        {isIntersecting && <Text>🎉 You reached the bottom!</Text>}
      </View>
    </ScrollView>
  );
}
```

## 📚 Documentation

- **[API Reference](__docs__/API.md)** - Complete API documentation
- **[Examples](__docs__/EXAMPLES.md)** - Comprehensive examples and use cases
- **[Contributing](__docs__/CONTRIBUTING.md)** - How to contribute to this project
- **[Troubleshooting](__docs__/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Changelog](__docs__/CHANGELOG.md)** - Version history and changes

## 🔧 API Reference

### Core Hook

#### `useIntersectionObserver(options)`

The main hook that provides intersection detection functionality.

**Parameters:**
- `options` (object):
  - `threshold?: number` - Distance threshold for intersection detection (default: 20)
  - `position?: 'top' | 'bottom' | 'center' | 'custom' | 'element'` - Position to detect (default: 'bottom')
  - `element?: React.RefObject<View>` - Element ref for position: 'element'
  - `onIntersect?: () => void` - Callback when intersection starts
  - `onVisible?: () => void` - Callback when intersection ends
  - `onIntersectionChange?: (isIntersecting: boolean) => void` - Callback for any intersection change

**Returns:**
- `isIntersecting: boolean` - Current intersection state
- `ref: React.RefObject<ScrollView | FlatList | SectionList>` - Ref for the scroll component
- `handleScroll: (event: any) => void` - Scroll event handler
- `handleElementLayout: (event: any) => void` - Layout handler for element positioning
- `reset: () => void` - Reset intersection state

### Convenience Hooks

#### `useScrollToBottom(threshold?, options?)`

Detects when the user has scrolled to the bottom of the scroll view.

```tsx
const { isIntersecting, ref, handleScroll } = useScrollToBottom(50, {
  type: 'scrollview', // or 'flatlist', 'sectionlist'
  callbacks: {
    onIntersect: () => console.log('Bottom reached!'),
  },
});
```

#### `useScrollToTop(threshold?, options?)`

Detects when the user has scrolled to the top of the scroll view.

```tsx
const { isIntersecting, ref, handleScroll } = useScrollToTop(50, {
  type: 'flatlist',
  callbacks: {
    onIntersect: () => console.log('Top reached!'),
  },
});
```

#### `useScrollToCenter(threshold?, options?)`

Detects when the user has scrolled to the center of the scroll view.

```tsx
const { isIntersecting, ref, handleScroll } = useScrollToCenter(100, {
  type: 'sectionlist',
  callbacks: {
    onIntersect: () => console.log('Center reached!'),
  },
});
```

#### `useElementIntersection(element, threshold?, callbacks?)`

Detects when a specific element becomes visible in the scroll view.

```tsx
const elementRef = useRef<View>(null);
const { isIntersecting, ref, handleScroll, handleElementLayout } = useElementIntersection(
  elementRef,
  50,
  {
    onIntersect: () => console.log('Element is visible!'),
  }
);

return (
  <ScrollView ref={ref} onScroll={handleScroll}>
    <View ref={elementRef} onLayout={handleElementLayout}>
      <Text>This element will be tracked</Text>
    </View>
  </ScrollView>
);
```

## 💡 Common Use Cases

### Infinite Scroll with FlatList

```tsx
import React, { useState, useCallback } from 'react';
import { FlatList, View, Text, ActivityIndicator } from 'react-native';
import { useScrollToBottom } from 'react-native-intersection-observer';

export default function InfiniteScrollList() {
  const [data, setData] = useState(Array.from({ length: 20 }, (_, i) => ({ id: i, text: `Item ${i}` })));
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading) return;
    
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newData = Array.from({ length: 10 }, (_, i) => ({
      id: data.length + i,
      text: `Item ${data.length + i}`,
    }));
    
    setData(prev => [...prev, ...newData]);
    setLoading(false);
  }, [data.length, loading]);

  const { ref, handleScroll } = useScrollToBottom(100, {
    type: 'flatlist',
    callbacks: {
      onIntersect: loadMore,
    },
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={{ padding: 20, borderBottomWidth: 1 }}>
      <Text>{item.text}</Text>
    </View>
  );

  const renderFooter = () => (
    loading ? <ActivityIndicator style={{ padding: 20 }} /> : null
  );

  return (
    <FlatList
      ref={ref}
      data={data}
      renderItem={renderItem}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      ListFooterComponent={renderFooter}
    />
  );
}
```

### Pull-to-Refresh Detection

```tsx
import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useScrollToTop } from 'react-native-intersection-observer';

export default function PullToRefresh() {
  const { isIntersecting, ref, handleScroll } = useScrollToTop(10, {
    type: 'scrollview',
    callbacks: {
      onIntersect: () => {
        console.log('Ready for pull-to-refresh!');
        // Trigger your refresh logic here
      },
    },
  });

  return (
    <ScrollView
      ref={ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={{ height: 2000 }}>
        <Text>Pull down to refresh</Text>
        {isIntersecting && <Text>🔄 Ready to refresh!</Text>}
      </View>
    </ScrollView>
  );
}
```

### Element Visibility Tracking

```tsx
import React, { useRef } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useElementIntersection } from 'react-native-intersection-observer';

export default function ElementTracking() {
  const targetRef = useRef<View>(null);
  
  const { isIntersecting, ref, handleScroll, handleElementLayout } = useElementIntersection(
    targetRef,
    50,
    {
      onIntersect: () => console.log('Target element is visible!'),
      onVisible: () => console.log('Target element is hidden!'),
    }
  );

  return (
    <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
      <View style={{ height: 1000 }}>
        <Text>Scroll down to see the target element</Text>
      </View>
      
      <View 
        ref={targetRef} 
        onLayout={handleElementLayout}
        style={{ 
          height: 200, 
          backgroundColor: isIntersecting ? '#4CAF50' : '#FF5722',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Text style={{ color: 'white', fontSize: 18 }}>
          {isIntersecting ? 'I am visible! 🎉' : 'I am hidden 👻'}
        </Text>
      </View>
      
      <View style={{ height: 1000 }}>
        <Text>More content below</Text>
      </View>
    </ScrollView>
  );
}
```

## ⚡ Performance Considerations

- Use `scrollEventThrottle={16}` for smooth 60fps scroll events
- The hook automatically optimizes re-renders by only updating state when intersection status changes
- For large lists, consider using the convenience hooks which are optimized for specific use cases
- Element intersection tracking requires layout measurements, so use sparingly for performance

## 🔧 TypeScript Support

This library is written in TypeScript and provides full type definitions. All hooks and their parameters are fully typed for the best development experience.

```tsx
import { 
  useIntersectionObserver, 
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn 
} from 'react-native-intersection-observer';

const options: UseIntersectionObserverOptions = {
  threshold: 50,
  position: 'bottom',
  onIntersect: () => console.log('Intersected!'),
};

const result: UseIntersectionObserverReturn = useIntersectionObserver(options);
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](__docs__/CONTRIBUTING.md) for details on how to get started.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit your changes: `git commit -m 'feat: add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 🐛 Issues & Support

- **Bug Reports**: [Open an issue](https://github.com/raymardev/ReactNativeIntersectionObserver/issues)
- **Feature Requests**: [Start a discussion](https://github.com/raymardev/ReactNativeIntersectionObserver/discussions)
- **Questions**: [Join the discussion](https://github.com/raymardev/ReactNativeIntersectionObserver/discussions)
- **Troubleshooting**: Check our [Troubleshooting Guide](__docs__/TROUBLESHOOTING.md)

## 📄 License

MIT © [Ray Martin](https://github.com/raymardev)

## 📈 Changelog

See [CHANGELOG.md](__docs__/CHANGELOG.md) for a complete list of changes.

### Recent Updates

- **v1.0.0** - Initial release with full feature set
- Comprehensive documentation and examples
- TypeScript support with full type definitions
- Performance optimizations
- Cross-platform compatibility

---

<div align="center">

**⭐ Star this repository if you find it helpful!**

Made with ❤️ by [Ray Martin](https://github.com/raymardev)

</div>
