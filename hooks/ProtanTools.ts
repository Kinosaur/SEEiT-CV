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

function assertAndroid() {
    if (Platform.OS !== 'android') throw new Error('Android-only feature. Build/run on Android.');
}
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