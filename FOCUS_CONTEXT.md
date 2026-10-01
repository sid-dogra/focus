# Focus App — Context File

## Overview
**Focus** is a single-file React productivity app for Sid (radiology chief resident at NYU). It lives at `sid-dogra.github.io/focus/` and is deployed via GitHub Pages. The repo is at `/Users/siddhantdogra/Documents/Claude/focus`.

## File Structure
```
focus/
├── index.html          # Main app (single-file React, ~2574 lines) — THE source of truth
├── manifest.json       # PWA manifest
├── sw.js               # Service worker for offline/PWA
├── icon-192.svg        # App icon (small)
└── icon-512.svg        # App icon (large)
```
There is also a copy at `../focus.html` (parent directory) used as a working copy — always sync changes to `focus/index.html` before pushing.

## Tech Stack
- **Single-file React 18** with Babel in-browser transpilation
- **Tailwind CSS** via CDN
- **Google Calendar API** for calendar events
- **Google Drive API** (`appDataFolder`) for cross-device task sync
- **Google Identity Services** + OAuth redirect fallback for auth
- **PWA** with service worker, installable on iOS/Android

## Key Architecture Decisions

### Date Handling (CRITICAL)
All YYYY-MM-DD date strings MUST be parsed with `parseLocal(str)`, never `new Date("YYYY-MM-DD")`. The latter creates UTC midnight which in US timezones becomes the previous day's evening — causing off-by-one bugs in date display, navigation arrows, and task assignment.

```javascript
// CORRECT
const d = parseLocal("2026-02-12"); // → Feb 12 00:00 local time

// WRONG — never do this with YYYY-MM-DD strings
const d = new Date("2026-02-12");   // → Feb 11 19:00 in EST!
```

Similarly, use `d.toLocaleDateString('en-CA')` (not `toISOString().split('T')[0]`) to format dates as YYYY-MM-DD strings.

