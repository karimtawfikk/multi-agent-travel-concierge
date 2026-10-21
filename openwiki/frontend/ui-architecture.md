---
type: architecture
title: Frontend Architecture & SSE Consumption
description: Architecture of the React 18/19 and Vite frontend, including form state management, real-time Server-Sent Events (SSE) stream consumption, and interactive itinerary view rendering.
tags: [frontend, react, vite, sse, lucide-react]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-21T08:47:15.875Z
sources:
  - id: openwiki-source-49b284af4abdb5084d5b9d09
    resource: repo://frontend/src/App.jsx
generated: { by: "antigravity", at: "2026-10-21T08:47:15.875Z" }
---

# Frontend Architecture & SSE Consumption

The frontend of TravelConcierge AI is a modern single-page web application located in [`frontend/`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend). It provides an interactive interface for configuring trip parameters, monitoring agent reasoning in real-time via Server-Sent Events (SSE), and browsing finalized itineraries.

## Technology Stack

- **Framework**: React 19 (`react`, `react-dom`)
- **Build Tool**: Vite (`vite`, `@vitejs/plugin-react`)
- **Icons**: Lucide React (`lucide-react`)
- **Linter**: Oxlint (`oxlint`)
- **Styling**: CSS3 glassmorphism, responsive flex/grid layouts, print-ready CSS media queries

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
