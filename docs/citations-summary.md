# RAG-Style Citation System - Summary

## ✅ What We Built

### Frontend Complete:
1. **CSS styling** (`citations.css`) - Citation badges and tooltips
2. **JavaScript utilities** (`citations.js`) - Interactive citation elements
3. **Mobile-optimized** - Tooltips that work on small screens
4. **Color-coded** - Blue for Opener, Red for Critiquer

---

## 🎯 UX Improvement

### Before (Your Feedback):
❌ Auto-expanded debate = Too long, buries the answer  
❌ Users have to scroll through everything  
❌ No clear indication of sources  

### After (New Approach):
✅ Clean final answer with small citation numbers  
✅ Hover/tap to see which model said what  
✅ Debate stays collapsed (optional to expand)  
✅ RAG-style source attribution  

---

## 📊 How It Looks

```
Final Answer:
─────────────────────────────────────
Choose React¹ for this project due to 
its larger ecosystem² and better job 
market³.

While Vue offers a simpler learning 
curve⁴, React's long-term benefits 
outweigh the initial complexity.
─────────────────────────────────────

¹ ² ³ = Blue badges (Opener)
⁴ = Red badge (Critiquer)

[Hover shows: "Opener: React dominates..."]
```

---

## 🔧 Implementation Status

### ✅ Frontend (Done):
- Citation CSS styling
- Tooltip components
- Hover/tap handlers
- Mobile responsiveness
- Auto-close on outside click

### ⚠️ Backend (Needed):
The **Judge/Synthesizer must include citation markers** in its response.

**Option 1: Full Integration (Recommended)**
- Modify LLM prompt to include [O1], [O2], [C1] markers
- Backend includes citations in response
- Frontend parses and displays

**Option 2: MVP Pattern Matching (Quick Win)**
- Frontend automatically detects key phrases
- Matches phrases to Opener/Critiquer
- Less accurate but works immediately

---

## 🚀 Next Steps

### To Complete This Feature:

1. **Check where the Judge/Synthesizer prompt is**
   - Likely in: `app/api/websocket.py` or similar
   - Find the prompt that generates the final verdict

2. **Add citation instruction to prompt**
   ```python
   "Include citation markers [O1], [O2] for Opener 
    and [C1], [C2] for Critiquer in your verdict."
   ```

3. **Parse backend response**
   - Extract citation markers
   - Map to source quotes
   - Display with interactive badges

### OR Use MVP Approach (No Backend Changes):

I can implement **automatic phrase matching** that:
- Detects key phrases from Opener/Critiquer
- Automatically adds citations where they appear
- Works immediately without backend changes
- Less accurate but good for testing

---

## 💡 Recommendation

**Best approach for retention:**

1. Keep debate **collapsed by default** ✅ (Done)
2. Show **weight meter** + **citations** in final answer ✅ (Frontend done)
3. Users can expand debate if they want details ✅ (Already works)

This gives:
- **Fast value** - Clean answer visible immediately
- **Trust** - Weight meter + citations show the work
- **Depth** - Full debate available on demand

**Want me to implement the MVP auto-citation (works now) or guide you on backend integration?**
