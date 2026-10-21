---
type: concept
title: Quickstart & Task Routing
description: Developer and coding agent entrypoint for TravelConcierge AI, covering environment setup, running local servers, CLI execution, and topic-based wiki task routing.
tags: [quickstart, setup, routing, development, guide]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-21T08:47:15.875Z
sources:
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-373640cd8a0886cee69db282
    resource: repo://requirements.txt
  - id: openwiki-source-d7233c47b0af02cbd48d47c0
    resource: repo://run_cli.py
generated: { by: "antigravity", at: "2026-10-21T08:47:15.875Z" }
---

# Quickstart & Task Routing

**TravelConcierge AI** is an autonomous multi-agent travel concierge platform that coordinates specialized CrewAI agents to perform live flight discovery, spatial urban zoning, accommodation research, dining curation, and budget audits.

## Repository Overview

- [`src/crew.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/crew.py): Multi-agent crew definition, task definitions, LLM configurations, and execution workflow.
- [`src/config/`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/config): Declarative agent personas ([`agents.yaml`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/config/agents.yaml)) and task specifications ([`tasks.yaml`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/config/tasks.yaml)).
- [`src/models.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/models.py): Pydantic v2 schemas (`TripSpatialBlueprint`, `CompleteTripItinerary`, `DayPlan`).
- [`src/server.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/server.py): FastAPI backend providing `/api/plan-trip-stream` (real-time SSE streaming) and `/api/sample-itinerary`.
- [`src/flights_mcp_wrapper.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/flights_mcp_wrapper.py): MCP stdio server communicating with live Duffel Flight API.
- [`src/tools/`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools): Open-Meteo weather forecasts, Frankfurter currency exchange rates, and Haversine transit estimators.
- [`run_cli.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/run_cli.py): Headless command-line trip generator.
- [`frontend/`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/frontend): React 19 + Vite web client consuming live SSE agent reasoning streams.

## Development Setup

### 1. Environment Configuration

Create a `.env` file in the project root containing the following credentials:
```bash
# Core LLM & Search
GROQ_API_KEY1=your_groq_key
GROQ_API_KEY2=your_groq_key
GROQ_API_KEY3=your_groq_key
GROQ_API_KEY4=your_groq_key
GROQ_API_KEY5=your_groq_key
GROQ_API_KEY6=your_groq_key
NVIDIA_BUDGET_API_KEY=your_nvidia_key
OPENROUTER_API_KEY=your_openrouter_key
SERPER_API_KEY=your_serper_key

# Live Flight Search via MCP
DUFFEL_ACCESS_TOKEN=your_duffel_token
```

### 2. Backend Server

Install dependencies and start the FastAPI dev server:
```bash
pip install -r requirements.txt
uvicorn src.server:app --reload --port 8000
```
API health endpoint will be available at `http://localhost:8000/api/health`.

### 3. Frontend Application

Install dependencies and start the Vite dev server:
```bash
cd frontend
npm install
npm run dev
```
The web application runs on `http://localhost:5173`.

### 4. Running via Headless CLI

Generate an itinerary directly in the terminal:
```bash
python run_cli.py --destination "Kyoto, Japan" --days 3 --budget 1200
```
Outputs the compiled itinerary to `output_itinerary.json`.

## Agent Task-Routing Guide

When working on this repository, consult the specific OpenWiki documentation page mapped to your task:

| Developer / Agent Task | Relevant OpenWiki Documentation | Key Source Files |
| :--- | :--- | :--- |
| **Modifying Agent Personas, Tasks or LLMs** | [`/openwiki/architecture/multi-agent-system.md`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/openwiki/architecture/multi-agent-system.md) | `src/crew.py`, `src/config/agents.yaml`, `src/config/tasks.yaml` |
| **Adding or Updating External Tools & MCP** | [`/openwiki/architecture/tools-and-integrations.md`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/openwiki/architecture/tools-and-integrations.md) | `src/flights_mcp_wrapper.py`, `src/tools/` |
| **Modifying Data Structures or Pydantic Schemas** | [`/openwiki/models/data-schemas.md`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/openwiki/models/data-schemas.md) | `src/models.py`, `src/server.py` |
| **Debugging SSE Streaming or API Endpoints** | [`/openwiki/workflows/itinerary-generation.md`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/openwiki/workflows/itinerary-generation.md) | `src/server.py`, `run_cli.py` |
| **Updating the Web UI or Stream Processing** | [`/openwiki/frontend/ui-architecture.md`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/openwiki/frontend/ui-architecture.md) | `frontend/src/App.jsx`, `frontend/src/components/` |
