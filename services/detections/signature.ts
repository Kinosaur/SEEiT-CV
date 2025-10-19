// Signature model and change classifier (category-free)

export type GroupSig = {
    nat: string;
    priority: number;     // lower = more important (e.g., critical labels get 0)
    totalBucket: number;  // coarse count bucket
    critical: boolean;
};

export type Signature = {
    groups: GroupSig[];
    hasCritical: boolean;
    sumBucket: number;
};

export function classifyChange(prev: Signature | null, curr: Signature): 'critical' | 'major' | 'minor' | 'none' {
    if (!prev) return 'critical';

    // Any flip in overall critical presence escalates
    if (prev.hasCritical !== curr.hasCritical) return 'critical';

    // Map for comparisons
    const prevMap = new Map(prev.groups.map(g => [g.nat, g]));
    const currMap = new Map(curr.groups.map(g => [g.nat, g]));

    // Critical label newly appearing
    for (const g of curr.groups) {
        if (g.critical && !prevMap.has(g.nat)) return 'critical';
    }

    // Large aggregate jump → major (no near-gate anymore)
    const totalJump = Math.abs(curr.sumBucket - prev.sumBucket) >= 2;

    let major = totalJump;

    // Per-group comparisons
    for (const g of curr.groups) {
        const pg = prevMap.get(g.nat);
        if (!pg) {
            // New group appeared
            major = true;
            continue;
        }
        // Priority change: treat as major (no category-based critical escalation now)
        if (pg.priority !== g.priority) major = true;

        // Coarse count change: treat as major
        if (pg.totalBucket !== g.totalBucket) major = true;
    }

    // Groups that disappeared
    for (const pg of prev.groups) {
        if (!currMap.has(pg.nat)) {
            major = true;
        }
    }

    if (major) return 'major';
    if (JSON.stringify(prev) === JSON.stringify(curr)) return 'none';
    return 'minor';
}