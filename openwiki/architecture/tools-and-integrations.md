---
type: architecture
title: Tools, APIs & MCP Integrations
description: Technical implementation of external tools and protocols including Duffel Flights via MCP, Serper web search, Open-Meteo weather, Frankfurter currency converter, and transit estimator.
tags: [mcp, tools, duffel, weather, currency, transit]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-21T08:47:15.875Z
sources:
  - id: openwiki-source-efeb9cbf1579062f0e0a8173
    resource: repo://src/flights_mcp_wrapper.py
  - id: openwiki-source-df945987981ceb93d2dda3ae
    resource: repo://src/tools/currency_tool.py
  - id: openwiki-source-be2488f09d846a9cc5ee5781
    resource: repo://src/tools/transit_estimator_tool.py
  - id: openwiki-source-e84d0b50dd3c0aaa5f86c40b
    resource: repo://src/tools/weather_tool.py
generated: { by: "antigravity", at: "2026-10-21T08:47:15.875Z" }
---

# Tools, APIs & MCP Integrations

TravelConcierge AI combines Model Context Protocol (MCP) servers with localized Python tool functions to provide factual, grounded inputs to the agent crew.

## External Tool Registry

| Tool | Implementation File | API / Source | Key Capabilities | Auth Required |
| :--- | :--- | :--- | :--- | :--- |
| **Flight Search** | [`src/flights_mcp_wrapper.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/flights_mcp_wrapper.py) | Duffel Flights API via MCP stdio | Real-time airline quotes, non-stop flight paths, baggage rules | `DUFFEL_ACCESS_TOKEN` |
| **Web Research** | `crewai_tools.SerperDevTool` | SerperDev (Google Search) | Up-to-date hotel, restaurant, and cultural attraction lookups | `SERPER_API_KEY` |
| **Weather Forecast** | [`src/tools/weather_tool.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools/weather_tool.py) | Open-Meteo API | Lat/lon geocoding, daily min/max temperatures, rain risk % | None (Free public API) |
| **Currency Conversion** | [`src/tools/currency_tool.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools/currency_tool.py) | Frankfurter API | Real-time reference exchange rates across global fiat currencies | None (Free public API) |
| **Transit Estimator** | [`src/tools/transit_estimator_tool.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools/transit_estimator_tool.py) | Wikipedia & Open-Meteo Geocoding | Haversine distance, walk/taxi/metro duration models | None (Free public API) |

## Duffel Flight Search via MCP

Flight discovery is powered by a Model Context Protocol (MCP) server launched via stdio in [`src/crew.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/crew.py#L75-L82):

```python
mcp_server = MCPServerStdio(
    command=sys.executable,
    args=["-m", "src.flights_mcp_wrapper"],
    env=env_vars,
)
```

### Protocol Patching & Result Trimming
Because the upstream Duffel client requires specific API versioning and produce large JSON payloads, [`src/flights_mcp_wrapper.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/flights_mcp_wrapper.py) wraps the server with:
1. **Transport Header Injection**: Intercepts `httpx.Client.send` and `AsyncClient.send` to guarantee `Duffel-Version: v2` is passed on all outbound requests to `api.duffel.com`.
2. **Offer Sorting & Pruning**: Intercepts `search_flights` results with `_filter_and_trim_offers`, sorting offers by fewest flight stops first, followed by price, and capping the payload at 5 offers to conserve agent context window tokens.

## Open-Meteo Weather Tool

Implemented in [`src/tools/weather_tool.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools/weather_tool.py), the `get_destination_weather` tool:
1. Queries Open-Meteo's geocoding endpoint (`https://geocoding-api.open-meteo.com/v1/search`) to resolve the city name to latitude and longitude coordinates.
2. Calls the forecast endpoint (`https://api.open-meteo.com/v1/forecast`) fetching daily maximum/minimum temperatures and maximum precipitation probability.
3. Automatically outputs both Celsius and Fahrenheit values along with contextual packing advice (e.g. recommending rain gear if precipitation probability exceeds 35%).

## Transit & Distance Estimator

Implemented in [`src/tools/transit_estimator_tool.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools/transit_estimator_tool.py), the `estimate_transit_and_distance` tool:
1. Geocodes origin and destination query strings using Wikipedia summary coordinates with fallback to Open-Meteo geocoding.
2. Computes great-circle distance via the Haversine formula ($R = 6371\text{ km}$).
3. Applies velocity models for urban travel:
   - **Walking**: $4.5\text{ km/h}$
   - **Taxi/Rideshare**: $25.0\text{ km/h} + 5\text{ mins}$ traffic buffer
   - **Metro/Transit**: $30.0\text{ km/h} + 10\text{ mins}$ station ingress/egress buffer
4. Produces recommendations indicating whether the route is walkable ($\le 1.2\text{ km}$), suitable for a short taxi/rideshare ($\le 5.0\text{ km}$), or requires cross-city transit.

## Currency Converter

Implemented in [`src/tools/currency_tool.py`](file:///c:/Users/kelsahn/OneDrive%20-%20Capgemini/Desktop/multi-agent-travel-concierge/src/tools/currency_tool.py), the `convert_currency` tool:
- Converts amounts between fiat currencies using Frankfurter API (`https://api.frankfurter.dev/v2/rate/{from_cur}/{to_cur}`).
- Returns timestamped reference exchange rates.
- Safely handles identical source/destination currencies without network calls.
