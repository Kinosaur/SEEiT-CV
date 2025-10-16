# Essential Code Reference

Quick reference for key code snippets to show during presentation.

## Speech System Code Snippets

### Temporal Smoothing (useDirectionSmoothing.ts)
```typescript
// Per-object caches track stability over time
const smoothDirection = (id: number, rawDir: StableDirection, now: number) => {
    let entry = cache.get(id);
    if (rawDir === entry.current) {
        entry.count += 1;  // Build stability
    } else {
        entry.current = rawDir;
        entry.count = 1;   // Reset on change
    }
    // Only update stable direction after enough consistent frames
    if (entry.count >= DIR_STABLE_FRAMES) entry.stable = rawDir;
}
```

### Priority System (speechSupervisor.ts)
```typescript
public requestSpeak(phrase: string, priority: SpeechPriority) {
    if (priority === 'critical') {
        // Critical speech can interrupt anything
        if (elapsed >= this.interruptGraceMs) {
            this.finishCurrent(now);
            this.start(phrase, priority);
        }
    }
    // Major/minor speech respects intervals and existing speech
}
```

### Change Detection (signature.ts)
```typescript
export function classifyChange(prev: Signature, curr: Signature): 'critical' | 'major' | 'minor' {
    // Critical: Safety-relevant changes (new obstacles, critical objects)
    if (prev.hasCritical !== curr.hasCritical) return 'critical';
    
    // Major: New object types, spatial changes
    if (!prev.hasNear && curr.hasNear) return 'critical';
    
    // Minor: Count changes, refinements
    return 'minor';
}
```

## Color Finder Code Snippets

### Native Processing Entry (ProtanToolsModule.kt)
```kotlin
@ReactMethod
fun detectConfusableColors(
    inputUri: String, maxSide: Int, mode: String,
    minAreaFrac: Double, minSat: Double, minVal: Double,
    promise: Promise
) {
    // Native processing for performance-critical image analysis
}
```

### CVD Simulation (CvdSimulation.kt)
```kotlin
// Viénot/Vischeck matrices for accurate CVD simulation
private val PROTAN_3x3 = floatArrayOf(
    0.56667f, 0.43333f, 0.0f,
    0.55833f, 0.44167f, 0.0f,
    0.0f,     0.24167f, 0.75833f
)

fun simulate(rgb_srgb: FloatArray, type: String): FloatArray {
    // Convert sRGB -> linear -> simulate -> sRGB
    val rlin = ColorSpaces.srgbToLinear(rgb_srgb[0])
    // Apply transformation matrix
    val outLin = mul3x3(M, floatArrayOf(rlin, glin, blin))
    return floatArrayOf(rs, gs, bs)
}
```

### Smart Color Classification (ProtanToolsModule.kt)
```kotlin
private fun hueFamilyRGB(rs: Float, gs: Float, bs: Float): String {
    val lch = rgbToLch(rs, gs, bs)
    val L = lch.L; val C = lch.C; val h = lch.h

    // Smart color naming using LCH color space
    if (L <= 15f) return "black"
    if (C <= 6f) return if (L >= 90f) "white" else "grey"
    
    // Chromatic families based on hue ranges
    return when {
        h >= 345f || h < 20f -> "red"
        h < 45f -> "orange"
        h < 85f -> "yellow"
        // ... more hue families
    }
}
```

### Connected Components
```kotlin
// 4-neighbor BFS to find coherent color regions
val queue = ArrayDeque<Pair<Int, Int>>()
queue.add(Pair(startX, startY))

while (queue.isNotEmpty()) {
    val (x, y) = queue.removeFirst()
    // Check if neighbors belong to same color family
    if (hueFamilyRGB(r, g, b) == targetFamily) {
        visited[y * width + x] = true
        queue.add(Pair(x + dx, y + dy))
    }
}
```

### Multi-Signal Confidence
```kotlin
private fun computeConfidence(avgDE: Double, fracHighDE: Double, fracFamChange: Double): String {
    // Three-signal approach for robust confidence
    if (avgDE >= 12.0 && fracHighDE >= 0.60 && fracFamChange >= 0.55) return "high"
    if (avgDE >= 10.0 && fracHighDE >= 0.45) return "med"
    return "low"
}
```

### React Native Integration (colorBlindCameraScreen.tsx)
```typescript
const runConfusions = async () => {
    setAnalyzing(true);
    try {
        const result = await detectConfusableColors(
            imageUri, 360, 'both', 
            CF_MIN_AREA_FRAC, CF_MIN_SAT, CF_MIN_VAL
        );
        setRegions(result.regions);
    } finally {
        setAnalyzing(false);
    }
};
```