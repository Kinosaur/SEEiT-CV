export function computeContainedRect(
    containerW: number, containerH: number,
    imageW: number, imageH: number
) {
    if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) {
        return { left: 0, top: 0, width: containerW, height: containerH }
    }
    const scale = Math.min(containerW / imageW, containerH / imageH)
    const dispW = imageW * scale
    const dispH = imageH * scale
    const left = (containerW - dispW) / 2
    const top = (containerH - dispH) / 2
    return { left, top, width: dispW, height: dispH }
}