# Live Demonstration Tips

## Pre-Demo Setup
- **Test images**: Have 2-3 images ready with known red/green/purple content
- **Backup plan**: If live demo fails, have screenshots ready
- **Phone setup**: Volume up, battery charged, good lighting
- **Code editor**: Split screen with key files open (optional but impressive)

## Smooth Transitions
1. **Start with overview**, then dive into specifics
2. **Use the legend** as your guide—point to color transformations while explaining
3. **Explain before clicking**—tell audience what you expect to see
4. **Handle delays gracefully**—processing time gives you moments to elaborate on algorithms

## Recovery Strategies
- **No regions detected**: "This proves our strict filtering—we prefer zero false positives. Let me try another image or toggle low confidence."
- **App crash**: "This demonstrates the complexity of real-time image processing. Let me show you the code that would have run."
- **Weird results**: "Color classification has edge cases—this is where human validation remains important."

## Code Pointing Techniques
- **Use line numbers** when referencing code
- **Explain variable names**: "`avgDEP` means average Delta-E for Protanopia"
- **Trace data flow**: "This value gets computed here, passed here, then filtered here"
- **Connect code to UI**: "This constant determines whether you see name labels"

## Engagement Tactics
- **Ask rhetorical questions**: "What do you think happens when I switch to Protan mode?"
- **Explain trade-offs**: "We could show more regions, but at the cost of accuracy"
- **Acknowledge limitations**: "This isn't perfect—it's about making informed decisions"
- **Connect to real users**: "Imagine if you couldn't distinguish these colors..."