import { Frame, VisionCameraProxy } from 'react-native-vision-camera'

// Lazily initialize & cache the plugin in the worklet global scope
export function mlkitObjectDetect(frame: Frame) {
    'worklet'
    const g = globalThis as any
    if (!g.__mlkitPlugin) {
        g.__mlkitPlugin = VisionCameraProxy.initFrameProcessorPlugin('mlkitObjectDetect', {})
    }
    const plugin = g.__mlkitPlugin
    if (plugin == null) {
        // Return a recognizable heartbeat; caller can ignore until ready
        return { detSeq: -1, objs: [] }
    }
    return plugin.call(frame)
}