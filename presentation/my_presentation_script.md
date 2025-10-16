# My Presentation Script - SEEiT CV
## Complete Presentation Flow (19-20 minutes total)

### Part 1: Transition from Friend's Object Detection (2 minutes)
**[After friend finishes object detection demo]**

"Thank you [friend's name]. As you can see, the object detection works great for identifying what's in the scene. But detection alone isn't enough for accessibility - users need to understand where objects are and get intelligent audio feedback. 

Let me show you the speech functionality I built on top of this detection system."

**[Take control of the object detection screen]**

---

### Part 2: Speech System Demo & Explanation (4-5 minutes)

#### Demo Script:
1. **Enable Speech**: "First, I'll turn on the speech functionality"
2. **Point camera at objects**: "Listen as the system describes what it detects"
3. **Move camera around**: "Notice how it handles multiple objects intelligently"
4. **Show near/far detection**: "The system understands spatial relationships"
5. **Demonstrate interruption**: "Critical detections can interrupt less important speech"

#### Technical Explanation:
"The speech system I developed has three key innovations:

**1. Temporal Smoothing** - Instead of speaking every noisy detection, I built smoothing algorithms that wait for stable, consistent detections before speaking."

**[Show code: `useDirectionSmoothing.ts`]**
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

**2. Intelligent Priority System** - Not all detections are equally important."

**[Show code: `speechSupervisor.ts`]**
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

**3. Smart Grouping & Change Detection** - The system groups similar objects and only speaks when something meaningful changes."

**[Show code: `signature.ts`]**
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

---

### Part 3: Transition to Color Finder (1 minute)
"This speech system works great for real-time object detection. But our app serves users with color vision deficiency, who face a different challenge - distinguishing colors in static images. 

For this, I built a completely different system: the Color Finder. Let me switch to that screen and show you how it works."

**[Navigate to Color Finder screen]**

---

### Part 4: Color Finder System Demo & Deep Dive (12-13 minutes)

#### Demo Script:
1. **Load test image**: "I'll start with this image that has challenging colors for protanopia users"
2. **Run analysis**: "Watch as the system processes the image"
3. **Show results**: "Here are the detected confusion regions with confidence levels"
4. **Explain labels**: "Each region shows the true color and what someone with CVD might see"
5. **Show different CVD types**: "The system handles both protanopia and deuteranopia"

#### Technical Deep Dive:

**"Let me show you how this color confusion detection actually works under the hood."**

##### 1. Architecture Overview (2 minutes)
"The system uses a hybrid approach - React Native UI with native Android processing for performance."

**[Show: `ProtanToolsModule.kt` - main entry point]**
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

##### 2. Color Science Foundation (3 minutes)
"The core is advanced color science. We simulate color vision deficiency using research-grade matrices."

**[Show: `CvdSimulation.kt`]**
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

"But simulation alone isn't enough. We need perceptually accurate difference measurement."

**[Show: `ColorSpaces.kt` - CIEDE2000]**
```kotlin
@JvmStatic fun deltaE00(Lab1: FloatArray, Lab2: FloatArray): Float {
    // CIEDE2000 - the gold standard for perceptual color difference
    // Accounts for human visual system nonlinearities
}
```

##### 3. Intelligent Region Detection (4 minutes)
"Here's where it gets interesting. Instead of just comparing individual pixels, we find meaningful color regions."

**[Show: `ProtanToolsModule.kt` - pixel classification]**
```kotlin
private fun hueFamilyRGB(rs: Float, gs: Float, bs: Float): String {
    val lch = rgbToLch(rs, gs, bs)
    val L = lch.L
    val C = lch.C
    val h = lch.h

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

"Then we use flood-fill to find connected regions of similar colors."

**[Show: connected components algorithm]**
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

##### 4. Multi-Signal Confidence System (2 minutes)
"Finally, we use a sophisticated confidence system to avoid false positives."

**[Show: confidence computation]**
```kotlin
private fun computeConfidence(avgDE: Double, fracHighDE: Double, fracFamChange: Double): String {
    // Three-signal approach for robust confidence
    if (avgDE >= 12.0 && fracHighDE >= 0.60 && fracFamChange >= 0.55) return "high"
    if (avgDE >= 10.0 && fracHighDE >= 0.45) return "med"
    return "low"
}
```

"This combines:
- **Average ΔE**: Overall perceptual difference
- **High-ΔE fraction**: How many pixels show strong confusion  
- **Family change fraction**: How many pixels change color category"

##### 5. React Native Integration (1 minute)
"The UI seamlessly bridges to this native processing."

**[Show: `colorBlindCameraScreen.tsx`]**
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

---

### Part 5: Key Technical Achievements (1 minute)
"To summarize my technical contributions:

1. **Speech Intelligence**: Built temporal smoothing, priority queuing, and change detection for natural audio feedback
2. **Color Science Integration**: Implemented research-grade CVD simulation with CIEDE2000 perceptual metrics  
3. **Computer Vision**: Developed connected components analysis with multi-signal confidence scoring
4. **Cross-Platform Architecture**: Created seamless React Native to Android native bridge for performance

These aren't just academic implementations - they solve real accessibility problems for users with visual impairments."

---

### Backup Slides/Demos (if time allows):
1. **Performance metrics**: "Processing a 360px image in ~200ms"
2. **Edge cases**: "Handling mixed colors, small regions, low contrast"
3. **User testing**: "Validated with users who have protanopia"

---

### Q&A Preparation:
- **Why native Android?** Performance for real-time image processing
- **CVD matrices accuracy?** Based on Viénot research, widely used standard
- **Speech interruption logic?** Critical safety alerts override everything
- **False positive handling?** Multi-signal confidence + area thresholds
- **Scalability?** Optimized for mobile, could scale to server processing

---

## Code Files to Have Ready:
1. `useDirectionSmoothing.ts` - Temporal smoothing logic
2. `speechSupervisor.ts` - Priority and interruption handling  
3. `signature.ts` - Change detection algorithm
4. `ProtanToolsModule.kt` - Main native processing
5. `CvdSimulation.kt` - CVD simulation matrices
6. `ColorSpaces.kt` - CIEDE2000 implementation
7. `colorBlindCameraScreen.tsx` - UI integration

## Timing Guide:
- Speech demo + explanation: 4-5 minutes
- Color finder demo: 2 minutes  
- Technical deep dive: 10-11 minutes
- Wrap up + transitions: 2-3 minutes
- **Total: 19-20 minutes**