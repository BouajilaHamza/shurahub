# Mobile UX Testing Checklist

## 🧪 Test on Real Mobile Devices

### Phase 1: Initial Load Experience
- [ ] Open http://localhost:8000/chat on mobile (or your production URL)
- [ ] Verify empty state shows:
  - 🤝 emoji and "Get Smarter Decisions" header
  - 3 quick-start prompts with emojis and min 54px height
  - "Free forever" social proof message
- [ ] Test touch targets - tap each quick-start button
- [ ] Verify visual feedback on tap (border color change, slight movement)

### Phase 2: First Debate Flow
- [ ] Tap a quick-start prompt (e.g., "React or Vue")
- [ ] Verify input field fills with question
- [ ] Verify send button activates
- [ ] Submit the question
- [ ] Watch for debate progress indicators
- [ ] **CRITICAL**: When debate completes, transcript should AUTO-EXPAND
- [ ] Verify you can see all 3 debate entries (Opener, Critiquer, Judge)
- [ ] Tap "Hide debate transcript" and verify it collapses
- [ ] Tap "Open debate transcript" and verify it expands again

### Phase 3: Analytics Verification
Open browser DevTools (or use remote debugging) and check console for:
- [ ] `mobile_page_view` event fires on page load
- [ ] `mobile_first_prompt` event fires when submitting first question
- [ ] `mobile_debate_complete` event fires when debate finishes
- [ ] `mobile_transcript_view` event fires when manually opening transcript

### Phase 4: History Actions (If Logged In)
- [ ] Complete a debate (it auto-saves for logged-in users)
- [ ] Reload page
- [ ] Hover over history item in sidebar
- [ ] Verify 3-dot menu button appears
- [ ] Tap 3-dot menu
- [ ] Verify dropdown shows Delete and Share options
- [ ] Test Share - should copy link or open native share sheet
- [ ] Test Delete - should ask for confirmation then remove item

### Phase 5: Mobile Responsiveness
Test on different screen sizes:
- [ ] iPhone SE (375px) - smallest common screen
- [ ] iPhone 12 (390px)
- [ ] iPhone 14 Pro Max (430px)
- [ ] Android (various - 360px to 414px)

Verify:
- [ ] No horizontal scrolling
- [ ] All text is readable (min 16px for inputs)
- [ ] Touch targets don't overlap
- [ ] Keyboard doesn't hide input field
- [ ] Chat messages don't get cut off

### Phase 6: Guest User Flow
- [ ] Open in incognito/private mode
- [ ] Submit a debate AS GUEST
- [ ] After debate completes, verify "Save Analysis" button appears
- [ ] Tap "Save Analysis"
- [ ] Verify registration modal opens
- [ ] Verify "Register Now" button tracks `register_to_save` event

### Phase 7: Session Time Tracking
- [ ] Load page on mobile
- [ ] Use the app for 1-2 minutes
- [ ] Close tab/navigate away
- [ ] Check analytics/console for `mobile_session_time` event
- [ ] Verify duration makes sense

## 🐛 Common Issues to Check

- [ ] Keyboard pushes content up (should be handled with visualViewport)
- [ ] Zoom on input focus (prevented with font-size: 16px)
- [ ] Double-tap zoom on buttons (prevented with touch-action: manipulation)
- [ ] Slow tap response (should feel instant with proper CSS)
- [ ] Horizontal scroll (check all content max-width: 100%)

## ✅ Success Criteria

**Green Light to Ship if:**
1. ✅ Quick-start prompts work and look good
2. ✅ Debate transcript AUTO-EXPANDS on mobile
3. ✅ All mobile analytics events fire correctly
4. ✅ Touch targets feel responsive (no lag)
5. ✅ No layout issues on any screen size

**Red Flags (Must Fix):**
1. ❌ Transcript doesn't auto-expand on mobile
2. ❌ Analytics events not firing
3. ❌ Touch targets too small or laggy
4. ❌ Horizontal scrolling on any screen
5. ❌ Keyboard hides input field

## 📱 Device Testing Priority

**Must Test:**
1. iPhone (iOS Safari) - 40-50% of mobile traffic
2. Android (Chrome) - 40-50% of mobile traffic

**Nice to Test:**
3. iPad (larger screen, different interactions)
4. Android Firefox (different rendering)

## 🔥 Emergency Rollback Plan

If critical bugs found:
1. Git branch: `mobile-ux-emergency` (current changes)
2. Rollback command: `git revert <commit-hash>`
3. Hot fix: Comment out auto-expand logic in script.js line ~193

---

**Tester**: _________________
**Date**: _________________
**Devices Tested**: _________________
**Issues Found**: _________________
**Status**: [ ] PASS [ ] FAIL [ ] NEEDS WORK
