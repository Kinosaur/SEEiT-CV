import { NativeModules, Platform } from 'react-native'

const { ColorAssist } = NativeModules as {
    ColorAssist?: {
        getConfusionStats: (uri: string, type: string, delta: number, maxSide: number) => Promise<{
            total: number
            sampled: number
            confusing: number
            ratio: number
            meanDelta: number
            step: number
            width: number
            height: number
        }>
        getClusters: (
            uri: string,
            type: string,
            k: number,
            delta: number,
            maxSide: number,
            maxIters: number
        ) => Promise<{
            clusters: {
                id: number
                size: number
                centroid_srgb: [number, number, number]
                centroid_srgb_norm: [number, number, number]
                centroid_lab: [number, number, number]
                centroid_lab_sim?: [number, number, number]
                centroid_xyY: [number, number, number]
                centroidDeltaE: number
                confusingRatio: number
                lAlphaBeta: { mean: [number, number, number]; std: [number, number, number] }
            }[]
            type: string
            k: number
            delta: number
            width: number
            height: number
        }>
        recolorAssistedImage: (
            uri: string,
            type: string,
            strength: number,
            k: number,
            delta: number,
            analysisMaxSide: number,
            linesCount: number,
            outputMaxSide: number
        ) => Promise<string>
    }
}

function assertAndroid() {
    if (Platform.OS !== 'android') throw new Error('Android-only')
}
function assertProtan(type: string) {
    if (type.toLowerCase().startsWith('deut')) {
        throw new Error('Deuteranopia path disabled. Protanopia-only in this build.')
    }
}

export async function getConfusionStats(
    uri: string,
    type: 'protanopia' | 'protan' = 'protanopia',
    delta: number = 25,
    maxSide: number = 512
) {
    assertAndroid()
    if (!ColorAssist?.getConfusionStats) throw new Error('ColorAssist.getConfusionStats not available')
    assertProtan(type)
    const T = 'protanopia'
    return await ColorAssist.getConfusionStats(uri, T, delta, maxSide)
}

export async function getClusters(
    uri: string,
    type: 'protanopia' | 'protan' = 'protanopia',
    k: number = 8,
    delta: number = 25,
    maxSide: number = 512,
    maxIters: number = 12
) {
    assertAndroid()
    if (!ColorAssist?.getClusters) throw new Error('ColorAssist.getClusters not available')
    assertProtan(type)
    const T = 'protanopia'
    return await ColorAssist.getClusters(uri, T, k, delta, maxSide, maxIters)
}

export async function recolorAssistedImage(
    uri: string,
    type: 'protanopia' | 'protan' = 'protanopia',
    strength: number,
    k: number = 8,
    delta: number = 25,
    analysisMaxSide: number = 384,
    linesCount: number = 17,
    outputMaxSide: number = 1280
) {
    assertAndroid()
    if (!ColorAssist?.recolorAssistedImage) throw new Error('ColorAssist.recolorAssistedImage not available')
    assertProtan(type)
    const T = 'protanopia'
    return await ColorAssist.recolorAssistedImage(
        uri, T, strength, k, delta, analysisMaxSide, linesCount, outputMaxSide
    )
}