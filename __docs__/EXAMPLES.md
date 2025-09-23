# Examples

This document provides comprehensive examples of how to use `react-native-intersection-observer` in various scenarios.

## Basic Usage

### Simple Bottom Detection

```tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useScrollToBottom } from 'react-native-intersection-observer';

export default function BasicExample() {
  const { isIntersecting, ref, handleScroll } = useScrollToBottom(50, {
    type: 'scrollview',
    callbacks: {
      onIntersect: () => console.log('Reached bottom!'),
    },
  });

  return (
    <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
      <View style={{ height: 2000 }}>
        <Text>Scroll to bottom to trigger intersection</Text>
        {isIntersecting && <Text>🎉 You reached the bottom!</Text>}
      </View>
    </ScrollView>
  );
}
```

## Advanced Examples

### Infinite Scroll with FlatList

```tsx
import React, { useState, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useScrollToBottom } from 'react-native-intersection-observer';

interface Item {
  id: number;
  text: string;
}

export default function InfiniteScrollExample() {
  const [data, setData] = useState<Item[]>(
    Array.from({ length: 20 }, (_, i) => ({ id: i, text: `Item ${i}` }))
  );
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

  const renderItem = ({ item }: { item: Item }) => (
    <View style={styles.item}>
      <Text style={styles.itemText}>{item.text}</Text>
    </View>
  );

  const renderFooter = () =>
    loading ? <ActivityIndicator style={styles.loader} /> : null;

  return (
    <FlatList
      ref={ref}
      data={data}
      renderItem={renderItem}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      ListFooterComponent={renderFooter}
      keyExtractor={item => item.id.toString()}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemText: {
    fontSize: 16,
  },
  loader: {
    padding: 20,
  },
});
```

### Pull-to-Refresh Detection

```tsx
import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useScrollToTop } from 'react-native-intersection-observer';

export default function PullToRefreshExample() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const { isIntersecting, ref, handleScroll } = useScrollToTop(10, {
    type: 'scrollview',
    callbacks: {
      onIntersect: () => {
        console.log('Ready for pull-to-refresh!');
      },
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRefreshCount(prev => prev + 1);
    setRefreshing(false);
  }, []);

  return (
    <ScrollView
      ref={ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.container}>
        <Text style={styles.title}>Pull to Refresh Example</Text>
        <Text style={styles.subtitle}>
          Pull down to refresh (refresh count: {refreshCount})
        </Text>
        {isIntersecting && (
          <Text style={styles.indicator}>🔄 Ready to refresh!</Text>
        )}
        <View style={{ height: 2000 }}>
          <Text>Scroll content...</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
  },
  indicator: {
    fontSize: 18,
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 20,
  },
});
```

### Element Visibility Tracking

```tsx
import React, { useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useElementIntersection } from 'react-native-intersection-observer';

export default function ElementTrackingExample() {
  const targetRef = useRef<View>(null);
  const [visibilityCount, setVisibilityCount] = useState(0);

  const { isIntersecting, ref, handleScroll, handleElementLayout } =
    useElementIntersection(targetRef, 50, {
      onIntersect: () => {
        setVisibilityCount(prev => prev + 1);
        console.log('Target element is visible!');
      },
      onVisible: () => console.log('Target element is hidden!'),
    });

  return (
    <ScrollView ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
      <View style={styles.container}>
        <Text style={styles.title}>Element Visibility Tracking</Text>
        <Text style={styles.subtitle}>Visibility count: {visibilityCount}</Text>

        <View style={{ height: 1000 }}>
          <Text>Scroll down to see the target element</Text>
        </View>

        <View
          ref={targetRef}
          onLayout={handleElementLayout}
          style={[
            styles.targetElement,
            { backgroundColor: isIntersecting ? '#4CAF50' : '#FF5722' },
          ]}
        >
          <Text style={styles.targetText}>
            {isIntersecting ? 'I am visible! 🎉' : 'I am hidden 👻'}
          </Text>
        </View>

        <View style={{ height: 1000 }}>
          <Text>More content below</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
  },
  targetElement: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginVertical: 20,
  },
  targetText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

### Multi-Position Detection

```tsx
import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useIntersectionObserver } from 'react-native-intersection-observer';

