// Runs after the test framework is installed, for every test file.
// (Wired in via `setupFilesAfterEnv` in jest.config.js.)
//
// react-native itself is mocked by the `react-native` jest preset, so there is
// no hand-rolled stub here: tests render against the real component tree.
require('@testing-library/react-native/extend-expect');
