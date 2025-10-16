# Quick Code Reference Sheet

## Critical Functions to Mention

### BitmapIO.kt
- `decodeDownsampledOriented()` - Line ~75: Complete image processing pipeline
- `applyExifOrientation()` - Line ~20: EXIF rotation handling

### ColorSpaces.kt  
- `deltaE00()` - Line ~92: Full CIEDE2000 implementation
- `srgbToLab()` - Line ~80: Color space conversion pipeline

### CvdSimulation.kt
- `simulate()` - Line ~20: CVD matrix application in linear RGB
- Matrix constants - Lines 8-18: Viénot/Vischeck values

### ProtanToolsModule.kt
- `hueFamilyRGB()` - Line ~45: LCH-based color classification
- `computeConfidence()` - Line ~90: Three-signal confidence scoring
- `extract()` - Line ~200: Connected components with statistics
- Category assignment loop - Line ~150: First-hit precedence logic
- Filtering section - Line ~350: Aggressive pruning criteria

### colorBlindCameraScreen.tsx
- `runConfusions()` - Line ~148: JS-side filtering and native bridge
- `mapBox()` - Line ~280: Coordinate transformation
- `buildPillLabel()` - Line ~290: Smart label content
- Label sizing guards - Line ~320: Area and pixel thresholds

## Key Constants to Reference
- `CF_MIN_AREA_FRAC = 0.0035` - Minimum region area (0.35%)
- `MIN_DOM_FRACTION = 0.70` - Dominant family purity threshold  
- `MIN_BOX_W_FRAC/H_FRAC = 0.015` - Minimum box dimensions (1.5%)
- `MIN_LABEL_AREA_FRAC = 0.006` - Label visibility threshold (0.6%)
- High confidence: avgΔE ≥ 12.0, fracHigh ≥ 0.60, fracChange ≥ 0.55

## Attribution References
- CIEDE2000: CIE standard formula implementation
- CVD matrices: Viénot/Vischeck (see CvdSimulation.kt comments)
- Color spaces: ITU-R BT.709 standards
- Image processing: Android ExifInterface/BitmapFactory APIs