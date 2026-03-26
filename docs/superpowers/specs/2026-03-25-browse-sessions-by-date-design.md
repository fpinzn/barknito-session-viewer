# Browse Sessions by Date

## Problem

Sessions are only browsable by device. Users want to see a flat reverse-chronological list of all sessions across all devices.

## Design

### UI: Segmented Control in FolderTree

Add a `[By Device] [By Date]` segmented control at the top of the FolderTree component.

- **By Device** (default): Current tree behavior, unchanged.
- **By Date**: Flat list of all sessions sorted newest-first. Each row displays the session timestamp and device name. Clicking a session loads it via the existing `loadFolder` flow.

### State: New field in uiStore

Add `browserViewMode: 'device' | 'date'` to `uiStore` with a setter. Defaults to `'device'`.

### Data Flow for "By Date" Mode

1. The device list is already fetched on mount. When switching to date view, fetch sessions for all devices that haven't been loaded yet (reuse existing `gcsList` per device, populating `DeviceNode.sessions`).
2. Flatten all `device/session` pairs into a single array.
3. Parse timestamps from session folder names (e.g., `session_2025-03-20_10-30` -> `2025-03-20 10:30`) using a regex.
4. Sort descending by parsed timestamp.
5. Render as a flat list. Each row shows formatted date/time and device name as a secondary label.

### Timestamp Parsing

Session folders follow the pattern `session_YYYY-MM-DD_HH-MM`. Extract with:

```
/session_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})/
```

Format for display as `YYYY-MM-DD HH:MM`. Sessions with unparseable names sort to the bottom.

### Loading State

When switching to date view, show a loading indicator while fetching sessions for devices not yet loaded. Fetch all devices in parallel.

## Files Changed

| File | Change |
|------|--------|
| `src/stores/uiStore.ts` | Add `browserViewMode` state and setter |
| `src/features/gcs-browser/FolderTree.tsx` | Add segmented control, date view rendering, fetch-all-sessions logic |

## Scope Exclusions

- No server-side changes or new GCS bucket structure.
- No pagination (session lists are small enough for client-side sorting).
- No date range filtering (could be added later).
