# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive documentation in `__docs__/` folder
- API reference documentation
- Contributing guidelines
- Detailed examples and use cases

### Changed

- Improved README.md with better structure and examples
- Enhanced TypeScript type definitions
- Updated build configuration for better compatibility

## [1.0.0] - 2024-01-15

### Added

- Initial release of `react-native-intersection-observer`
- Core `useIntersectionObserver` hook with full functionality
- Convenience hooks:
  - `useScrollToBottom` - Detect when user scrolls to bottom
  - `useScrollToTop` - Detect when user scrolls to top
  - `useScrollToCenter` - Detect when user scrolls to center
  - `useElementIntersection` - Track specific element visibility
- Support for multiple scroll components:
  - ScrollView
  - FlatList
  - SectionList
- Multiple intersection positions:
  - `top` - Detect top of scroll view
  - `bottom` - Detect bottom of scroll view
  - `center` - Detect center of scroll view
  - `element` - Track specific element visibility
- Configurable thresholds for intersection detection
- Rich callback system:
  - `onIntersect` - Called when intersection starts
  - `onVisible` - Called when intersection ends
  - `onIntersectionChange` - Called for any intersection change
- Full TypeScript support with comprehensive type definitions
- Performance optimizations:
  - Automatic re-render optimization
  - Efficient scroll event handling
  - Minimal memory footprint
- Cross-platform compatibility:
  - iOS and Android support
  - Expo compatibility
  - React Native 0.60+ support
- Professional npm package setup:
  - TypeScript compilation
  - ESLint configuration
  - Jest testing setup
  - GitHub Actions CI/CD
  - Semantic release automation
- Comprehensive documentation:
  - README with examples
  - API reference
  - Contributing guidelines
  - Changelog

### Technical Details

- **Dependencies**: React 16.8+, React Native 0.60+
- **TypeScript**: Full type safety with exported types
- **Testing**: Jest with comprehensive test coverage
- **Build**: TypeScript compilation to CommonJS
- **Linting**: ESLint with React Native rules
- **CI/CD**: GitHub Actions for automated testing and publishing

### Performance

- Optimized for 60fps scroll performance
- Minimal re-renders through state change detection
- Efficient memory usage
- Configurable scroll event throttling

### Examples Included

- Basic scroll detection
- Infinite scroll implementation
- Pull-to-refresh detection
- Element visibility tracking
- Multi-position detection
- SectionList integration
- Performance optimization tips

---

## Version History

- **1.0.0** - Initial release with full feature set
- **Unreleased** - Documentation improvements and enhancements

## Migration Guide

### From 0.x to 1.0.0

This is the initial release, so there are no migration steps required.

## Breaking Changes

None in this release.

## Deprecations

None in this release.

## Security

No security issues reported in this release.

## Contributors

- **Ray Martin** - Initial implementation and documentation ([raymartin.es](https://raymartin.es))
- **Community** - Feedback and suggestions

## Acknowledgments

- React Native community for inspiration and feedback
- TypeScript team for excellent type system
- Jest team for testing framework
- GitHub Actions for CI/CD automation

---

For more information about this release, please see:

- [README.md](../README.md)
- [API Documentation](API.md)
- [Examples](EXAMPLES.md)
- [Contributing Guidelines](CONTRIBUTING.md)
