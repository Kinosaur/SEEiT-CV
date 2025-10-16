# Speech System Demo Script (Standalone)

## Quick 3-Minute Speech Demo (If Time is Limited)

### Opening (15 seconds)
"Let me show how we transform noisy object detection into intelligent speech guidance. The challenge isn't just detecting objects—it's providing **stable, meaningful audio feedback** without overwhelming the user."

### Core Demo (2 minutes)
*[Enable speech on object detection screen]*

**Scenario 1: Single Critical Object** (30 seconds)
*[Point camera at stop sign]*
→ Listen: "Stop sign directly ahead"
"**Critical priority** - safety-related objects get immediate attention with precise directional guidance."

**Scenario 2: Multiple Objects** (45 seconds)  
*[Point camera at parking lot with multiple cars]*
→ Listen: "3 cars: 1 close left, 2 ahead"
"**Grouped narration** - we combine objects of the same type and provide distance/direction breakdown. Notice the prioritization: closer objects mentioned first."

**Scenario 3: Stability Demo** (45 seconds)
*[Keep camera steady on same scene for 10 seconds]*
→ Listen: [Silence after initial announcement]
"**No repetitive speech** - our signature-based system only speaks on meaningful changes, not detection noise. The system is still detecting but recognizes the scene is unchanged."

### Technical Highlight (30 seconds)
"Three key innovations make this work:
1. **Per-object smoothing** - 3 consecutive frames required for stability
2. **Signature comparison** - structural scene changes trigger speech, not raw detection fluctuations  
3. **Priority interruption** - critical objects can interrupt lower-priority announcements

This prevents speech chatter while ensuring important information gets through."

---

## Extended Speech Demo Script (If You Have More Time)

### Introduction (30 seconds)
"Building on [Friend's name]'s object detection demo, let me show how we make this detection data **actionable** through intelligent speech narration. Raw computer vision gives us noisy, rapid-fire data—our challenge is converting that into stable, helpful guidance."

### Problem Statement (45 seconds)
"Three core challenges with detection-to-speech:

**Temporal instability**: Objects flicker in/out, classifications jitter between frames
**Priority confusion**: Not all detections are equally urgent—stop signs vs. distant trees
**Speech chatter**: Users don't want constant narration on minor changes

Our solution uses **temporal smoothing**, **semantic prioritization**, and **signature-based change detection**."

### Detailed Demo Scenarios (3.5 minutes)

#### Scenario A: Critical Object Response (60 seconds)
*[Point camera at stop sign]*
→ Audio: "Stop sign directly ahead"

"**Critical priority** because stop signs are in our `CRITICAL_LABELS` set. Notice several things:
- **Immediate speech** - no delay for stabilization
- **Directional precision** - 'directly ahead' from our 3×3 grid mapping
- **Interruption capability** - this would interrupt lower-priority speech"

*[Move camera to show stop sign at different positions]*
→ Audio: "Stop sign left" → "Stop sign upper right"

"Direction updates as we move, using normalized coordinate mapping in `directionDescriptor()`."

#### Scenario B: Multi-Object Grouping (90 seconds)
*[Point camera at area with multiple vehicles]*
→ Audio: "4 cars: 2 close left, 1 ahead, 1 far right"

"**Grouped narration** with distance breakdown. Let me explain the pipeline:

1. Objects get grouped by natural label ('car', 'truck', etc.)
2. Distance categories ('close', 'ahead', 'far') come from smoothed detection confidence
3. Spatial distribution gets summarized by priority - closest mentioned first
4. We limit to 3 groups maximum to prevent overwhelming speech"

*[Show code reference if screen sharing]*
"This grouping happens in `buildGroupPhrase()` - we bucket counts and prioritize by distance."

#### Scenario C: Temporal Stability (60 seconds)
*[Keep camera steady on same multi-object scene]*
→ Initial audio: "2 cars close ahead, bicycle right"
→ Following frames: [Silence]

"**No repeated speech** despite ongoing detection. Our signature system compares structural meaning:
- Object types and counts (bucketed)
- Distance priorities 
- Spatial distribution
- Critical object presence

Only **meaningful changes** trigger new speech - identical signatures = silence."

#### Scenario D: Priority Interruption (60 seconds)
*[Start with non-critical objects, then quickly show critical object]*
→ Audio starts: "3 cars..."
*[Show stop sign]*
→ Audio interrupts: "Stop sign directly ahead"

"**Dynamic interruption** based on priority hierarchy:
- Critical objects (stop signs, hazards) interrupt everything after 1.6s grace period
- Major updates (new near objects) interrupt minor ones
- Minor updates get queued or dropped if too frequent

This ensures safety-critical information always gets through."

### Technical Deep-Dive (Optional - 60 seconds)
*[If audience is technical]*

"The speech pipeline has three stages:

**Stage 1: Smoothing** (`useDirectionSmoothing`, `useDistanceCategorySmoothing`)
- Per-ID caches with consecutive frame requirements
- Null grace periods for brief missing data
- TTL cleanup for disappeared objects

**Stage 2: Signature Generation** (`useLiveDetectionsSpeech`)
- Group by natural label, compute priorities
- Build semantic fingerprint of current scene
- Compare with previous signature for change classification

**Stage 3: Delivery** (`speechSupervisor`, `useSpeechChannel`)  
- Single-lane queue with priority-based interruption
- Minimum interval enforcement (2.8s major, 4.2s minor)
- TTS integration with fallback completion timing"

### Wrap-up (30 seconds)
"This architecture provides **stable, meaningful, non-repetitive** audio feedback. Users get the information they need for navigation without speech overload. The system handles the complexity of temporal smoothing and priority management automatically."

---

## Code References for Demo

### Key Functions to Mention
- `smoothDirection()` - Per-ID temporal smoothing with consecutive frame requirements
- `buildGroupPhrase()` - Multi-object narration with distance/direction breakdown  
- `classifyChange()` - Signature comparison for change detection
- `requestSpeak()` - Priority-based speech queuing with interruption rules

### Constants to Reference
- `CRITICAL_LABELS` - Safety-critical objects get highest priority
- `DIST_PRIORITY` - Distance-based importance ranking (near=0, mid=1, far=2)
- `MIN_MAJOR_INTERVAL_MS = 2800` - Prevent major announcement spam
- `SPEECH_INTERRUPT_GRACE_MS = 1600` - Allow interruption after grace period

### File Locations
- Speech smoothing: `useDirectionSmoothing.ts`, `useDistanceCategorySmoothing.ts`
- Speech decision: `useLiveDetectionsSpeech.ts` 
- Speech delivery: `speechSupervisor.ts`, `useSpeechChannel.ts`
- Text utilities: `utils/text.ts` (directionDescriptor, bucketCount, etc.)