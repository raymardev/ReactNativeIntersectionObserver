// Jest setup file for React Native testing

// Mock react-native components
jest.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  View: 'View',
  Text: 'Text',
}));