export default function MultiPositionExample() {
  const topObserver = useIntersectionObserver({
    position: 'top',
    threshold: 50,
    onIntersect: () => console.log('Top reached!'),
  });

  const centerObserver = useIntersectionObserver({
    position: 'center',
    threshold: 100,
    onIntersect: () => console.log('Center reached!'),
  });

  const bottomObserver = useIntersectionObserver({
    position: 'bottom',
    threshold: 50,
    onIntersect: () => console.log('Bottom reached!'),
  });

  const handleScroll = (event: any) => {
    topObserver.handleScroll(event);
    centerObserver.handleScroll(event);
    bottomObserver.handleScroll(event);
  };

  return (
    <ScrollView
      ref={topObserver.ref}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.container}>
        <View
          style={[
            styles.indicator,
            {
              backgroundColor: topObserver.isIntersecting
                ? '#4CAF50'
                : '#FF5722',
            },
          ]}
        >
          <Text style={styles.indicatorText}>
            Top: {topObserver.isIntersecting ? 'Visible' : 'Hidden'}
          </Text>
        </View>

        <View style={{ height: 1000 }}>
          <Text>Scroll content...</Text>
        </View>

        <View
          style={[
            styles.indicator,
            {
              backgroundColor: centerObserver.isIntersecting
                ? '#4CAF50'
                : '#FF5722',
            },
          ]}
        >
          <Text style={styles.indicatorText}>
            Center: {centerObserver.isIntersecting ? 'Visible' : 'Hidden'}
          </Text>
        </View>

        <View style={{ height: 1000 }}>
          <Text>More content...</Text>
        </View>

        <View
          style={[
            styles.indicator,
            {
              backgroundColor: bottomObserver.isIntersecting
                ? '#4CAF50'
                : '#FF5722',
            },
          ]}
        >
          <Text style={styles.indicatorText}>
            Bottom: {bottomObserver.isIntersecting ? 'Visible' : 'Hidden'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  indicator: {
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  indicatorText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
```

### SectionList with Intersection Detection

```tsx
import React, { useState } from 'react';
import { SectionList, View, Text, StyleSheet } from 'react-native';
import { useScrollToBottom } from 'react-native-intersection-observer';

interface SectionData {
  title: string;
  data: string[];
}

export default function SectionListExample() {
  const [sections, setSections] = useState<SectionData[]>([
    {
      title: 'Section 1',
      data: Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`),
    },
    {
      title: 'Section 2',
      data: Array.from({ length: 10 }, (_, i) => `Item ${i + 11}`),
    },
  ]);

  const { ref, handleScroll } = useScrollToBottom(100, {
    type: 'sectionlist',
    callbacks: {
      onIntersect: () => {
        // Add new section when reaching bottom
        const newSection: SectionData = {
          title: `Section ${sections.length + 1}`,
          data: Array.from(
            { length: 10 },
            (_, i) => `Item ${sections.length * 10 + i + 1}`
          ),
        };
        setSections(prev => [...prev, newSection]);
      },
    },
  });

  const renderItem = ({ item }: { item: string }) => (
    <View style={styles.item}>
      <Text style={styles.itemText}>{item}</Text>
    </View>
  );

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  return (
    <SectionList
      ref={ref}
      sections={sections}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      keyExtractor={(item, index) => `${item}-${index}`}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemText: {
    fontSize: 16,
  },
  sectionHeader: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#ccc',
  },
  sectionHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

## Performance Tips

1. **Use appropriate thresholds**: Smaller thresholds (10-20px) for precise detection, larger thresholds (50-100px) for performance.

2. **Optimize scroll event throttling**: Use `scrollEventThrottle={16}` for smooth 60fps performance.

3. **Debounce expensive operations**: When using callbacks for API calls or heavy operations, implement debouncing.

4. **Use convenience hooks**: For simple use cases, prefer `useScrollToBottom`, `useScrollToTop`, etc., over the main hook.

5. **Reset when needed**: Use the `reset()` function when you need to clear the intersection state.

## Common Patterns

### Lazy Loading

```tsx
const { isIntersecting, ref, handleScroll } = useScrollToBottom(100, {
  callbacks: {
    onIntersect: () => loadMoreContent(),
  },
});
```

### Analytics Tracking

```tsx
const { isIntersecting } = useIntersectionObserver({
  position: 'bottom',
  callbacks: {
    onIntersect: () => trackEvent('user_reached_bottom'),
  },
});
```

### Conditional Rendering

```tsx
const { isIntersecting } = useScrollToTop(50);
return (
  <View>
    {isIntersecting && <FloatingActionButton />}
    {/* Your content */}
  </View>
);
```
