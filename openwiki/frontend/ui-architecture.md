---
type: architecture
title: Frontend Architecture & SSE Consumption
description: Architecture of the React 19 and Vite frontend, including form state management, real-time Server-Sent Events (SSE) stream consumption, interactive itinerary rendering, and multi-format itinerary export.
tags: [frontend, react, vite, sse, export, icalendar, pdf]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T12:41:14.815Z
sources:
  - id: openwiki-source-49b284af4abdb5084d5b9d09
    resource: repo://frontend/src/App.jsx
  - id: openwiki-source-64096347c90918a4a9ef0311
    resource: repo://frontend/src/components/PrintDossier.jsx
  - id: openwiki-source-18f0f002d3855d34c0ba2eb8
    resource: repo://frontend/src/index.css
  - id: openwiki-source-1a688574fff4e31b847c99a2
    resource: repo://frontend/src/utils/calendarExport.js
generated: { by: "antigravity", at: "2026-10-22T12:41:14.815Z" }
---

# Frontend Architecture & SSE Consumption

The frontend of TravelConcierge AI is a modern single-page web application located in [`frontend/`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend). It provides an interactive interface for configuring trip parameters, monitoring agent reasoning in real-time via Server-Sent Events (SSE), browsing finalized itineraries, and exporting itineraries to calendars or printable documents.

## Technology Stack

- **Framework**: React 19 (`react`, `react-dom`)
- **Build Tool**: Vite (`vite`, `@vitejs/plugin-react`)
- **Icons**: Lucide React (`lucide-react`)
- **Linter**: Oxlint (`oxlint`)
- **Styling**: CSS3 glassmorphism, responsive flex/grid layouts, print-ready CSS media queries (`@media print`)

## View State Management

The core application flow in [`frontend/src/App.jsx`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/App.jsx) is governed by the `tripView` state:

```
┌─────────────────────────────────┐
│     'intro' (Form / Welcome)    │ ◀─── "Start From Scratch"
└────────────────┬────────────────┘
                 │ Submit Form / Start Planning
                 ▼
┌─────────────────────────────────┐
│  'execution' (Live SSE Stream)  │
└────────────────┬────────────────┘
                 │ event.type === 'complete'
                 ▼
┌─────────────────────────────────┐
│     'results' (Itinerary View)  │ ◀─── "Load Sample Itinerary" (Instant Test)
└────────────────┬────────────────┘
                 │ Open Export
                 ▼
┌─────────────────────────────────┐
│  'ExportModal' (Calendar/PDF)   │
└─────────────────────────────────┘
```

1. **`intro` View**:
   - Renders [`WelcomeHero`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/components/WelcomeHero.jsx) and [`TripInputForm`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/components/TripInputForm.jsx).
   - Manages trip configuration state (`destination`, `origin`, dates, style, budget, dietary needs, pace).
2. **`execution` View**:
   - Renders [`AgentPipelineTracker`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/components/AgentPipelineTracker.jsx).
   - Displays real-time progress indicators for each specialist agent (`flight`, `stay`, `experience`, `culinary`, `mobility`, `budget`, `compiler`) along with live reasoning and tool-call logs.
3. **`results` View**:
   - Displays the synthesized `CompleteTripItinerary`.
   - Features day-by-day tabbed views, 12h AM/PM chronological schedules, lodging cards, dining suggestions, weather packing tips, interactive Google Maps deep links, and budget breakdowns.
   - Provides action buttons to trigger itinerary export via calendar (.ics), multi-page print dossier, and clipboard sharing.

## Real-Time SSE Stream Consumption

Rather than polling or waiting for a single long-running HTTP request, `handleGenerate` consumes Server-Sent Events via `fetch` and the Streams API:

```javascript
const response = await fetch(`${API_BASE}/api/plan-trip-stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData),
});
const reader = response.body.getReader();
```

### Event Processing Protocol

Incoming SSE packets (`data: <json>`) are parsed and routed based on `event.type`:

| Event Type | Payload Properties | Frontend Reaction |
| :--- | :--- | :--- |
| `step` | `agent_id`, `agent`, `label`, `message`, `details` | Appends entry to `liveLogs`, sets `agentStatus[activeId]` to `'running'` or `'completed'`. |
| `task_completed` | `agent_id`, `output` | Marks `agentStatus[doneId] = 'completed'` and increments `completedCount`. |
| `complete` | `data` (`CompleteTripItinerary`) | Sets `itinerary`, shifts view to `'results'`, and terminates stream reader loop. |
| `error` | `error` | Sets `errorMsg`, halts stream reader, and prompts traveler with recovery options. |

## Instant Sample Verification

For UI development and offline demonstration without invoking the multi-agent backend, `handleLoadSample` queries `GET /api/sample-itinerary`:
- Immediately populates `formData` with a pre-configured 3-day Kyoto itinerary.
- Transitions straight to the `results` view without consuming model tokens or external APIs.

## Multi-Format Itinerary Export

The frontend provides dedicated export mechanisms for travelers to take their itineraries offline or sync them across devices:

1. **RFC 5545 iCalendar (.ics) Generation**:
   - Implemented in [`frontend/src/utils/calendarExport.js`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/utils/calendarExport.js).
   - Generates universal `.ics` calendars compatible with Apple Calendar, Google Calendar, and Microsoft Outlook.
   - Automatically parses time slots (e.g. morning, afternoon, evening) and adds individual calendar entries for outbound/inbound flights, hotel check-ins, scheduled activities, and dining reservations with embedded location details.
2. **Multi-Page Printable Travel Dossier**:
   - Implemented in [`frontend/src/components/PrintDossier.jsx`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/components/PrintDossier.jsx).
   - Unlike standard browser page printing which truncates tabbed views, `PrintDossier` compiles all days simultaneously into a clean, high-contrast document with intentional page breaks.
   - Controlled via `@media print` rules in [`frontend/src/index.css`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/index.css) to hide interactive UI elements (`.no-print`, `.screen-only`) and show the full dossier when `window.print()` is called.
3. **Export Modal**:
   - Implemented in [`frontend/src/components/ExportModal.jsx`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend/src/components/ExportModal.jsx).
   - Provides a centralized modal dialog offering three export tabs: calendar download, print dossier trigger, and one-click Markdown clipboard copy.
