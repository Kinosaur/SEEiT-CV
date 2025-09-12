import { NativeModules, Platform } from 'react-native'

export type ColorMatrix4x5 = number[] // length 20

const { ColorMatrixProcessor } = NativeModules

export async function processImageWithMatrix(inputUri: string, matrix4x5: ColorMatrix4x5): Promise<string> {
    if (Platform.OS !== 'android') throw new Error('processImageWithMatrix is Android-only')
    if (!ColorMatrixProcessor?.processImage) throw new Error('ColorMatrixProcessor native module not available')
    if (!Array.isArray(matrix4x5) || matrix4x5.length !== 20) throw new Error('matrix4x5 must be an array of length 20')
    return await ColorMatrixProcessor.processImage(inputUri, matrix4x5)
}