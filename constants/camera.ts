// Central camera-related constants (kept minimal for MVP).
// If you later need utilities (e.g., performance telemetry), extend here
// rather than bloating app/index.tsx.

export const TARGET_FORMATS = [
    { width: 1920, height: 1080, label: '1080p' },
    { width: 1280, height: 720, label: '720p' },
];

export const TARGET_FPS = 30;

// Allow the camera to throttle down under low light if you opt-in.
// For strict fixed FPS leave dynamic range disabled in index.tsx.
export const MIN_DYNAMIC_FPS = 20; // candidate lower bound if you enable adaptive FPS