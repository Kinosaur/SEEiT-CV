# Q&A Preparation Guide

## Technical Questions

### Q: "Why LCH color families instead of HSV?"
**A**: "HSV hue becomes unstable at low saturation or brightness—exactly where CVD causes problems. LCH provides robust hue angles across the entire lightness/chroma range and explicit dimensions for handling neutrals, pink, and brown edge cases."

### Q: "Why ΔE threshold of 12.0 for high confidence?"
**A**: "ΔE 12+ indicates strong perceptual difference in our testing. But we don't rely on ΔE alone—we require 60% of pixels show high ΔE AND 55% change color families. This three-signal approach prevents false positives from isolated noisy pixels."

### Q: "How accurate are the CVD simulations?"
**A**: "Viénot/Vischeck matrices are population-level approximations, not personalized. They're widely used but don't capture individual variation in CVD severity or type. For clinical applications, you'd need observer-specific calibration data."

### Q: "Why do so many regions disappear when I toggle modes?"
**A**: "We optimize for precision over recall. Each region has a 'riskFor' field—some confusions are protan-specific, others deutan-specific. Mode filtering ensures you see only relevant risks. The 'Show low-conf' toggle trades precision for coverage if needed."

### Q: "What's the performance profile?"
**A**: "Single pass over downsampled pixels (≤360px max), BFS per category for connected components, then statistical analysis. Typically under 500ms on modern Android devices. The native implementation avoids JS overhead for pixel-intensive operations."

## Implementation Questions

### Q: "Why first-hit category precedence?"
**A**: "Keeps category masks disjoint—no pixel counted twice, cleaner statistics. Priority ordering encodes which confusions we consider more diagnostically significant for the user."

### Q: "Why Android-only?"
**A**: "The native module currently exists only on Android. iOS would need a parallel implementation or we could explore a JavaScript fallback using WebGL shaders, though that would be slower."

### Q: "Could this work in real-time on camera preview?"
**A**: "Theoretically yes with frame sampling and aggressive optimization, but battery drain would be significant. The current capture-then-analyze flow provides better user experience and accuracy."

## Algorithmic Questions  

### Q: "How do you handle edge cases in color classification?"
**A**: "Our LCH-based approach handles most edge cases explicitly—neutrals by low chroma, pink by high lightness + moderate chroma, brown by low lightness + warm hue. Some unusual lighting conditions might still cause misclassification, but we prefer false negatives over false positives."

### Q: "What about other CVD types like tritanopia?"
**A**: "Blue-yellow CVD (tritanopia) is much rarer and has different confusion patterns. Adding support would require new simulation matrices and category definitions, but the architecture could handle it."

### Q: "How would you validate accuracy?"
**A**: "Ideally with controlled studies using observers with confirmed CVD types, standardized test images, and comparison to their actual confusion reports. We'd need both precision metrics (how many flagged regions are actually confusing) and recall (how many actual confusions we catch)."

## Practical Questions

### Q: "What about different lighting conditions?"
**A**: "Color appearance changes dramatically with illumination. Our analysis works in the device's captured color space but doesn't account for viewing condition changes. Professional color management would require controlled lighting or color adaptation transforms."

### Q: "Could this help with color selection in design?"
**A**: "Absolutely. Designers could test palettes or UI elements before finalizing. The same pipeline could analyze design mockups and flag problematic color combinations early in the process."

### Q: "What's next for this project?"
**A**: "Potential improvements: iOS support, real-time preview mode, personalized calibration, tritanopia support, and integration with design tools. The core pipeline is solid; it's about expanding accessibility and use cases."