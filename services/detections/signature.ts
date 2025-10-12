/* ================= Signature Types and Classification ================= */

export type CatSeg = { cat: string; count: number };

export type GroupSig = {
    nat: string;
    priority: number;
    totalBucket: number;
    cats: CatSeg[];
    hasNear: boolean;
    critical: boolean;
};

export type Signature = {
    groups: GroupSig[];
    hasNear: boolean;
    hasCritical: boolean;
    sumBucket: number;
};

export function classifyChange(prev: Signature | null, curr: Signature): 'critical' | 'major' | 'minor' | 'none' {
    if (!prev) return 'critical';
    const criticalFlip = prev.hasCritical !== curr.hasCritical;
    if (criticalFlip) return 'critical';
    const nearGain = !prev.hasNear && curr.hasNear;
    if (nearGain) return 'critical';
    const totalJump = Math.abs(curr.sumBucket - prev.sumBucket) >= 2;
    if (totalJump && curr.hasNear) return 'critical';
    const prevMap = new Map(prev.groups.map(g => [g.nat, g]));
    const currMap = new Map(curr.groups.map(g => [g.nat, g]));
    for (const g of curr.groups) {
        if (g.critical && !prevMap.has(g.nat)) return 'critical';
    }
    let major = false;
    for (const g of curr.groups) {
        const pg = prevMap.get(g.nat);
        if (!pg) {
            major = major || g.hasNear;
            continue;
        }
        if (pg.priority !== g.priority) {
            if (g.priority < pg.priority) return 'critical';
            major = true;
        }
        if (pg.hasNear !== g.hasNear) major = true;
        if (pg.totalBucket !== g.totalBucket) major = major || g.hasNear;
        const prevCatsKey = pg.cats.map(c => `${c.cat}:${c.count}`).join('|');
        const currCatsKey = g.cats.map(c => `${c.cat}:${c.count}`).join('|');
        if (prevCatsKey !== currCatsKey) major = true;
    }
    for (const pg of prev.groups) {
        if (!currMap.has(pg.nat)) {
            major = major || pg.hasNear || pg.critical;
        }
    }
    if (major) return 'major';
    if (JSON.stringify(prev) === JSON.stringify(curr)) return 'none';
    return 'minor';
}
