/**
 * ProtanTools - Native module interface for color confusion detection
 * Provides Android native color analysis for protanopia simulation
 */
import { NativeModules, Platform } from 'react-native';

const M = NativeModules as any;

const { ProtanTools } = M as {
    ProtanTools?: {
        detectConfusableColors?: (
            uri: string,
            maxSide: number,
            mode: 'protan',
            minAreaFrac: number,
            minSat: number,
            minVal: number
        ) => Promise<{
            width: number;
            height: number;
            regions: {
                type: string;
                mode: 'protan';
                riskFor: 'protan';
                trueFamily: string;
                dominantFamily?: string;
                meanR: number;
                meanG: number;
                meanB: number;
                meanProtanR: number;
                meanProtanG: number;
                meanProtanB: number;
                simFamilyProtan: string;
                confProtan: 'low' | 'med' | 'high';
                x: number;
                y: number;
                w: number;
                h: number;
                areaFrac: number;
            }[];
            meta?: {
                thresholds?: {
                    mode: 'protan-only';
                    minSat: number;
                    minVal: number;
                    minAreaFrac: number;
                    confLow?: string;
                    confMed?: string;
                    confHigh?: string;
                    minBoxWFrac?: number;
                    minBoxHFrac?: number;
                    minDominantFraction?: number;
                    minMeanSatGen?: number;
                    iouMergeThr?: number;
                    gapMergeFrac?: number;
                    overlap1DGood?: number;
                    colorMergeMaxDE?: number;
                };
            };
        }>;
    };
};

// Ensure Android platform for native module access
function assertAndroid() {
    if (Platform.OS !== 'android') throw new Error('Android-only feature. Build/run on Android.');
}

// Validate native module availability and method existence
function ensure(method?: keyof NonNullable<typeof ProtanTools>) {
    assertAndroid();
    if (!ProtanTools) {
        const keys = Object.keys(NativeModules || {});
        throw new Error(`ProtanTools native module is missing. Found NativeModules: ${keys.join(', ')}. Rebuild after native changes.`);
    }
    if (method && !ProtanTools[method]) {
        const exported = Object.keys(ProtanTools);
        throw new Error(`ProtanTools.${String(method)} is missing. Exported methods: [${exported.join(', ')}]. Rebuild the app.`);
    }
}

/**
 * Detect color confusion regions in an image for protanopia
 * @param uri - Image file URI to analyze
 * @param maxSide - Maximum image dimension for processing (default: 640)
 * @param mode - Color blindness type (currently only 'protan')
 * @param minAreaFrac - Minimum region area fraction (default: 0.002)
 * @param minSat - Minimum saturation threshold (default: 0.25)
 * @param minVal - Minimum value/brightness threshold (default: 0.15)
 * @returns Analysis results with detected confusion regions
 */
export async function detectConfusableColors(
    uri: string,
    maxSide = 640,
    mode: 'protan' = 'protan',
    minAreaFrac = 0.002,
    minSat = 0.25,
    minVal = 0.15
) {
    ensure('detectConfusableColors');
    return await ProtanTools!.detectConfusableColors!(uri, maxSide, mode, minAreaFrac, minSat, minVal);
}