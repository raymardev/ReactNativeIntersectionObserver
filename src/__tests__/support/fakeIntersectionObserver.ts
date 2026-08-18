/**
 * A stand-in for the platform `IntersectionObserver`.
 *
 * React Native's implementation is a C++ global that only exists on recent
 * versions, on the New Architecture, behind a feature flag — so it is never
 * present in a jest run. Injecting this class through
 * `setNativeIntersectionObserverOverride` is what lets the adapter be driven
 * end to end without a device, and it records everything the adapter hands it so
 * the mapping (root, rootMargin, threshold) can be asserted directly.
 */

import type {
  NativeIOCallback,
  NativeIOEntry,
  NativeIOInstance,
  NativeIOOptions,
} from '../../native';

/** Overrides for the entry {@link FakeIntersectionObserver.emit} builds. */
export interface EmitInit {
  target?: unknown;
  isIntersecting?: boolean;
  intersectionRatio?: number;
  boundingClientRect?: NativeIOEntry['boundingClientRect'];
  rootBounds?: NativeIOEntry['rootBounds'];
}

export class FakeIntersectionObserver implements NativeIOInstance {
  /** Every instance built since the last reset, in construction order. */
  static instances: FakeIntersectionObserver[] = [];

  /** Forget every recorded instance. Call from `beforeEach`. */
  static reset(): void {
    FakeIntersectionObserver.instances = [];
  }

  /** The most recently constructed instance, or `undefined` if there is none. */
  static get last(): FakeIntersectionObserver | undefined {
    return FakeIntersectionObserver.instances[
      FakeIntersectionObserver.instances.length - 1
    ];
  }

  readonly callback: NativeIOCallback;
  readonly options: NativeIOOptions | undefined;
  readonly targets: unknown[] = [];
  observeCalls = 0;
  unobserveCalls = 0;
  disconnectCalls = 0;

  constructor(callback: NativeIOCallback, options?: NativeIOOptions) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: unknown): void {
    this.observeCalls += 1;
    if (!this.targets.includes(target)) {
      this.targets.push(target);
    }
  }

  unobserve(target: unknown): void {
    this.unobserveCalls += 1;
    const index = this.targets.indexOf(target);
    if (index >= 0) {
      this.targets.splice(index, 1);
    }
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.targets.length = 0;
  }

  takeRecords(): NativeIOEntry[] {
    return [];
  }

  /** Whether this observer is still connected to anything. */
  get connected(): boolean {
    return this.disconnectCalls === 0;
  }

  /**
   * Deliver one entry, the way the platform observer would.
   *
   * @param init - Overrides; by default the entry is for the first observed
   * target, with a 300x100 rectangle inside a 400x800 root.
   */
  emit(init: EmitInit = {}): void {
    this.deliver([this.buildEntry(init)]);
  }

  /**
   * Deliver several entries in one batch, oldest first.
   *
   * @param inits - One override bag per entry.
   */
  emitBatch(inits: EmitInit[]): void {
    this.deliver(inits.map(init => this.buildEntry(init)));
  }

  /**
   * Deliver a hand-built list of entries, bypassing the defaults.
   *
   * @param entries - Exactly what the callback should receive.
   */
  deliver(entries: NativeIOEntry[]): void {
    this.callback(entries, this);
  }

  private buildEntry(init: EmitInit): NativeIOEntry {
    const isIntersecting = init.isIntersecting ?? true;
    return {
      target: 'target' in init ? init.target : this.targets[0],
      isIntersecting,
      intersectionRatio: init.intersectionRatio ?? (isIntersecting ? 1 : 0),
      boundingClientRect:
        'boundingClientRect' in init
          ? (init.boundingClientRect ?? null)
          : { x: 0, y: 0, width: 300, height: 100 },
      rootBounds:
        'rootBounds' in init
          ? (init.rootBounds ?? null)
          : { width: 400, height: 800 },
    };
  }
}
