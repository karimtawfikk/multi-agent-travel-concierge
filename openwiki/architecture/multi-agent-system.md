---
type: architecture
title: Multi-Agent System & Crew Orchestration
description: Architecture and execution lifecycle of the 8 specialized CrewAI travel planning agents, LLM configurations, and sequential contextual task chaining.
tags: [crewai, agents, orchestration, multi-agent, llm]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-21T08:47:15.875Z
sources:
  - id: openwiki-source-565d580963e6d7149348deb7
    resource: repo://src/crew.py
generated: { by: "antigravity", at: "2026-10-21T08:47:15.875Z" }
---

# Multi-Agent System & Crew Orchestration

The core planning engine of TravelConcierge AI is organized as a specialized multi-agent crew built on **CrewAI**. Rather than running a monolithic prompt, the system breaks trip generation down into a staged pipeline of 8 specialized agents.

## Agent Specialist Roster

The crew deploys 8 distinct agents configured in [`src/config/agents.yaml`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/config/agents.yaml) and instantiated via decorators in [`src/crew.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/crew.py):

| Agent Name | Method in `crew.py` | Role & Primary Duty | Configured LLM | Tools Attached |
| :--- | :--- | :--- | :--- | :--- |
| **Flight Scout** | `flight_scout` | Interrogates live airline offers; finds anchor outbound/return flights | Groq (`qwen/qwen3.8-27b`) | MCP Stdio (`flights_mcp_wrapper`) |
| **Lead Trip Architect** | `trip_architect` | Spatial zoning; base neighborhoods and daily district anchors | Groq (`qwen/qwen3.8-27b`) | None (pure reasoning) |
| **Accommodations Scout** | `stay_scout` | Curates lodging aligned with Architect's base neighborhoods and budget | Groq (`openai/gpt-oss-120b`) | SerperDev search |
| **Experiences & Culture** | `activity_planner` | Plans 12h AM/PM timed cultural events, attractions, and weather adaptations | Groq (`openai/gpt-oss-120b`) | Weather, Transit Estimator, Serper |
| **Dining & Culinary** | `food_scout` | Curates breakfast, lunch, dinner, and cafes matching daily districts | Groq (`openai/gpt-oss-120b`) | Transit Estimator, Serper |
| **Mobility & Transit** | `transit_scout` | Calculates airport transfers, rail passes, and intra-district logistics | Groq (`openai/gpt-oss-120b`) | Transit Estimator, Serper |
| **Budget & Finance** | `budget_analyst` | Computes itemized spending totals and validates against traveler budget | NVIDIA NIM (`nemotron-3.5-lightning-30b-a3b`) | Currency Converter |
| **Itinerary Synthesis** | `itinerary_compiler` | Compiles all dossiers into a validated chronological master itinerary | OpenRouter (`nemotron-3-ultra-550b-a55b:free`) | None (schema generation) |

## Task Sequencing & Dependency Topology

The crew executes sequentially via `Process.sequential` with explicit contextual dependency injection:

```
[flight_search_task] (Flight Scout)
         │
         ▼
[trip_blueprint_task] (Lead Architect) -> outputs TripSpatialBlueprint
         │
         ├───────────────────────────────────────────┬───────────────────────┐
         ▼                                           ▼                       ▼
[stay_scout_task]                        [activity_planning_task]     [food_scout_task] ... [transit_scout_task]
         │                                           │                       │                      │
         └───────────────────────────────────────────┼───────────────────────┴──────────────────────┘
                                                     ▼
                                          [budget_analysis_task] (Budget Analyst)
                                                     │
                                                     ▼
                                       [itinerary_compilation_task] (Itinerary Compiler)
                                                     │
                                                     ▼ CompleteTripItinerary
```

### Context Passing Mechanics

1. **Flight Search Anchor**: `flight_search_task` queries live airline data and identifies arrival and departure times.
2. **Spatial Blueprinting**: `trip_blueprint_task` receives `context=[self.flight_search_task()]` to calculate usable trip duration from arrival/departure timestamps, producing a structured `TripSpatialBlueprint`.
3. **Domain Reconnaissance**: `stay_scout_task`, `activity_planning_task`, `food_scout_task`, and `transit_scout_task` all receive `context=[self.trip_blueprint_task()]`. This ensures hotels, meals, sights, and commutes are tightly clustered within the designated base neighborhoods and daily anchor districts.
4. **Financial Validation**: `budget_analysis_task` takes `context` from all four domain scouts to audit total projected expenses against the traveler's stated budget.
5. **Final Compilation**: `itinerary_compilation_task` takes context from all upstream tasks and validates the output strictly against the `CompleteTripItinerary` Pydantic model schema.

## Error Handling & Reliability

- **Serper Enforcement**: `_get_search_tool()` strictly verifies `SERPER_API_KEY` presence before spinning up web search tools, failing fast if the key is missing.
- **LiteLLM Retries**: `litellm.num_retries = 5` is set globally in `src/crew.py` to withstand transient rate limits or provider hiccups across Groq, OpenRouter, and NVIDIA NIM endpoints.
- **Restricted Tool Iterations**: Agent iterations (`max_iter`) are tightly bounded (between 2 and 6) to prevent runaway tool loops.
