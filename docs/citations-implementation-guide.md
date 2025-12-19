# RAG-Style Citation System - Implementation Guide

## 🎯 Goal
Show users **which model said what** using inline citations (like RAG search results), without making them scroll through long debates.

---

## 📋 Current Status

### ✅ Completed (Frontend):
1. **CSS styling** for citations (`citations.css`)
   - Color-coded badges (Blue=Opener, Red=Critiquer)
   - Hover tooltips for desktop
   - Tap tooltips for mobile
   - Responsive design

2. **JavaScript utilities** (`citations.js`)
   - `createCitationElement()` - Creates citation with tooltip
   - Hover/tap handlers
   - Auto-close on outside click

### ⚠️ **CRITICAL MISSING PIECE: Backend Integration**

The **Judge/Synthesizer must include citation markers** in its response.

---

## 🔧 How It Works (Full Flow)

### Step 1: LLM Prompt Engineering (Backend)
The Synthesizer/Judge prompt must instruct it to:

```
When you create your final verdict, include citation markers [1], [2], [3] etc. 
where you reference arguments from the Opener or Critiquer.

Format:
- Use [O1], [O2] for Opener citations
- Use [C1], [C2] for Critiquer citations

Example output:
"Choose React[O1] due to its larger ecosystem[O2] and better job market[O3], 
though Vue offers a simpler learning curve[C1] for beginners."

Then provide a citations list:
[O1]: Opener - "React dominates the market with 65% adoption"
[O2]: Opener - "React has 200k+ npm packages vs Vue's 50k"  
[O3]: Opener - "React jobs pay 15-20% more on average"
[C1]: Critiquer - "Vue's API is more intuitive for beginners"
```

### Step 2: Parse Backend Response (Frontend)
When receiving the Judge's response:

```javascript
// Example response from backend:
{
  "verdict": "Choose React[O1] due to its larger ecosystem[O2]...",
  "citations": {
    "[O1]": {
      "source": "opener",
      "quote": "React dominates the market with 65% adoption",
      "context": "Full paragraph from opener..."
    },
    "[O2]": {
      "source": "opener", 
      "quote": "React has 200k+ npm packages",
      "context": "..."
    }
  }
}
```

### Step 3: Replace Markers with Interactive Elements

```javascript
function processCitations(verdictHtml, citationsData) {
    let processedHtml = verdictHtml;
    
    // Replace each citation marker with interactive element
    Object.keys(citationsData).forEach(marker => {
        const data = citationsData[marker];
        const citationEl = createCitationElement(
            marker.replace(/[\[\]]/g, ''), // "O1", "C1", etc.
            data.source,
            data.quote
        );
        
        // Replace marker in HTML
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(citationEl);
        processedHtml = processedHtml.replace(
            new RegExp(escapeRegex(marker), 'g'),
            tempDiv.innerHTML
        );
    });
    
    return processedHtml;
}
```

---

## 🚀 Implementation Steps

### Backend (Python) - PRIORITY 1

#### File: `app/api/websocket.py` or wherever the Judge prompt is

**Current (probably):**
```python
synthesizer_prompt = f"""
You are the Judge. Review the Opener and Critiquer arguments and provide a final verdict.

Opener's position: {opener_response}
Critiquer's position: {critiquer_response}

Provide a balanced final recommendation.
"""
```

**New (with citations):**
```python
synthesizer_prompt = f"""
You are the Judge. Review the Opener and Critiquer arguments and provide a final verdict.

Opener's position: {opener_response}
Critiquer's position: {critiquer_response}

IMPORTANT: Include citation markers in your verdict:
- Use [O1], [O2], [O3] for Opener arguments
- Use [C1], [C2], [C3] for Critiquer arguments

After your verdict, provide a "Citations:" section listing each marker with the specific quote.

Example format:
Verdict: Choose React[O1] for its ecosystem[O2], though Vue has easier learning[C1].

Citations:
[O1]: "React dominates with 65% market share"
[O2]: "React has 200k+ packages"  
[C1]: "Vue's API is more intuitive"
"""
```