### Auth
- `AuthGate` component wraps the app, checks `localStorage` key `focus_auth`
- Google Identity Services (GIS) `renderButton` for desktop sign-in
- OAuth redirect flow as fallback for mobile Safari (GIS doesn't render reliably)
- Allowed emails list in settings (default: `dograsiddhant@gmail.com`)
- "Reset app data" button on sign-in screen clears all localStorage

### Google Calendar
- `GCalService` object handles init, authorize, listEvents, createTimeBlock
- Scope: `calendar` + `drive.appdata`
- `gcal_connected` flag in localStorage for auto-reconnect
- Silent re-auth on page load via `GCalService.authorize(false)`
- Event classification: hard/soft/academic based on keyword rules
- Hidden event filtering and rename rules in settings

### Google Drive Sync
- `DriveSync` service uses `appDataFolder` (sandboxed, app-specific storage)
- File: `focus-app-data.json` containing `{ tasks, tombstones, settings, lastModified }`
- Debounced save (2-second delay) triggered by task / tombstone / settings changes
- **Safeguard**: never overwrites Drive with empty tasks if Drive has data AND local has no tombstones
- **Per-task last-write-wins merge** via `mergeTasksAndTombstones()`: each task id resolves to whichever side has the newer `updatedAt`. Older "union merge, remote wins" was wrong — it silently reverted local changes made while offline (e.g. completed tasks reappeared after re-login).
- **Tombstones**: `{ [taskId]: deletedAtMs }` stored in localStorage key `focus_tombstones` and in the Drive payload. A task is dropped from the merge result if its tombstone time `>=` its `updatedAt`. Without this, deletes on one device would be resurrected from remote.
- Sync status badge in header: "Syncing..." / "Synced" / "Sync error" / "⚠ Disconnected — tap to reconnect" (the last one is a button that calls `connectGCal`)
- **Auto-retry on focus**: when the app regains focus and `gcalConnected === false` but the user previously had Drive connected, we silently retry `GCalService.authorize(false)` and re-merge. Common iOS-PWA case where the GIS token aged out in the background.

### Task Model
```javascript
{
  id: string,           // unique ID via uid()
  title: string,
  notes: string,
  category: 'research' | 'admin' | 'startup' | 'personal',
  effort: 'quick' | 'medium' | 'deep',
  importance: 1-5,
  customMinutes: number | null,
  deadline: ISO datetime string | null,
  link: string | null,
  assignedDate: 'YYYY-MM-DD' | null,     // which day in the planner
  scheduledStart: number | null,          // minutes from midnight
  scheduledEnd: number | null,            // minutes from midnight
  scheduledDate: 'YYYY-MM-DD' | null,     // for calendar placement
  status: 'todo' | 'done',
  createdAt: ISO datetime string,
  updatedAt: number,                       // ms since epoch — bumped on EVERY mutation (add/update/toggleDone/auto-unassign). Critical for cross-device merge.
}
```

### Task Scheduling
- **"Plan My Day"** button generates an auto-schedule using `generateSchedule()`
- Considers: availability windows (weekday/weekend), calendar events as hard/soft blocks, task priorities, deadlines
- Manually-placed tasks (via drag-to-create) are treated as fixed blocks
- Tasks can also be manually placed by dragging on the day view timeline (mouse + touch)
- `SlotPicker` modal: choose "Assign existing task" or "Create new task"
- 15-minute snap grid via `snapTo15()`

### Task Planner (Tasks Tab)
- Shows **next 7 days** starting from today (not current week Mon-Sun)
- Day labels are dynamic based on which days those are (M, Tu, W, Th, F, Sa, Su)
- Tasks assigned to past dates **auto-unassign** on app load (cleared to unassigned)
- Changing a task's assigned day clears its calendar placement (scheduledStart/End/Date)
- "Unassigned" section at bottom for tasks without a day

### Calendar Views
- **Day view**: Timeline with hour grid, event blocks, drag-to-create, current time indicator
- **Week view**: 7-day grid with events
- **Month view**: Calendar grid with event dots and deadline indicators
- Navigation arrows use `parseLocal()` for correct date arithmetic
- `selectedDate` auto-updates to today when app regains focus (for PWA resume)

### Event Display
- Click on calendar event → popover showing full title, time, classification, calendar name
- Events classified as hard/soft/academic with color coding
- Hidden events filtered out, rename rules applied

### Categories & Colors
```
research:  violet (#7C3AED)
admin:     amber  (#F59E0B)
startup:   emerald (#10B981)
personal:  rose   (#F43F5E)
```

### Settings (stored in localStorage + synced to Drive)
- `googleClientId`: OAuth client ID
- `allowedEmails`: array of authorized emails
- `weekdayAvailableAfter/Until`: scheduling window (default 17-22)
- `weekendAvailableAfter/Until`: scheduling window (default 10-22)
- `dangerZoneHours`: deadline urgency threshold (default 48)
- `softKeywords`: keywords that mark calendar events as "soft" (skippable)
- `hiddenEventKeywords`: events to hide from calendar
- `hiddenEventPrefixes`: event title prefixes to hide
- `eventRenameRules`: array of `{ match, replace }` rules
- `calendarRefreshMinutes`: auto-refresh interval (default 30)

### PWA / Mobile
- Manifest + service worker for installability
- Touch events (`touchstart`/`touchmove`/`touchend`) alongside mouse events for drag-to-create
- `touchAction: 'none'` to prevent iOS scroll hijacking during drag
- `{ passive: false }` on touchmove for `preventDefault()`
- PWA home screen has separate storage from Safari — user must re-enter Client ID

## Common Pitfalls
1. **Never use `new Date("YYYY-MM-DD")`** — always `parseLocal()` for date-only strings
2. **Never use `toISOString().split('T')[0]`** — always `toLocaleDateString('en-CA')`
3. **Drive sync safeguard** — empty local tasks never overwrite non-empty Drive data
4. **Auth in localStorage** (not sessionStorage) — PWAs need persistent auth
5. **Always sync `focus.html` → `focus/index.html`** before pushing to GitHub
6. **Touch + mouse events** — any interactive element on the timeline needs both

## Deployment
```bash
# From the focus/ repo directory:
git add -A && git commit -m "description" && git push
# GitHub Pages auto-deploys from the repo root
```
