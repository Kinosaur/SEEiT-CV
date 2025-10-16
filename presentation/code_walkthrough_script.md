# Code Walkthrough Script

## File Navigation Order (3-4 minutes total)

### BitmapIO.kt (30 seconds)
**Show**: `normalizePath`, `readExifOrientation`, `applyExifOrientation`, `decodeDownsampledOriented`

**Narration**: "Mobile image processing fundamentals. We normalize `file://` URIs because Android's ExifInterface expects raw paths. EXIF orientation fixes rotated camera photos. Power-of-2 downsampling keeps memory usage reasonable while preserving analysis accuracy."

### ColorSpaces.kt (45 seconds)  
**Show**: `srgbToLinear`/`linearToSrgb`; `rgbLinToXyz`/`xyzToLab`; `deltaE00`

**Narration**: "The mathematical foundation. Gamma correction removal for linear operations. sRGB to XYZ to Lab color space transforms using ITU-R BT.709 matrices. The deltaE00 function is a complete CIEDE2000 implementation—200+ lines of perceptual weighting, hue handling, and interaction terms."

### CvdSimulation.kt (30 seconds)
**Show**: `simulate()` function, matrix constants

**Narration**: "CVD simulation using Viénot/Vischeck 3×3 matrices. Key insight: operate in linear RGB space where color mixing is physically correct, then convert back to sRGB. Simple but effective approximation used industry-wide."

### ProtanToolsModule.kt (2-3 minutes) 
**Show in order**:
1. `hueFamilyRGB()`: "LCH-based color naming with explicit neutral, pink, brown handling"
2. Pixel classification loop: "Per-pixel simulation, ΔE calculation, category assignment with first-hit precedence"  
3. `extract()` function: "4-neighbor BFS collecting region statistics during single traversal"
4. Region processing: "Mean computation, dominant family, confidence calculation with three-signal approach"
5. Filtering section: "Aggressive pruning—confidence, purity, saturation, size guards"

**Key Narration Points**:
- "Notice `setCat()` early returns—first category wins, keeps masks disjoint"  
- "Region statistics accumulated during BFS, not recomputed—efficient single pass"
- "`computeConfidence()` requires ALL THREE signals for high confidence"

### ProtanTools.ts (15 seconds)
**Show**: Platform guards, type definitions

**Narration**: "React Native bridge with defensive programming. Platform checks prevent iOS crashes. Type definitions ensure native/JS alignment."

### colorBlindCameraScreen.tsx (60-90 seconds)
**Show**:
1. `runConfusions()`: "JS-side filtering by confidence and CVD mode"
2. `mapBox()` + `computeContainedRect()`: "Coordinate transformation from normalized to screen pixels"  
3. Label rendering logic: "Smart sizing with dual guards—area fraction AND pixel dimensions"
4. Legend building: "True vs simulated color swatches"

**Key Points**:
- "Filtering happens twice—native pruning for performance, JS filtering for UI state"
- "Coordinate mapping preserves aspect ratio, handles different screen sizes"
- "Accessibility announcements throughout for screen reader users"