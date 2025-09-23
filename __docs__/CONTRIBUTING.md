# Contributing to React Native Intersection Observer

Thank you for your interest in contributing to this project! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- React Native development environment
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/ReactNativeIntersectionObserver.git
   cd ReactNativeIntersectionObserver
   ```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Run Linting

```bash
npm run lint
```

### Format Code

```bash
npm run format
```

## Making Changes

### Branch Naming

Use descriptive branch names that indicate the type of change:

- `feature/add-new-hook` - New features
- `fix/scroll-performance` - Bug fixes
- `docs/update-readme` - Documentation updates
- `refactor/optimize-callbacks` - Code refactoring

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:

```
feat(hooks): add useScrollToCenter hook
fix(types): correct TypeScript definitions
docs(api): update API documentation
test(hooks): add tests for element intersection
```

### Code Style

- Use TypeScript for all new code
- Follow the existing code style and patterns
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### TypeScript Guidelines

- Use strict TypeScript configuration
- Export types for all public APIs
- Use proper type annotations
- Avoid `any` types when possible
- Use union types for better type safety

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

- Write tests for all new functionality
- Test edge cases and error conditions
- Use descriptive test names
- Follow the existing test patterns
- Aim for high test coverage

### Test Structure

```typescript
describe('FeatureName', () => {
  it('should handle normal case', () => {
    // Test implementation
  });

  it('should handle edge case', () => {
    // Test implementation
  });

  it('should throw error for invalid input', () => {
    // Test implementation
  });
});
```

## Pull Request Process

### Before Submitting

1. **Update Documentation**: Update README.md, API.md, and other docs if needed
2. **Add Tests**: Ensure all new code is tested
3. **Run Checks**: Make sure all tests pass and linting is clean
4. **Update Changelog**: Add entries to CHANGELOG.md for user-facing changes

### Pull Request Template

When creating a PR, please include:

- **Description**: Clear description of changes
- **Type**: Feature, bug fix, documentation, etc.
- **Testing**: How you tested the changes
- **Breaking Changes**: Any breaking changes and migration guide
- **Related Issues**: Link to related issues

### Review Process

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: At least one maintainer must approve
3. **Testing**: Changes must be tested in a React Native environment
4. **Documentation**: Documentation must be updated if needed

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. **Update Version**: Update version in package.json
2. **Update Changelog**: Add release notes to CHANGELOG.md
3. **Create Tag**: Create a git tag (e.g., `v1.2.0`)
4. **Publish**: The release will be automatically published via GitHub Actions

### Changelog Format

```markdown
## [1.2.0] - 2024-01-15

### Added

- New `useScrollToCenter` hook
- Support for custom thresholds

### Changed

- Improved performance for large lists
- Updated TypeScript definitions

### Fixed

- Fixed intersection detection on Android
- Resolved memory leak in element tracking
```

## Development Guidelines

### Performance Considerations

- Optimize for 60fps scroll performance
- Minimize re-renders
- Use appropriate thresholds
- Consider memory usage for large lists

### Accessibility

- Ensure hooks work with screen readers
- Provide meaningful callback names
- Consider users with motion sensitivity

### Browser Compatibility

- Test on both iOS and Android
- Ensure compatibility with Expo
- Test with different React Native versions

## Getting Help

- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and general discussion
- **Documentation**: Check the docs folder for detailed information

## Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to React Native Intersection Observer! 🎉