### Frontend (JavaScript) - PRIORITY 2

#### File: `backend/app/static/js/script.js`

Add after receiving the final verdict:

```javascript
// In handleServerMessage(), after getting final verdict
if (data.text.startsWith('**Final Verdict:**')) {
    const answer = data.text.replace('**Final Verdict:**', '').trim();
    
    // Parse citations if present
    const citationsMatch = answer.match(/Citations:([\s\S]*)/);
    let verdictText = answer;
    let citations = {};
    
    if (citationsMatch) {
        // Extract verdict (everything before "Citations:")
        verdictText = answer.split('Citations:')[0].trim();
        
        // Parse citations list
        const citationLines = citationsMatch[1].trim().split('\n');
        citationLines.forEach(line => {
            const match = line.match(/\[([OC]\d+)\]:\s*"([^"]+)"/);
            if (match) {
                citations[`[${match[1]}]`] = {
                    source: match[1].startsWith('O') ? 'opener' : 'critiquer',
                    quote: match[2]
                };
            }
        });
        
        // Process citations into interactive elements
        verdictText = processCitations(verdictText, citations);
    }
    
    finalAnswer.innerHTML = marked.parse(verdictText);
}
```

---

## 🎨 Visual Example

### Before (Current):
```
Choose React for this project due to its larger ecosystem, 
better job market, and corporate backing.

While Vue offers a simpler learning curve, React's long-term 
benefits outweigh the initial complexity.
```

### After (With Citations):
```
Choose React¹ for this project due to its larger ecosystem², 
better job market³, and corporate backing.

While Vue offers a simpler learning curve⁴, React's long-term 
benefits outweigh the initial complexity.
```

*¹² ³ are blue (Opener), ⁴ is red (Critiquer)*

**On hover/tap:**
```
┌─────────────────────────────────┐
│ [Opener]                         │
│ "React dominates the market     │
│  with 65% developer adoption    │
│  across enterprise companies."  │
└─────────────────────────────────┘
```

---

## 🔥 Quick Win - MVP Approach

If you don't want to change the backend immediately, use a **simple pattern matching** approach:

```javascript
// Automatically add citations for key phrases
function autoAddCitations(answerHtml) {
    const openerKeyPhrases = extractKeyPhrases(streamBuffers['opener']);
    const critiquerKeyPhrases = extractKeyPhrases(streamBuffers['critiquer']);
    
    let html = answerHtml;
    let citationNum = 1;
    
    // Find matches in the answer and add citations
    openerKeyPhrases.forEach(phrase => {
        if (html.includes(phrase)) {
            const citation = createCitationElement(citationNum++, 'opener', phrase);
            // Add citation after first occurrence
            html = html.replace(phrase, phrase + citation.outerHTML);
        }
    });
    
    // Same for critiquer
    critiquerKeyPhrases.forEach(phrase => {
        if (html.includes(phrase)) {
            const citation = createCitationElement(citationNum++, 'critiquer', phrase);
            html = html.replace(phrase, phrase + citation.outerHTML);
        }
    });
    
    return html;
}

function extract KeyPhrases(text) {
    // Extract sentences or key points (simple heuristic)
    return text.split('.').map(s => s.trim()).filter(s => s.length > 20 && s.length < 100);
}
```

---

## ✅ Testing Checklist

- [ ] Citations appear as small numbered badges
- [ ] Blue badges for Opener, red for Critiquer
- [ ] Hovering shows tooltip (desktop)
- [ ] Tapping shows tooltip (mobile)
- [ ] Tooltip shows source quote
- [ ] Clicking outside closes tooltip
- [ ] Mobile tooltip centers on screen (not cut off)
- [ ] Citations don't break text layout

---

## 🎯 Next Steps

### Option A: Full Backend Integration (Recommended)
1. Update Synthesizer prompt to include citation markers
2. Parse citations in frontend
3. Test with real debates

### Option B: MVP Pattern Matching (Quick Win)
1. Use `autoAddCitations()` function
2. Match key phrases automatically
3. Less accurate but works immediately

**Which approach do you want to pursue?**
