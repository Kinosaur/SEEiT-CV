import { NATURAL_LABEL_MAP } from '@/constants/detection';

// Pure helpers for phrasing/counts (extracted from app/index.tsx)

export function bucketCount(n: number): number {
    if (n <= 2) return n;
    if (n <= 4) return 3;
    return 5;
}

export function naturalLabel(base?: string) {
    if (!base) return 'object';
    return NATURAL_LABEL_MAP[base] || base.replace(/_/g, ' ');
}

export function humanizeLabel(label: string) {
    return NATURAL_LABEL_MAP[label] || label.replace(/_/g, ' ');
}

export function pluralize(label: string, n: number) {
    if (n === 1) return label;
    if (label.endsWith('y') && !label.endsWith('ay') && !label.endsWith('ey')) return label.slice(0, -1) + 'ies';
    if (label.endsWith('s')) return label;
    return label + 's';
}

export function joinHuman(list: string[]): string {
    if (list.length <= 1) return list[0] ?? '';
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function estimateSpeechDurationMs(phrase: string) {
    const words = phrase.trim().split(/\s+/).filter(Boolean).length;
    return 500 + words * 350;
}

export function mapCountToSemanticBucket(n: number): 'none' | 'one' | 'few' | 'several' {
    if (n <= 0) return 'none';
    if (n === 1) return 'one';
    if (n <= 3) return 'few';
    return 'several';
}

export function bucketToPhrase(bucket: string, baseLabelPlural: string) {
    switch (bucket) {
        case 'none': return '';
        case 'one': return `one ${baseLabelPlural.replace(/s$/, '')}`;
        case 'few': return `a few ${baseLabelPlural}`;
        case 'several': return `several ${baseLabelPlural}`;
        default: return baseLabelPlural;
    }
}

export function postPhraseSanitize(p: string) {
    return p
        .replace(/\b(ahead)\s+\1\b/gi, '$1')
        .replace(/\b(directly ahead)\s+ahead\b/gi, 'directly ahead')
        .replace(/\b(close ahead)\b/gi, 'close')
        .replace(/\bnear distance\b/gi, 'near')
        .replace(/\s+/g, ' ')
        .trim();
}

// Grid-based direction wording from normalized center
export function directionDescriptor(xc: number, yc: number): string | null {
    const col = xc < 1 / 3 ? 0 : xc < 2 / 3 ? 1 : 2;
    const row = yc < 1 / 3 ? 0 : yc < 2 / 3 ? 1 : 2;
    if (row === 0) {
        if (col === 0) return 'upper left';
        if (col === 2) return 'upper right';
        return null;
    }
    if (row === 1) {
        if (col === 0) return 'left';
        if (col === 1) return 'directly ahead';
        if (col === 2) return 'right';
    } else {
        if (col === 0) return 'lower left';
        if (col === 2) return 'lower right';
        return null;
    }
    return null;
}