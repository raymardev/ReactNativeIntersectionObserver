# Troubleshooting

This guide helps you resolve common issues when using `@raymardev/react-native-intersection-observer`.

## Table of Contents

- [Common Issues](#common-issues)
- [Performance Problems](#performance-problems)
- [TypeScript Issues](#typescript-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [Debugging Tips](#debugging-tips)
- [Getting Help](#getting-help)

## Common Issues

### Hook Not Detecting Intersections

**Problem**: The hook doesn't trigger intersection callbacks.

**Solutions**:

1. **Check scroll event throttling**:

   ```tsx
   <ScrollView
     onScroll={handleScroll}
     scrollEventThrottle={16} // Ensure this is set
   />
   ```

2. **Verify threshold value**:

   ```tsx
   // Try a larger threshold if detection is inconsistent
   const { isIntersecting } = useScrollToBottom(100); // Instead of 20
   ```

3. **Check if content is scrollable**:
   ```tsx
   // Ensure content height exceeds viewport height
   <ScrollView>
     <View style={{ height: 2000 }}>
       {' '}
       {/* Sufficient height */}
       <Text>Your content</Text>
     </View>
   </ScrollView>
   ```

### Callbacks Not Firing

**Problem**: Callbacks are defined but never called.

**Solutions**:

1. **Check callback definitions**:

   ```tsx
   const { isIntersecting } = useScrollToBottom(50, {
     callbacks: {
       onIntersect: () => console.log('This should fire'), // Check console
     },
   });
   ```

2. **Verify state changes**:

   ```tsx
   const { isIntersecting } = useScrollToBottom(50, {
     callbacks: {
       onIntersectionChange: intersecting => {
         console.log('Intersection state:', intersecting);
       },
     },
   });
   ```

3. **Check for duplicate calls**:
   ```tsx
   // The hook only calls callbacks when state changes
   // Multiple scrolls to the same position won't trigger callbacks
   ```

### Element Intersection Not Working

**Problem**: `useElementIntersection` doesn't detect element visibility.

**Solutions**:

1. **Ensure element layout is measured**:

   ```tsx
   const elementRef = useRef<View>(null);
   const { handleElementLayout } = useElementIntersection(elementRef);

   return (
     <ScrollView>
       <View
         ref={elementRef}
         onLayout={handleElementLayout} // This is required!
       >
         <Text>Tracked element</Text>
       </View>
     </ScrollView>
   );
   ```

2. **Check element positioning**:

   ```tsx
   // Ensure the element is positioned within the scroll view
   // and not outside the viewport
   ```

3. **Verify threshold for element detection**:
   ```tsx
   // Use appropriate threshold for element size
   const { isIntersecting } = useElementIntersection(elementRef, 50);
   ```

## Performance Problems

### Scroll Performance Issues

**Problem**: Scrolling feels laggy or choppy.

**Solutions**:

1. **Optimize scroll event throttling**:

   ```tsx
   <ScrollView
     onScroll={handleScroll}
     scrollEventThrottle={16} // 60fps
     // Avoid scrollEventThrottle={1} for better performance
   />
   ```

2. **Reduce callback complexity**:

   ```tsx
   // Avoid heavy operations in callbacks
   const { isIntersecting } = useScrollToBottom(50, {
     callbacks: {
       onIntersect: () => {
         // Good: Simple state update
         setLoading(true);

         // Bad: Heavy computation
         // processLargeDataset();
       },
     },
   });
   ```

3. **Use appropriate thresholds**:
   ```tsx
   // Larger thresholds = better performance
   const { isIntersecting } = useScrollToBottom(100); // Instead of 10
   ```

### Memory Leaks

**Problem**: Memory usage increases over time.

**Solutions**:

1. **Clean up callbacks**:

   ```tsx
   useEffect(() => {
     return () => {
       // Cleanup if needed
     };
   }, []);
   ```

2. **Avoid creating new functions in render**:

   ```tsx
   // Bad
   const { isIntersecting } = useScrollToBottom(50, {
     callbacks: {
       onIntersect: () => console.log('New function every render'),
     },
   });

   // Good
   const handleIntersect = useCallback(() => {
     console.log('Stable function reference');
   }, []);

   const { isIntersecting } = useScrollToBottom(50, {
     callbacks: { onIntersect: handleIntersect },
   });
   ```

## TypeScript Issues

### Type Errors

**Problem**: TypeScript compilation errors.

**Solutions**:

1. **Check React Native types**:

   ```bash
   npm install --save-dev @types/react-native
   ```

2. **Verify React version**:

   ```tsx
   // Ensure React 16.8+ for hooks support
   import { useState, useRef, useCallback } from 'react';
   ```

3. **Use proper type annotations**:
   ```tsx
   const elementRef = useRef<View>(null);
   const { isIntersecting } = useElementIntersection(elementRef);
   ```

### Import Errors

**Problem**: Cannot import hooks or types.

**Solutions**:

1. **Check import paths**:

   ```tsx
   // Correct imports
   import { useIntersectionObserver } from '@raymardev/react-native-intersection-observer';
   import type { UseIntersectionObserverOptions } from '@raymardev/react-native-intersection-observer';
   ```

2. **Verify package installation**:
   ```bash
   npm list @raymardev/react-native-intersection-observer
   ```

## Platform-Specific Issues

### iOS Issues

**Problem**: Intersection detection behaves differently on iOS.

**Solutions**:

1. **Check safe area handling**:

   ```tsx
   import { useSafeAreaInsets } from 'react-native-safe-area-context';

   const insets = useSafeAreaInsets();
   const { isIntersecting } = useScrollToTop(50 + insets.top);
   ```

2. **Handle keyboard appearance**:

   ```tsx
   import { Keyboard } from 'react-native';

   useEffect(() => {
     const keyboardDidShowListener = Keyboard.addListener(
       'keyboardDidShow',
       () => {
         // Adjust thresholds if needed
       }
     );

     return () => keyboardDidShowListener.remove();
   }, []);
   ```

### Android Issues

**Problem**: Intersection detection issues on Android.

**Solutions**:

1. **Check status bar handling**:

   ```tsx
   import { StatusBar } from 'react-native';

   // Ensure status bar is properly configured
   <StatusBar barStyle="dark-content" backgroundColor="#fff" />;
   ```

2. **Do not scale the threshold by pixel density**:

   Every metric React Native reports on a scroll event — `contentOffset`,
   `layoutMeasurement` and `contentSize` — is already expressed in
   density-independent points (dp), so thresholds are too. Multiplying by
   `PixelRatio.get()` inflates the threshold by the device's scale factor,
   making detection fire far too early on high-density screens.

   ```tsx
   // Correct: dp, identical behaviour on every device.
   const { isIntersecting } = useScrollToBottom(50);

   // Wrong: 3x too large on a 3x screen.
   // const threshold = 50 * PixelRatio.get();
   ```

## Debugging Tips

### Enable Debug Logging

```tsx
const { isIntersecting, handleScroll } = useScrollToBottom(50, {
  callbacks: {
    onIntersect: () => console.log('🔵 Intersected'),
    onVisible: () => console.log('🔴 Visible'),
    onIntersectionChange: intersecting =>
      console.log('🟡 Intersection changed:', intersecting),
  },
});

// Add debug logging to scroll handler
const debugHandleScroll = (event: any) => {
  const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
  console.log('Scroll event:', {
    scrollY: contentOffset.y,
    viewportHeight: layoutMeasurement.height,
    contentHeight: contentSize.height,
    isIntersecting,
  });
  handleScroll(event);
};
```

### Visual Debugging

```tsx
const { isIntersecting } = useScrollToBottom(50);

return (
  <View>
    {/* Visual indicator */}
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: isIntersecting ? 'green' : 'red',
        padding: 10,
      }}
    >
      <Text style={{ color: 'white' }}>
        {isIntersecting ? 'Intersecting' : 'Not Intersecting'}
      </Text>
    </View>

    <ScrollView>{/* Your content */}</ScrollView>
  </View>
);
```

### Performance Monitoring

```tsx
import { Performance } from 'react-native-performance';

const { isIntersecting } = useScrollToBottom(50, {
  callbacks: {
    onIntersect: () => {
      Performance.mark('intersection-start');
      // Your logic
      Performance.mark('intersection-end');
      Performance.measure(
        'intersection-duration',
        'intersection-start',
        'intersection-end'
      );
    },
  },
});
```

## Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide**
2. **Search existing issues** on GitHub
3. **Test with minimal code** to isolate the problem
4. **Check React Native version compatibility**

### When Reporting Issues

Please include:

- React Native version
- Platform (iOS/Android)
- Code example that reproduces the issue
- Expected vs actual behavior
- Console logs or error messages

### Resources

- [GitHub Issues](https://github.com/raymardev/ReactNativeIntersectionObserver/issues)
- [GitHub Discussions](https://github.com/raymardev/ReactNativeIntersectionObserver/discussions)
- [React Native Documentation](https://reactnative.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)

### Community Support

- Join the React Native community
- Check Stack Overflow for similar issues
- Participate in GitHub discussions

---

If you can't find a solution here, please [open an issue](https://github.com/raymardev/ReactNativeIntersectionObserver/issues/new) with detailed information about your problem.
