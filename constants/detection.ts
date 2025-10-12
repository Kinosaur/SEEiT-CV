/* ================= Detection Constants ================= */

export const DEFAULT_SPEECH_ON = false;

export const NATURAL_LABEL_MAP: Record<string, string> = {
    stop: 'stop sign',
    stop_sign: 'stop sign',
    speed_limit: 'speed limit sign',
    'speed limit': 'speed limit sign',
    no_entry: 'no entry sign',
    'no entry': 'no entry sign',
    hazard: 'hazard sign',
    crosswalk: 'crosswalk',
    bike: 'bicycle',
    bicycle: 'bicycle',
    car: 'car',
    van: 'van',
    truck: 'truck',
    motorcycle: 'motorcycle',
    'traffic red': 'red traffic light',
    'traffic yellow': 'yellow traffic light',
    'traffic green': 'green traffic light',
    emergency_exit: 'emergency exit',
    'emergency exit': 'emergency exit',
};

export const DIST_PRIORITY: Record<string, number> = { near: 0, mid: 1, far: 2, unknown: 3 };

export const DIRECTION_ORDER: Record<string, number> = {
    'upper left': 0,
    'upper right': 1,
    'left': 2,
    'directly ahead': 3,
    'right': 4,
    'lower left': 5,
    'lower right': 6,
};

export const DIR_STABLE_FRAMES = 3;
export const DIR_NULL_GRACE = 2;
export const DIR_CACHE_TTL_MS = 9000;

export const SMALL_GROUP_MAX = 4;
export const INCLUDE_DIRECTION_FOR_UNIFORM_LIMIT = 3;
export const MAX_GROUPS_SPOKEN = 3;

export const SPEECH_INTERRUPT_GRACE_MS = 1600;
export const MIN_MAJOR_INTERVAL_MS = 2800;
export const MIN_MINOR_INTERVAL_MS = 4200;

export const CRITICAL_LABELS = new Set([
    'stop sign',
    'hazard sign',
    'crosswalk',
    'emergency exit',
    'red traffic light',
]);

export const MULTI_COUNT_LABELS = new Set([
    'car', 'truck', 'van', 'bicycle', 'motorcycle'
]);

export const ID_ABSENCE_MS = 900;
export const MIN_BUCKET_SPEAK_INTERVAL_MS = 2500;
export const NEAR_DEESC_DELAY_MS = 1500;
export const MAX_DIRECTION_MENTIONS = 2;
