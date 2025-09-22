import { NativeModules, Platform } from 'react-native';

const M = NativeModules as any;

const { ProtanTools } = M as {
    ProtanTools?: {
        generateBoundaryLossHeatmap?: (uri: string, maxSide: number) => Promise<{ overlayUri: string; width: number; height: number }>
        samplePixels?: (
            uri: string,
            maxSide: number,
            points: { x: number; y: number }[]
        ) => Promise<{
            width: number; height: number;
            samples: {
                x: number; y: number;
                r: number; g: number; b: number;
                rSim: number; gSim: number; bSim: number;
                L: number; a: number; bLab: number;
                LSim: number; aSim: number; bLabSim: number;
                deltaE: number;
            }[]
        }>
        detectRedGreenRegions?: (
            uri: string,
            maxSide: number,
            minSat: number,
            minAreaFrac: number,
            minVal: number
        ) => Promise<{
            width: number; height: number;
            regions: { label: 'red' | 'green'; x: number; y: number; w: number; h: number; areaFrac: number }[];
            meta?: {
                thresholds: {
                    redHue1: [number, number];
                    redHue2: [number, number];
                    greenHue: [number, number];
                    minSat: number;
                    minVal: number;
                    minAreaFrac: number;
                };
                counts: { redPx: number; greenPx: number; redRegions: number; greenRegions: number };
            }
        }>
        generateMatchMask?: (
            uri: string,
            maxSide: number,
            L: number, a: number, b: number,
            deltaE: number
        ) => Promise<{ overlayUri: string; width: number; height: number }>
    }
}

function assertAndroid() {
    if (Platform.OS !== 'android') throw new Error('Android-only feature. Build/run on Android.');
}

function ensure(method?: keyof NonNullable<typeof ProtanTools>) {
    assertAndroid();
    if (!ProtanTools) {
        // Dump available native modules to help diagnose registration issues
        const keys = Object.keys(NativeModules || {});
        throw new Error(`ProtanTools native module is missing. Found NativeModules: ${keys.join(', ')}. Are you running a Dev Build/bare app and did you rebuild after native changes?`);
    }
    if (method && !ProtanTools[method]) {
        const exported = Object.keys(ProtanTools);
        throw new Error(`ProtanTools.${String(method)} is missing. Exported methods: [${exported.join(', ')}]. Did you rebuild the app after changing native code?`);
    }
}

export async function generateBoundaryLossHeatmap(uri: string, maxSide = 360) {
    ensure('generateBoundaryLossHeatmap');
    return await ProtanTools!.generateBoundaryLossHeatmap!(uri, maxSide);
}

export async function samplePixels(uri: string, points: { x: number; y: number }[], maxSide = 1024) {
    ensure('samplePixels');
    return await ProtanTools!.samplePixels!(uri, maxSide, points);
}

export async function detectRedGreenRegions(
    uri: string,
    maxSide = 360,
    minSat = 0.35,
    minAreaFrac = 0.008,
    minVal = 0.20
) {
    ensure('detectRedGreenRegions');
    return await ProtanTools!.detectRedGreenRegions!(uri, maxSide, minSat, minAreaFrac, minVal);
}

export async function generateMatchMask(uri: string, L: number, a: number, b: number, deltaE = 18, maxSide = 360) {
    ensure('generateMatchMask');
    return await ProtanTools!.generateMatchMask!(uri, maxSide, L, a, b, deltaE);
}