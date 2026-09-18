# Development Guidelines

This document provides guidelines for developing and maintaining the React Native Intersection Observer library.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Code Standards](#code-standards)
- [Testing Strategy](#testing-strategy)
- [Performance Guidelines](#performance-guidelines)
- [Documentation Standards](#documentation-standards)
- [Release Process](#release-process)

## Architecture Overview

### Core Components

```
src/
├── index.ts              # Main entry point with all exports
├── types.ts              # TypeScript type definitions
└── __tests__/            # Test files
    ├── compilation.test.ts
    └── hooks.test.ts
```

### Hook Architecture

The library follows a modular hook architecture:

1. **Core Hook**: `useIntersectionObserver` - Main functionality
2. **Convenience Hooks**: Specialized hooks for common use cases
3. **Type System**: Comprehensive TypeScript definitions
4. **Performance**: Optimized for 60fps scroll performance

### Design Principles

- **Single Responsibility**: Each hook has a clear, focused purpose
- **Composability**: Hooks can be combined and extended
- **Performance First**: Optimized for smooth scrolling
- **Type Safety**: Full TypeScript support
- **Developer Experience**: Clear APIs and comprehensive documentation

## Code Standards

### TypeScript Guidelines

```typescript
// ✅ Good: Explicit types
interface UseIntersectionObserverOptions {
  threshold?: number;
  position?: IntersectionPosition;
  onIntersect?: () => void;
}

// ✅ Good: Proper generics
const useScrollToBottom = <T extends ScrollComponent>(
  threshold?: number,
  options?: ScrollToBottomOptions<T>
) => {
  /* ... */
};

// ❌ Bad: Any types
const useIntersectionObserver = (options: any) => {
  /* ... */
};
```

### Hook Patterns

```typescript
// ✅ Good: Consistent hook structure
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverReturn {
  // 1. State declarations
  const [isIntersecting, setIsIntersecting] = useState(false);

  // 2. Refs
  const ref = useRef<ScrollView | FlatList | SectionList>(null);

  // 3. Callbacks with useCallback
  const handleScroll = useCallback(
    (event: any) => {
      // Implementation
    },
    [dependencies]
  );

  // 4. Return object
  return {
    isIntersecting,
    ref,
    handleScroll,
    // ...
  };
}
```

### Naming Conventions

- **Hooks**: `use` prefix (e.g., `useIntersectionObserver`)
- **Types**: PascalCase (e.g., `UseIntersectionObserverOptions`)
- **Interfaces**: PascalCase with descriptive names
- **Functions**: camelCase with descriptive names
- **Constants**: UPPER_SNAKE_CASE

### Error Handling

```typescript
// ✅ Good: Graceful error handling
const calculateIntersection = useCallback(
  (layoutMeasurement: any, contentOffset: any, contentSize: any) => {
    try {
      // Calculation logic
      return result;
    } catch (error) {
      console.warn('Intersection calculation failed:', error);
      return false;
    }
  },
  [dependencies]
);
```

## Testing Strategy

### Test Categories

1. **Unit Tests**: Individual hook functionality
2. **Integration Tests**: Hook interactions
3. **Compilation Tests**: TypeScript compilation
4. **Performance Tests**: Scroll performance

### Test Structure

```typescript
describe('useIntersectionObserver', () => {
  describe('initialization', () => {
    it('should initialize with default values', () => {
      // Test implementation
    });
  });

  describe('intersection detection', () => {
    it('should detect bottom intersection', () => {
      // Test implementation
    });
  });

  describe('edge cases', () => {
    it('should handle invalid scroll events', () => {
      // Test implementation
    });
  });
});
```

### Mocking Strategy

```typescript
// Mock React Native components
jest.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  View: 'View',
}));

// Mock React hooks
const mockUseState = jest.fn();
const mockUseRef = jest.fn();
const mockUseCallback = jest.fn();

jest.mock('react', () => ({
  useState: mockUseState,
  useRef: mockUseRef,
  useCallback: mockUseCallback,
}));
```

## Performance Guidelines

### Scroll Performance

```typescript
// ✅ Good: Optimized scroll handling
const handleScroll = useCallback(
  (event: any) => {
    // Only process if state will change
    if (newIntersectionState !== currentState) {
      setIsIntersecting(newIntersectionState);
      // Trigger callbacks
    }
  },
  [dependencies]
);

// ❌ Bad: Unnecessary re-renders
const handleScroll = (event: any) => {
  setIsIntersecting(calculateIntersection(event));
  // This will cause re-render on every scroll
};
```

### Memory Management

```typescript
// ✅ Good: Proper cleanup
useEffect(() => {
  const cleanup = () => {
    // Cleanup logic
  };

  return cleanup;
}, []);

// ✅ Good: Stable references
const stableCallback = useCallback(() => {
  // Callback logic
}, [dependencies]);
```

### Threshold Optimization

```typescript
// ✅ Good: Appropriate thresholds
const BOTTOM_THRESHOLD = 50; // Good for most use cases
const TOP_THRESHOLD = 10; // Smaller for pull-to-refresh
const CENTER_THRESHOLD = 100; // Larger for center detection

// ❌ Bad: Too small thresholds
const threshold = 1; // Will cause performance issues
```

## Documentation Standards

### JSDoc Comments

````typescript
/**
 * Detects when the user has scrolled to the bottom of the scroll view.
 *
 * @param threshold - Distance threshold for bottom detection (default: 20)
 * @param options - Configuration options including component type and callbacks
 * @returns Object containing intersection state and handlers
 *
 * @example
 * ```tsx
 * const { isIntersecting, ref, handleScroll } = useScrollToBottom(50, {
 *   type: 'flatlist',
 *   callbacks: { onIntersect: () => loadMore() }
 * });
 * ```
 */
export function useScrollToBottom(
  threshold?: number,
  options?: ScrollToBottomOptions
) {
  // Implementation
}
````

### README Structure

1. **Header**: Badges and description
2. **Features**: Key capabilities
3. **Installation**: Setup instructions
4. **Quick Start**: Basic example
5. **API Reference**: Complete documentation
6. **Examples**: Common use cases
7. **Performance**: Optimization tips
8. **Contributing**: How to contribute
9. **License**: Legal information

### Code Examples

```typescript
// ✅ Good: Complete, runnable examples
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useScrollToBottom } from '@raymardev/react-native-intersection-observer';

export default function Example() {
  const { isIntersecting, ref, handleScroll } = useScrollToBottom(50, {
    type: 'scrollview',
    callbacks: {
      onIntersect: () => console.log('Reached bottom!'),
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

## Release Process

### Version Management

- **Semantic Versioning**: Follow semver.org
- **Changelog**: Update CHANGELOG.md for each release
- **Git Tags**: Create tags for each release
- **Automated Publishing**: Use GitHub Actions

### Release Checklist

- [ ] Update version in package.json
- [ ] Update CHANGELOG.md
- [ ] Run all tests
- [ ] Update documentation if needed
- [ ] Create release PR
- [ ] Merge and tag release
- [ ] Verify npm publication

### Quality Gates

- [ ] All tests pass
- [ ] TypeScript compilation succeeds
- [ ] ESLint passes
- [ ] Documentation is up to date
- [ ] Performance benchmarks pass
- [ ] Cross-platform testing completed

## Development Workflow

### Feature Development

1. **Create Feature Branch**: `git checkout -b feature/amazing-feature`
2. **Implement Feature**: Follow code standards
3. **Add Tests**: Comprehensive test coverage
4. **Update Documentation**: Update relevant docs
5. **Run Quality Checks**: Tests, linting, compilation
6. **Create PR**: Detailed description and testing notes
7. **Code Review**: Address feedback
8. **Merge**: After approval

### Bug Fixes

1. **Create Bug Branch**: `git checkout -b fix/bug-description`
2. **Reproduce Issue**: Create test case
3. **Implement Fix**: Minimal, focused changes
4. **Add Regression Test**: Prevent future occurrences
5. **Update Documentation**: If API changes
6. **Create PR**: Link to issue
7. **Test Fix**: Verify resolution
8. **Merge**: After verification

### Documentation Updates

1. **Identify Need**: Missing or outdated docs
2. **Create Branch**: `git checkout -b docs/update-description`
3. **Update Content**: Clear, accurate information
4. **Review**: Check for clarity and completeness
5. **Test Examples**: Ensure code examples work
6. **Create PR**: Link to related issues
7. **Merge**: After review

## Performance Monitoring

### Key Metrics

- **Scroll Performance**: 60fps target
- **Memory Usage**: Monitor for leaks
- **Bundle Size**: Keep minimal
- **TypeScript Compilation**: Fast build times

### Benchmarking

```typescript
// Performance test example
describe('Performance', () => {
  it('should handle 1000 scroll events efficiently', () => {
    const startTime = performance.now();

    // Simulate 1000 scroll events
    for (let i = 0; i < 1000; i++) {
      handleScroll(mockScrollEvent);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100); // Should complete in <100ms
  });
});
```

## Security Considerations

- **Input Validation**: Validate all inputs
- **Error Handling**: Don't expose sensitive information
- **Dependencies**: Keep dependencies minimal and secure
- **Code Review**: Security-focused code reviews

## Accessibility

- **Screen Reader Support**: Ensure hooks work with assistive technology
- **Motion Sensitivity**: Consider users with motion sensitivity
- **Keyboard Navigation**: Support keyboard-only navigation
- **High Contrast**: Ensure visual indicators work in high contrast mode

---

This development guide ensures consistent, high-quality development practices for the React Native Intersection Observer library.

---

## About the Author

This library is created and maintained by **[Ray Martin](https://raymartin.es)**, a full-stack developer specializing in React Native, Next.js, and modern web technologies.

- 🌐 **Personal Website**: [raymartin.es](https://raymartin.es) (available in English and Spanish)
- 💼 **Professional Profile**: Full-stack developer with expertise in enterprise-grade applications
- 🚀 **Open Source**: Active contributor to the React Native ecosystem
- 📧 **Contact**: Available for consulting and collaboration
