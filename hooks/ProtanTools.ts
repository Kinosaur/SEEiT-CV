import { NativeModules, Platform } from 'react-native';

const { ProtanTools } = NativeModules as {
    ProtanTools?: {
        generateBoundaryLossHeatmap: (uri: string, maxSide: number) => Promise<{ overlayUri: string; width: number; height: number }>
        samplePixels: (
            uri: string,
            maxSide: number,
            points: { x: number; y: number }[]
        ) => Promise<{
            width: number; height: number;
            samples: {
                x: number; y: number;
                r: number; g: number; b: number;
                rSim: number; gSim: number; bSim: number;    // simulated RGB
                L: number; a: number; bLab: number;          // original Lab
                LSim: number; aSim: number; bLabSim: number; // simulated Lab
                deltaE: number;
            }[]
        }>
        detectRedGreenRegions: (
            uri: string,
            maxSide: number,
            minSat: number,
            minAreaFrac: number
        ) => Promise<{
            width: number; height: number;
            regions: { label: 'red' | 'green'; x: number; y: number; w: number; h: number; areaFrac: number; hue: number; sat: number }[]
        }>
        generateMatchMask: (
            uri: string,
            maxSide: number,
            L: number, a: number, b: number,
            deltaE: number
        ) => Promise<{ overlayUri: string; width: number; height: number }>
    }
}

function assertAndroid() {
    if (Platform.OS !== 'android') throw new Error('Android-only');
}
function ensure() {
    assertAndroid();
    if (!ProtanTools) throw new Error('ProtanTools not available');
}

export async function generateBoundaryLossHeatmap(uri: string, maxSide = 360) {
    ensure();
    return await ProtanTools!.generateBoundaryLossHeatmap(uri, maxSide);
}
export async function samplePixels(uri: string, points: { x: number; y: number }[], maxSide = 1024) {
    ensure();
    return await ProtanTools!.samplePixels(uri, maxSide, points);
}
export async function detectRedGreenRegions(uri: string, maxSide = 360, minSat = 0.35, minAreaFrac = 0.008) {
    ensure();
    return await ProtanTools!.detectRedGreenRegions(uri, maxSide, minSat, minAreaFrac);
}
export async function generateMatchMask(uri: string, L: number, a: number, b: number, deltaE = 18, maxSide = 360) {
    ensure();
    return await ProtanTools!.generateMatchMask(uri, maxSide, L, a, b, deltaE);
}