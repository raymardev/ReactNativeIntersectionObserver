import { ScrollView, FlatList, SectionList, View } from 'react-native';

export type IntersectionPosition = 'top' | 'bottom' | 'center' | 'custom' | 'element';

export interface UseIntersectionObserverOptions {
  /**
   * Threshold to determine if the scroll view is intersecting
   */
  threshold?: number;
  /**
   * Position where the intersection should be detected
   */
  position?: IntersectionPosition;
  /**
   * Element that will trigger isIntersecting when visible (for position: "element")
   */
  element?: React.RefObject<View | null>;
  /**
   * Callback function called when intersection starts (element becomes visible)
   */
  onIntersect?: () => void;
  /**
   * Callback function called when intersection ends (element becomes hidden)
   */
  onVisible?: () => void;
  /**
   * Callback function called when intersection changes (both visible and hidden)
   */
  onIntersectionChange?: (isIntersecting: boolean) => void;
}

export interface UseIntersectionObserverReturn {
  /**
   * Indicating if the scroll view is intersecting at the specified position
   * or if the element is visible
   */
  isIntersecting: boolean;
  /**
   * Ref to the scroll view, flat list, or section list
   */
  ref: React.RefObject<ScrollView | FlatList | SectionList>;
  /**
   * Function to handle the scroll event
   */
  handleScroll: (event: any) => void;
  /**
   * Function to handle the element layout (for position: "element")
   */
  handleElementLayout: (event: any) => void;
  /**
   * Function to reset the intersection observer
   */
  reset: () => void;
}

export type RefType = 'scrollview' | 'flatlist' | 'sectionlist';

export interface Callbacks {
  onIntersect?: () => void;
  onVisible?: () => void;
  onIntersectionChange?: (isIntersecting: boolean) => void;
}

export interface ScrollToBottomOptions {
  type?: RefType;
  callbacks?: Callbacks;
}

export interface ScrollToTopOptions {
  type?: RefType;
  callbacks?: Callbacks;
}

export interface ScrollToCenterOptions {
  type?: RefType;
  callbacks?: Callbacks;
}

export interface ElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScrollEvent {
  nativeEvent: {
    layoutMeasurement: {
      height: number;
      width: number;
    };
    contentOffset: {
      x: number;
      y: number;
    };
    contentSize: {
      height: number;
      width: number;
    };
  };
}

export interface LayoutEvent {
  nativeEvent: {
    layout: ElementLayout;
  };
}
