# Revised Presentation Script: Speech System + Color Finder

## Part 1: Speech System Continuation (3-4 minutes)
*[Continues from friend's object detection demo]*

### Transition from Object Detection (30 seconds)
"Thank you [Friend's name] for showing the object detection capabilities. Now let me demonstrate how we make this detection data **actionable** through intelligent speech narration.

The challenge isn't just detecting objects—it's converting noisy, rapid-fire detection data into **meaningful, non-repetitive audio guidance** that actually helps users navigate."

### Speech System Overview (45 seconds)
"Our speech system tackles three core problems:

**First**: Raw computer vision is jittery—objects flicker in and out, classifications change rapidly between frames. We need **temporal smoothing**.

**Second**: Not all detections are equally important. A stop sign deserves immediate attention; a distant car can wait.

**Third**: Avoid speech chatter. Users don't want 'car near, car far, car near' every frame—they want stable, meaningful updates."

### Live Speech Demo (90 seconds)
*[Using the object detection screen with speech enabled]*

"Let me show you this in action. I'll enable speech and walk through different scenarios:

*[Point camera at single object]*
**Scenario 1**: Single critical object
*[Audio: "Stop sign directly ahead"]*
→ **Critical priority** because stop signs require immediate attention
→ Notice the directional guidance: 'directly ahead', 'left', 'right'

*[Point camera at multiple objects]*  
**Scenario 2**: Multiple objects
*[Audio: "3 cars: 1 close left, 2 ahead"]*
→ **Grouped narration** with distance categories and locations
→ The system prioritizes closer objects and groups by type

*[Keep camera steady on same scene]*
**Scenario 3**: Temporal stability  
→ **No repeated speech** even though detection continues
→ Our signature-based change detection prevents chatter"

### Technical Architecture Highlight (60 seconds)
"The speech pipeline has three key components:

**Temporal Smoothers**: Each detected object gets tracked by ID across frames. We require 3 consecutive frames of the same classification before considering it 'stable.' Brief interruptions don't break stability.

**Signature-Based Change Detection**: Instead of reacting to every detection fluctuation, we compare the **structural meaning** of scenes—what types of objects, how many, at what distances. Only meaningful changes trigger speech.

**Priority-Based Speech Supervisor**: Critical announcements (stop signs, hazards) interrupt lower-priority ones. We enforce minimum intervals between announcements to prevent overwhelming users."

*[Optional code callout if time permits]*
"This signature comparison happens in `useLiveDetectionsSpeech.ts`—we build semantic fingerprints of each frame and only speak when the fingerprint changes meaningfully."

---

## Part 2: Transition to Color Finder (30 seconds)

"The object detection and speech system handles **macro navigation**—identifying and announcing objects in the environment. But there's another challenge for users with color vision deficiencies: **micro-level color confusion**.

When someone with protanopia or deuteranopia looks at an image, certain color combinations become indistinguishable. They might not realize a red sign appears black to them, or that green and orange look identical."

*[Gesture transition to next demo]*

"This brings us to our **Color Finder** system—a scientifically-grounded tool that simulates color vision deficiencies and flags potentially confusing regions with perceptual precision."

---

## Part 3: Color Finder Presentation (7 minutes)
*[Your original color finder presentation script follows here]*

### Slide 1: Problem and Promise (45 seconds)
"**The goal**: help people with red-green color vision deficiencies identify regions in images that are likely to be confused.

**The promise**: We don't guess by RGB differences. Instead, we simulate actual visual perception using established color science, measure perceptual differences with industry-standard metrics, and surface only regions with strong evidence. This is precision over recall—fewer false positives, more trust."

### Slide 2: Pipeline Overview (60 seconds)
"Here's our end-to-end pipeline:

We start with image capture or import, handle device orientation through EXIF metadata, then pass to our Kotlin native module. The core engine performs pixel-level color classification using perceptually-uniform color spaces, simulates protanopia and deuteranopia vision, then groups pixels into connected regions.

Each region gets robust statistical analysis—we compute confidence using three independent signals: average perceptual difference, consistency across pixels, and semantic color family changes. After aggressive filtering, React Native renders normalized overlay boxes with true-versus-simulated color swatches."

**Code Anchors:**
- `BitmapIO.kt`: `decodeDownsampledOriented`, `readExifOrientation`
- `ProtanToolsModule.kt`: `hueFamilyRGB`, `CvdSimulation.simulate`, `extract()`
- `colorBlindCameraScreen.tsx`: `runConfusions`, `mapBox`

### Slide 3: Color Classification Science (90 seconds)
"Traditional approaches use HSV hue, but this breaks down catastrophically at low saturation or brightness—exactly where color vision deficiencies cause problems.

We use **LCH color space** derived from CIE Lab. LCH provides stable hue angles and explicit lightness/chroma dimensions. This lets us robustly distinguish neutrals (black, white, gray), handle edge cases like pink (bright, desaturated reds) and brown (dark, warm hues), then classify into semantic families.

For CVD simulation, we apply **Viénot-Vischeck transformation matrices** in linear RGB space—these are established approximations used industry-wide. We convert sRGB to linear, apply the 3×3 transformation, then convert back."

**Code References:**
- `ProtanToolsModule.kt`: `rgbToLch()` → `hueFamilyRGB()`
- `CvdSimulation.kt`: `simulate()` with linear RGB processing
- **Attribution**: Viénot/Vischeck matrices (referenced in comments)

### Slide 4: Perceptual Measurement (45 seconds)
"We measure color differences using **CIEDE2000 ΔE**—the gold standard in color science. Unlike Euclidean RGB distance, ΔE00 incorporates human visual perception research: it's weighted for hue-dependent sensitivity, includes lightness-chroma interactions, and handles edge cases in blue regions.

Each pixel gets its ΔE calculated between original and simulated colors. This gives us a perceptually meaningful confusion metric."

**Code Reference**: `ColorSpaces.kt`: `deltaE00()` (full CIEDE2000 implementation)

### Slide 5: Category System and Precedence (60 seconds)
"We define specific confusion categories: `protan_red_black` (red becomes black), `deutan_purple_blue` (purple becomes blue), shared categories like general blue-purple confusion.

**Critical design choice**: First-hit wins per pixel. This keeps category masks disjoint—no double-counting, clean statistics. Category precedence is intentional: we prioritize more diagnostically significant confusions.

Categories combine family-change detection with perceptual thresholds and sometimes additional guards like minimum saturation."

**Code Reference**: `ProtanToolsModule.kt`: `cats[]` array, `setCat()` function

### Slide 6: Connected Components and Evidence (90 seconds)
"We extract connected components using 4-neighbor flood-fill per category. Each region accumulates comprehensive statistics during the single-pass BFS:
- True and simulated RGB means (from per-pixel sums, not re-simulation)
- Color family histograms and dominant family purity  
- Per-pixel ΔE accumulation and high-ΔE counters
- Family-change tallies

This gives us three independent confidence signals: average perceptual difference, fraction of high-ΔE pixels (consistency), and fraction changing families (semantic agreement)."

**Code Reference**: `ProtanToolsModule.kt`: `extract(mask)`, `Region` data class

### Slide 7: Multi-Signal Confidence and Filtering (75 seconds)
"Confidence computation requires **all three signals**:
- **High confidence**: ΔE ≥ 12.0 AND ≥60% pixels have high ΔE AND ≥55% change families
- **Medium**: Relaxed thresholds
- **Low**: Everything else

Then aggressive filtering for demo quality:
- Keep only 'high' confidence for relevant CVD type
- Dominant family purity ≥ 70% (tightened to reduce noise)
- Mean saturation ≥ max(input threshold, 35%)
- Minimum box dimensions (1.5% of image width/height)
- Top 6 regions by area per category"

**Code Reference**: `ProtanToolsModule.kt`: `computeConfidence()`, pruning constants

### Slide 8: React Native Integration (45 seconds)
"The native module returns normalized coordinates (0-1) and comprehensive region metadata. JavaScript handles platform-specific URI formatting, filters by user's selected confidence level and CVD mode, then maps normalized boxes to screen coordinates using aspect-ratio-preserving transformations.

The UI provides smart label sizing—name pills only appear if regions are large enough by both area percentage and pixel dimensions."

**Code References**:
- `ProtanTools.ts`: Android-only native bridge
- `colorBlindCameraScreen.tsx`: `mapBox`, `computeContainedRect`

### Slide 9: Attribution and Limitations (60 seconds)
"**Attribution**: This integrates established techniques, not novel algorithms. CIEDE2000 follows the standard formula. CVD simulation uses Viénot/Vischeck matrices (referenced in source). Color space conversions use ITU-R BT.709 standards.

**Key limitations**:
- Viénot matrices are population averages—not personalized
- Hue family boundaries are heuristic; edge cases exist in unusual lighting
- We optimize for precision over recall—'Show low confidence' trades quality for coverage
- Android-only in current implementation"

---

## Part 4: Live Color Finder Demo (6 minutes)

### Demo Step 1: Import and Core Analysis (90 seconds)
"Let me demonstrate the color finder with a test image containing known color confusions.

*[Navigate to Color Finder screen, tap Import]*

**Narrating the process**: JavaScript calls `detectConfusableColors()` with our URI, max dimension 360px, and thresholds. The native code decodes with downsampling, applies EXIF orientation correction, then runs our full pipeline.

*[Point to overlay boxes and legend]*

Notice the numbered regions and color legend. Each swatch shows the **true color** versus **simulated color** for protanopia and deuteranopia. These aren't guessed—they're computed from per-pixel simulation averages during connected component analysis."

### Demo Step 2: Mode Filtering (75 seconds)
"Watch what happens when I change detection modes.

*[Cycle through Both → Protan → Deutan → Both]*

In **Protan mode**, we keep only regions where protanopia shows high confidence. **Deutan mode** shows deuteranopia risks. **Both mode** includes either type plus shared confusions.

*[Point to regions appearing/disappearing]*

This filtering uses each region's `riskFor` field—some confusions affect both CVD types, others are specific. Notice how the region count changes as we filter by relevance."

### Demo Step 3: Confidence and Labeling (90 seconds)
"By default, we show only high-confidence regions for precision.

*[Toggle 'Show low-conf' on/off]*

**With low confidence ON**: More boxes appear with weaker evidence. We maintain strict defaults because false positives erode trust.

*[Switch label modes: Numbers → Names → Off]*

**Names mode** shows transformations: 'red → black ↑' means red becomes black with high confidence. The up arrow indicates high confidence for this specific CVD type.

Notice sizing guards prevent unreadable labels on small regions."

### Demo Step 4: Live Capture (45 seconds)
"The system also works with live camera capture.

*[Capture photo of colorful scene]*

Same pipeline—Vision Camera provides the image, we ensure proper file formatting, then analyze. Processing speed demonstrates efficient on-device computation."

---

## Part 5: Q&A Preparation (3 minutes)

### Technical Questions
**Q: How do the speech and color systems relate?**
**A**: They address different navigation challenges. Speech handles dynamic object detection for macro navigation. Color finder handles static image analysis for micro-level color confusion identification. Both use perceptually-based approaches rather than crude thresholding.

**Q: Why separate the two systems?**
**A**: Different use cases and processing requirements. Object detection needs real-time frame processing with temporal smoothing. Color analysis needs high-precision static image processing with connected component analysis. Combining them would compromise both.

**Q: Could color analysis work in real-time?**
**A**: Theoretically yes, but battery drain would be significant and accuracy might suffer from motion blur. The current capture-then-analyze approach provides better precision for color-critical decisions.

### Integration Questions
**Q: How do you handle the transition between systems?**
**A**: Clean separation with distinct UI screens. Users can switch between real-time navigation (object detection + speech) and detailed color analysis (color finder) based on their immediate needs.

**Q: What's the overall user experience flow?**
**A**: Users start with live object detection for general navigation, then switch to color finder when they encounter specific images or scenes where color confusion might be problematic—signs, displays, clothing, etc.

---

## Timing Summary
- **Speech System Continuation**: 3-4 minutes
- **Color Finder Presentation**: 7 minutes  
- **Color Finder Demo**: 6 minutes
- **Q&A Buffer**: 3 minutes
- **Total**: ~19-20 minutes

This structure provides smooth flow from object detection → speech → color finder while maintaining clear boundaries between your friend's work and your contributions.
