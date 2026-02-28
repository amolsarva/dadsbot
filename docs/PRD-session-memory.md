# PRD: Automated Session Memory & Profile Building

## Problem Statement

After a conversation session ends, the bot remembers nothing. Sessions are blank in the history view, the bot starts fresh every time, and the user's profile never builds up. The current "end-of-session reflection popup" asks the user to type — but the whole point is that the user should never interact with the interface. The experience should be entirely voice-driven and hands-free.

## Goals

1. **Zero-UI post-session processing** — After the bot finishes talking, the system automatically processes and summarizes what was discussed. No popup, no typing, no user action required.
2. **Persistent session memory** — Every session's key facts, stories, and details are extracted and stored so the bot knows what happened in previous conversations.
3. **Cumulative user profile** — Each session incrementally builds a "dossier" of the person being interviewed: their life story, family details, career, values, personality, memorable stories.
4. **Continuity across sessions** — When a new session starts, the bot's intro references what it already knows and picks up where it left off, asking new questions rather than repeating old ground.

## Current State (What's Broken)

| Area | Status | Issue |
|------|--------|-------|
| Turn persistence | Working | Turns saved to `conversation_turns` table and as `session_turns` artifact |
| Transcript generation | Working | Text and JSON transcripts generated at finalization |
| Session title | Partially broken | Legacy finalize path didn't persist titles (fixed in this PR) |
| Person profile extraction | Exists but disconnected | GPT-4o-mini extracts facts but they aren't fed back into the bot's intro prompt |
| Memory primer | Exists but stale | `memory/primers/{handle}.md` files exist but aren't reliably regenerated |
| Post-session popup | Removed | Was asking user to type — violates hands-free principle |
| Bot intro memory | Broken | Bot starts fresh every session; doesn't reference prior conversations |

## Architecture: What Exists Today

```
Session ends
  └─> Client calls /api/finalize-session (legacy) + /api/session/{id}/finalize
        ├─> Generates transcripts (txt + json) → blob storage
        ├─> Extracts person_profile via GPT-4o-mini → stored in artifacts JSONB
        ├─> Rebuilds memory primer markdown → blob storage
        ├─> Updates session record in Supabase (status, artifacts, title)
        └─> Sends email summary (optional)

Session starts
  └─> Client calls /api/session/{id}/intro
        ├─> Loads memory primer for user handle
        ├─> Loads prior session titles + details
        └─> Constructs intro message referencing past sessions
```

## Requirements

### R1: Automatic Post-Session Digest (Server-Side)

When a session is finalized, the server must automatically:

1. **Generate a session summary** (1-3 sentences) describing what was discussed — not just a title, but a narrative summary stored as `session_summary` in the session record.
2. **Extract structured facts** from the conversation using AI:
   - Biographical data (name, birthplace, family, career, etc.)
   - Stories told (with brief descriptions)
   - Emotions/values expressed
   - Topics covered and depth reached
   - Questions that were asked but not fully answered (for follow-up)
3. **Merge new facts into the cumulative user profile**:
   - New facts supplement existing ones; don't overwrite unless correcting
   - Track provenance: which session each fact came from
   - Maintain a "confidence" signal: facts mentioned multiple times are more reliable
4. **Update the memory primer** — the markdown document that the bot reads at the start of each new session.

### R2: Memory Primer Format

The memory primer should be structured, not freeform markdown. Use a JSON-backed format:

