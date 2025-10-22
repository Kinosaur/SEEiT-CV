/**
 * Camera format hook for consistent 1080p@30fps capture
 * Falls back to auto-selection if target format unsupported
 */
import { useCameraDevice, useCameraFormat } from 'react-native-vision-camera';

/**
 * Tries to lock the camera to 1080p @ 30 FPS.
 * If that exact spec is unsupported (either resolution or FPS),
 * returns (format=undefined, fps=undefined) and lets VisionCamera auto-pick.
 *
 * Intentional simplicity: no secondary fallback (e.g. 720p).
 * Documented trade-off: unpredictable resolution across devices if 1080p unsupported.
 */
export function useSimpleFormat(position: 'front' | 'back') {
    // Target camera specifications
    const TARGET_WIDTH = 1920;
    const TARGET_HEIGHT = 1080;
    const TARGET_FPS = 30;

    const device = useCameraDevice(position);
    const format = useCameraFormat(device, [
        { videoResolution: { width: TARGET_WIDTH, height: TARGET_HEIGHT } },
        { fps: TARGET_FPS },
    ]);

    // Validate FPS compatibility with selected format
    let fps: number | undefined = undefined;
    if (
        format &&
        TARGET_FPS >= format.minFps &&
        TARGET_FPS <= format.maxFps
    ) {
        fps = TARGET_FPS;
    }
    // If format is undefined OR FPS outside supported range, we bail to auto (omit both format+fps).

    return {
        device,
        format,
        fps,
        supportsTorch: !!device?.hasTorch,
    };
}

export default useSimpleFormat;