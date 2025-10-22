/**
 * MLKit Object Detection - Frame processor plugin for real-time object detection
 * Uses Google MLKit for detecting and classifying objects in camera frames
 */
import { Frame, VisionCameraProxy } from 'react-native-vision-camera'

/**
 * Frame processor worklet for MLKit object detection
 * Lazily initializes the native plugin and processes camera frames
 * @param frame - Camera frame to analyze
 * @returns Detection results with sequence number and object array
 */
export function mlkitObjectDetect(frame: Frame) {
    'worklet'
    // Lazily initialize & cache the plugin in the worklet global scope
    const g = globalThis as any
    if (!g.__mlkitPlugin) {
        g.__mlkitPlugin = VisionCameraProxy.initFrameProcessorPlugin('mlkitObjectDetect', {})
    }
    const plugin = g.__mlkitPlugin
    if (plugin == null) {
        return { detSeq: -1, objs: [] }
    }
    return plugin.call(frame)
}