```json
{
  "handle": "john",
  "lastUpdated": "2026-02-28T...",
  "biography": {
    "fullName": "John Smith",
    "birthYear": 1952,
    "birthplace": "Brooklyn, NY",
    "currentLocation": "Westchester, NY",
    "profession": "Retired carpenter",
    "family": "Married to Mary, 3 children (Tom, Sarah, Mike)"
  },
  "sessions": [
    {
      "id": "abc-123",
      "date": "2026-02-20",
      "summary": "Talked about childhood in Brooklyn, playing stickball, and his father's workshop",
      "factsLearned": ["Grew up on Flatbush Ave", "Father was a furniture maker"],
      "storiesTold": ["The stickball championship of 1963"],
      "unansweredQuestions": ["What happened after high school?"]
    }
  ],
  "allFacts": [
    { "fact": "Grew up on Flatbush Ave in Brooklyn", "source": "session:abc-123", "confidence": "high" },
    { "fact": "Father made furniture by hand", "source": "session:abc-123", "confidence": "medium" }
  ],
  "topicsCovered": {
    "childhood": { "depth": "deep", "lastDiscussed": "2026-02-20" },
    "education": { "depth": "none", "lastDiscussed": null },
    "career": { "depth": "shallow", "lastDiscussed": "2026-02-25" }
  },
  "suggestedNextTopics": ["education", "career_details", "marriage"]
}
```

### R3: Bot Intro Uses Memory

When a new session starts (`/api/session/{id}/intro`), the intro construction must:

1. Load the structured memory primer for the user handle.
2. Reference specific prior conversations: "Last time you told me about playing stickball in Brooklyn..."
3. Acknowledge the relationship: "We've talked 4 times now..."
4. Ask a follow-up question that builds on previous sessions, not a generic opener.
5. Avoid re-asking about topics already covered in depth.

### R4: No User-Facing UI During Processing

- Remove the end-of-session reflection popup entirely (already done).
- After the bot's final utterance, show a brief "Saving your session..." status, then transition to the "done" state.
- All processing (summarization, profile extraction, primer update) happens server-side during the `/api/finalize-session` call.
- The user sees no forms, no typing prompts, no popups. The session just ends gracefully.

### R5: Profile Visible in History Tab

- The History tab should show the cumulative profile built from all sessions.
- Each session row should display its summary (not just "Session on 2/28/2026").
- Profile sections should show extracted facts organized by topic.
- Users can see what the bot "remembers" about them.

## Implementation Plan

### Phase 1: Fix Existing Pipeline (This PR)
- [x] Generate and persist meaningful session titles in legacy finalize path
- [x] Fix post-conversation error (auto-advance race condition)
- [x] Restore service status lights
- [x] Fix user selector persistence

### Phase 2: Enhanced Session Summary
- Add `session_summary` field to session record (Supabase migration)
- Generate 1-3 sentence narrative summary during finalization (alongside title)
- Store unanswered questions for follow-up
- Display summary in history view

### Phase 3: Structured Memory Primer
- Replace freeform markdown primer with JSON structure (see R2)
- Migrate `rebuildMemoryPrimer()` to produce structured JSON
- Add `cumulative_profile` table or use existing `artifacts` to store profile JSON per handle
- Merge logic: new session facts + existing profile → updated profile

### Phase 4: Smart Bot Intro
- Rewrite intro construction to use structured primer
- Reference specific prior stories/topics
- Implement topic rotation: suggest new areas if old ones are covered
- Avoid re-asking questions already answered
- Add "relationship warmth" — acknowledge how many conversations they've had

### Phase 5: Robustness
- Handle server restarts: rebuild in-memory state from `session_turns` artifact
- Handle missing/corrupt primers: graceful fallback to generic intro
- Add observability: log when primer is loaded, what it contains, what the bot decided to ask
- Rate-limit AI extraction calls to avoid runaway costs

## Non-Goals

- Real-time transcription display during sessions (separate feature)
- Multi-user collaboration on a single profile
- Manual profile editing by the user
- Voice cloning or voice synthesis customization

## Success Metrics

1. **Session titles are meaningful**: No session shows "Session on M/D/YYYY" — every completed session has a content-derived title.
2. **Bot references prior sessions**: On the 2nd+ session, the bot's intro mentions something from a prior conversation.
3. **Profile builds incrementally**: After 3 sessions, the history tab shows a non-trivial profile with multiple facts.
4. **Zero user typing required**: The entire experience is voice-in, voice-out. No popups, no forms, no text input during or after sessions.
