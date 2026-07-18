export {};

declare global {
  interface Window {
    __CANVAS_HARNESS__?: any;
    __CANVAS_PERF__?: any;
    __CANVAS_LIBRARY_IDENTITY__?: any;
    __CANVAS_WHEEL_PROPERTY_COUNTS__?: any;
    __CANVAS_PROFILE_BURST__?: any;
    __CANVAS_PROFILE_CLEANUP__?: any;
    __CANVAS_PROFILE_POINTER_IDS__?: any;
    __CANVAS_PROFILE_POINTER_CLEANUP__?: any;
    __CANVAS_PINCH_POINTER_IDS__?: any;
    __CANVAS_STOP_PINCH_ARRAY_COUNT__?: any;
    __CANVAS_RESTORE_PINCH_BENCHMARK__?: any;
    __CANVAS_SET_CUSTOM_TOOLBAR_FORMAT__?: any;
  }
}
