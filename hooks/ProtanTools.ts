import { NativeModules, Platform } from 'react-native';

const M = NativeModules as any;

const { ProtanTools } = M as {
    ProtanTools?: {
        detectConfusableColors?: (
            uri: string,
            maxSide: number,
            mode: 'protan' | 'deutan' | 'both',
            minAreaFrac: number,
            minSat: number,
            minVal: number
        ) => Promise<{
            width: number; height: number;
            regions: {
                type: string;
                mode: 'protan' | 'deutan' | 'general';
                riskFor: 'protan' | 'deutan' | 'both';
                trueFamily: string;
                dominantFamily?: string;
                meanR: number; meanG: number; meanB: number;
                meanProtanR?: number; meanProtanG?: number; meanProtanB?: number;
                meanDeutanR?: number; meanDeutanG?: number; meanDeutanB?: number;
                simFamilyProtan?: string;
                simFamilyDeutan?: string;
                avgDeltaEProtan?: number;
                avgDeltaEDeutan?: number;
                confProtan?: 'low' | 'med' | 'high';
                confDeutan?: 'low' | 'med' | 'high';
                x: number; y: number; w: number; h: number; areaFrac: number;
            }[];
            meta?: {
                counts?: Record<string, number>;
                thresholds?: { mode: string; minSat: number; minVal: number; minAreaFrac: number; confLow?: string; confMed?: string; confHigh?: string };
            };
        }>;
    }
}

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
    maxSide = 360,
    mode: 'protan' | 'deutan' | 'both' = 'both',
    minAreaFrac = 0.0035,
    minSat = 0.25,
    minVal = 0.15
) {
    ensure('detectConfusableColors');
    return await ProtanTools!.detectConfusableColors!(uri, maxSide, mode, minAreaFrac, minSat, minVal);
}