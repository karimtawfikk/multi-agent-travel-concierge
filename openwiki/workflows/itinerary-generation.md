---
type: workflow
title: Itinerary Generation & Streaming Lifecycle
description: End-to-end trace of itinerary generation from user input, date and currency normalization, CrewAI event bus interception, real-time SSE streaming, and final compilation.
tags: [workflow, streaming, sse, fastapi, crewai, lifecycle]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-21T08:47:15.875Z
sources:
  - id: openwiki-source-d7233c47b0af02cbd48d47c0
    resource: repo://run_cli.py
  - id: openwiki-source-c8b62c8e78b3e15fb006fcff
    resource: repo://src/server.py
generated: { by: "antigravity", at: "2026-10-21T08:47:15.875Z" }
---

# Itinerary Generation & Streaming Lifecycle

TravelConcierge AI offers two distinct execution pathways: a headless CLI runner and a real-time Server-Sent Events (SSE) streaming API backend.

## End-to-End Execution Sequence

```
1. Client POST /api/plan-trip-stream
       │
       ▼
2. Input Sanitization & Normalization
   ├── resolve_trip_dates (calculates return date & date range strings)
   └── get_destination_currency (resolves local fiat ISO currency)
       │
       ▼
3. Event Bus Subscription (crewai_event_bus)
   ├── AgentExecutionStartedEvent ──▶ SSE 'step' (running)
   ├── ToolUsageStartedEvent/FinishedEvent ──▶ SSE 'step' (tool logs)
   └── AgentExecutionCompletedEvent ──▶ SSE 'step' (completed)
       │
       ▼
4. Crew Execution in Background Thread (crew.kickoff)
   ├── Flight Search ──▶ Spatial Blueprinting ──▶ Parallel Scouts ──▶ Budget ──▶ Compiler
   └── Task callbacks trigger SSE 'task_completed'
       │
       ▼
5. Result Extraction & Stream Completion
   ├── Parses Pydantic CompleteTripItinerary from compiler output
   └── Emits SSE 'complete' payload with full JSON itinerary
```

## Input Normalization & Date Calculation

In [`src/server.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/server.py), incoming requests are normalized before being passed to CrewAI:
- **Date Resolution (`resolve_trip_dates`)**: If a departure date is provided without a return date, the return date is calculated by adding `duration_days` to the departure date. It formats a standardized summary string (e.g. `'2026-11-15 to 2026-11-18'`) used by the weather and scheduling agents.
- **Currency Resolution (`get_destination_currency`)**: Matches the destination against a comprehensive dictionary of 60+ countries to select the official local fiat currency (e.g. `'JPY'` for Kyoto/Japan, `'EGP'` for Cairo/Egypt, `'EUR'` for Paris/France) with fallback to the user's currency.

## Real-Time SSE Stream Architecture

The `/api/plan-trip-stream` endpoint in [`src/server.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/server.py) executes CrewAI asynchronously inside a Python worker thread and pushes events through a `queue.Queue()` consumed by FastAPI's `StreamingResponse(..., media_type="text/event-stream")`.

### CrewAI Event Bus Interception

The server attaches listeners to `crewai.events.crewai_event_bus`:
1. `AgentExecutionStartedEvent`: Streams an `AGENT INPUT` step indicating the agent has begun its assignment.
2. `ToolUsageStartedEvent`: Streams a `TOOL REQUEST` step with the tool name and input arguments.
3. `ToolUsageFinishedEvent`: Streams a `TOOL RESULT` step with the truncated tool output.
4. `ToolUsageErrorEvent`: Streams a `TOOL ERROR` step if a tool raises an exception.
5. `AgentExecutionCompletedEvent`: Streams an `AGENT OUTPUT` step with completion status.

A `finally` block ensures `crewai_event_bus.off(...)` unregisters all handlers when the run finishes, preventing listener leaks across concurrent requests.

## Headless CLI Workflow

The CLI entrypoint [`run_cli.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/run_cli.py) provides a direct terminal runner:
```bash
python run_cli.py --destination "Kyoto, Japan" --days 3 --budget 1200
```
- Instantiates `TravelConciergeCrew().crew()`.
- Runs `kickoff(inputs=...)` synchronously.
- Serializes the output to `output_itinerary.json`.
