
import os
import sys
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi import FastAPI, HTTPException, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from crewai.events import (
    AgentExecutionCompletedEvent,
    AgentExecutionStartedEvent,
    ToolUsageErrorEvent,
    ToolUsageFinishedEvent,
    ToolUsageStartedEvent,
    crewai_event_bus,
)

load_dotenv(override=False)
parent_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if parent_env.exists():
    load_dotenv(parent_env, override=False)

from .models import CompleteTripItinerary
from .crew import TravelConciergeCrew

app = FastAPI(
    title="AI Travel Concierge API",
    description="Multi-agent travel planning API powered by CrewAI and specialized tools.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TripPlanRequest(BaseModel):
    destination: str = Field(..., example="Kyoto, Japan")
    duration_days: Optional[int] = Field(default=3, ge=1, le=14, example=3)
    travel_style: str = Field(default="Cultural & Foodie", example="Cultural & Foodie")
    interests: str = Field(
        default="Historic temples, traditional tea houses, vibrant street food, bamboo groves",
        example="Historic temples, traditional tea houses, vibrant street food",
    )
    dietary_preferences: str = Field(default="No restrictions", example="Pescatarian")
    budget: str = Field(default="1200", example="1500")
    currency: str = Field(default="USD", example="USD")
    pace: str = Field(default="Balanced", example="Moderate, relaxed")
    travel_dates: Optional[str] = Field(default="Autumn", example="November 2026")
    origin: Optional[str] = Field(default="", example="New York (JFK)")
    departure_date: Optional[str] = Field(default="", example="2026-11-15")
    return_date: Optional[str] = Field(default="", example="2026-11-22")
    flight_type: Optional[str] = Field(default="round_trip", example="round_trip")


DESTINATION_CURRENCIES = {
    "egypt": "EGP", "japan": "JPY", "france": "EUR", "germany": "EUR",
    "italy": "EUR", "spain": "EUR", "portugal": "EUR", "greece": "EUR",
    "netherlands": "EUR", "belgium": "EUR", "austria": "EUR", "ireland": "EUR",
    "finland": "EUR", "croatia": "EUR", "slovenia": "EUR", "cyprus": "EUR",
    "united states": "USD", "usa": "USD", "canada": "CAD", "united kingdom": "GBP",
    "uk": "GBP", "switzerland": "CHF", "turkey": "TRY", "türkiye": "TRY",
    "thailand": "THB", "india": "INR", "indonesia": "IDR", "singapore": "SGD",
    "malaysia": "MYR", "south korea": "KRW", "china": "CNY", "hong kong": "HKD",
    "taiwan": "TWD", "vietnam": "VND", "philippines": "PHP", "australia": "AUD",
    "new zealand": "NZD", "mexico": "MXN", "brazil": "BRL", "argentina": "ARS",
    "morocco": "MAD", "south africa": "ZAR", "united arab emirates": "AED",
    "uae": "AED", "saudi arabia": "SAR", "qatar": "QAR", "jordan": "JOD",
    "israel": "ILS", "czech republic": "CZK", "czechia": "CZK", "poland": "PLN",
    "hungary": "HUF", "sweden": "SEK", "norway": "NOK", "denmark": "DKK",
    "iceland": "ISK", "romania": "RON", "bulgaria": "BGN", "peru": "PEN",
    "chile": "CLP", "colombia": "COP", "cambodia": "KHR", "nepal": "NPR",
    "sri lanka": "LKR", "kenya": "KES", "tanzania": "TZS", "mauritius": "MUR",
}


def get_destination_currency(destination: str, fallback: str) -> str:
    normalized = destination.casefold().strip()
    for country, currency in sorted(DESTINATION_CURRENCIES.items(), key=lambda item: len(item[0]), reverse=True):
        if normalized == country or normalized.endswith(f", {country}") or normalized.endswith(f" {country}"):
            return currency
    return fallback.strip().upper()


def resolve_trip_dates(dep_date: Optional[str], ret_date: Optional[str], duration_days: int, fallback_dates: Optional[str]) -> tuple[str, str, str]:
    """
    Resolves trip dates:
    - If departure_date is given and return_date is empty, calculates return_date = departure_date + duration_days.
    - Produces a clear travel_dates string (e.g. '2026-11-15 to 2026-11-19') for weather and scheduling agents.
    """
    dep = (dep_date or "").strip()
    ret = (ret_date or "").strip()
    
    if dep:
        if not ret:
            try:
                dt = datetime.strptime(dep, "%Y-%m-%d")
                ret = (dt + timedelta(days=duration_days)).strftime("%Y-%m-%d")
            except Exception:
                ret = ""
        summary = f"{dep} to {ret}" if ret else dep
        return dep, (ret or dep), summary
        
    fb = (fallback_dates or "").strip() if fallback_dates else "Upcoming season"
    return fb, fb, fb


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AI Travel Concierge Backend",
        "crew_agents": [
            "trip_architect",
            "stay_scout",
            "activity_planner",
            "food_scout",
            "transit_scout",
            "budget_analyst",
            "itinerary_compiler",
        ],
    }


import queue
import threading
from fastapi.responses import StreamingResponse

@app.post("/api/plan-trip-stream")
def plan_trip_stream(req: TripPlanRequest):
    """
    Execute the multi-agent travel concierge crew with real-time SSE streaming.
    Streams actual agent execution steps, tool events, and completion payloads to the frontend.
    """
    event_queue = queue.Queue()

    dep_date, ret_date, travel_dates_summary = resolve_trip_dates(
        req.departure_date, req.return_date, req.duration_days, req.travel_dates
    )

    inputs = {
        "destination": req.destination.strip(),
        "current_year": datetime.now().year,
        "duration_days": req.duration_days,
        "travel_style": req.travel_style or "Cultural & Foodie",
        "interests": req.interests.strip() if req.interests and req.interests.strip() else "Iconic sights, cultural landmarks, local food and authentic neighborhoods",
        "dietary_preferences": req.dietary_preferences.strip() if req.dietary_preferences and req.dietary_preferences.strip() else "No restrictions",
        "budget": req.budget.strip() if req.budget and req.budget.strip() else "1500",
        "currency": req.currency or "USD",
        "destination_currency": get_destination_currency(req.destination, req.currency or "USD"),
        "pace": req.pace or "Balanced",
        "travel_dates": travel_dates_summary,
        "origin": (req.origin or "").strip() if req.origin and req.origin.strip() else "Major Airport",
        "departure_date": dep_date,
        "return_date": ret_date,
        "flight_type": (req.flight_type or "round_trip").strip(),
    }

    def extract_json_data(raw_str: str) -> Optional[dict]:
        if not raw_str:
            return None
        cleaned = raw_str.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned.strip())
        try:
            return json.loads(cleaned)
        except Exception:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1:
                try:
                    return json.loads(cleaned[start:end+1])
                except Exception:
                    pass
        return None

    def infer_agent_from_step(step_output) -> str:
        action = step_output[0] if isinstance(step_output, tuple) else step_output
        tool = str(getattr(action, "tool", "") or "").lower()
        tool_input = str(getattr(action, "tool_input", "") or "").lower()
        thought = str(getattr(action, "thought", "") or "").lower()
        text = str(getattr(action, "text", "") or "").lower()
        output = str(getattr(action, "output", "") or "").lower()
        
        combined = f"{tool} {tool_input} {thought} {text} {output}"

        if any(k in combined for k in ["flight", "airline", "airport", "plane", "round_trip", "departure_date", "duffel", "airfare"]):
            return "Flight Scout Agent"

        if "weather" in tool or any(k in combined for k in ["weather", "landmark", "temple", "sight", "cultural", "activity", "museum", "scenic"]):
            return f"Experiences & Culture Agent for {inputs['destination']}"
        
        if "currency" in tool or any(k in combined for k in ["currency", "budget", "cost projection", "saving", "financial", "itemized"]):
            return "Budget & Finance Agent"
            
        if any(k in combined for k in ["dining", "culinary", "restaurant", "warung", "dish", "cuisine", "food", "café", "cafe", "bistro", "breakfast", "dinner", "lunch"]):
            return f"Dining & Culinary Agent for {inputs['destination']}"
            
        if any(k in combined for k in ["transit", "airport", "transfer", "metro", "bus", "train", "taxi", "mobility", "shuttle", "rail", "fare"]):
            return f"Mobility & Transit Agent for {inputs['destination']}"
            
        if any(k in combined for k in ["hotel", "stay", "resort", "villa", "lodging", "boutique", "hostel", "neighborhood", "district"]):
            return f"Accommodations Agent for {inputs['destination']}"
            
        if any(k in combined for k in ["itinerary", "day 1", "day 2", "synthesis", "complete", "day_plans"]):
            return "Itinerary Synthesis Agent"

        return f"Accommodations Agent for {inputs['destination']}"

    agent_details = {
        "architect": f"Lead Trip Architect for {inputs['destination']}",
        "flight": "Flight Scout Agent",
        "stay": f"Accommodations Agent for {inputs['destination']}",
        "experience": f"Experiences & Culture Agent for {inputs['destination']}",
        "culinary": f"Dining & Culinary Agent for {inputs['destination']}",
        "mobility": f"Mobility & Transit Agent for {inputs['destination']}",
        "budget": "Budget & Finance Agent",
        "compiler": "Itinerary Synthesis Agent",
    }
    task_agent_ids = ("flight", "architect", "stay", "experience", "culinary", "mobility", "budget", "compiler")

    def format_step_message(step_output) -> str:
        action = step_output[0] if isinstance(step_output, tuple) else step_output
        def field(name: str, *aliases: str):
            names = (name, *aliases)
            if isinstance(action, dict):
                return next((action.get(key) for key in names if action.get(key) is not None), "")
            return next((getattr(action, key, None) for key in names if getattr(action, key, None) is not None), "")

        tool = field("tool", "tool_name") or ""
        tool_input = field("tool_input", "input", "arguments") or ""
        thought = field("thought", "log", "reasoning") or ""
        output = field("output", "result") or ""
        result = field("result", "observation") or ""
        text = field("text", "message", "content") or ""

        parts = []
        if thought and str(thought).strip():
            clean_thought = str(thought).strip()
            if clean_thought.lower().startswith("thought:"):
                clean_thought = clean_thought[8:].strip()
            if clean_thought:
                parts.append(f"💡 {clean_thought}")

        if tool and str(tool).strip():
            tool_str = f"🔧 Tool: {tool}"
            if tool_input:
                tool_str += f"\nArgs: {tool_input}"
            if result:
                tool_str += f"\nResult: {str(result)[:200]}..."
            parts.append(tool_str)
        elif output:
            out_str = str(output).strip()
            if len(out_str) > 250:
                out_str = out_str[:250] + "..."
            parts.append(f"📋 Formulating recommendations: {out_str}")
        elif text and str(text).strip():
            parts.append(f"🔍 {str(text).strip()[:250]}...")

        if not parts:
            parts.append("Agent execution step recorded.")

        final_msg = "\n".join(parts)
        if len(final_msg) > 550:
            final_msg = final_msg[:550] + "..."
        return final_msg

    def on_step_for_agent(agent_id: str, step_output):
        try:
            formatted_msg = format_step_message(step_output)
            event_queue.put({
                "type": "step",
                "agent_id": agent_id,
                "agent": agent_details[agent_id],
                "message": formatted_msg
            })
        except Exception:
            pass

    def on_crew_step(step_output):
        try:
            target_agent = infer_agent_from_step(step_output)
            formatted_msg = format_step_message(step_output)
            event_queue.put({
                "type": "step",
                "agent": str(target_agent),
                "message": formatted_msg
            })
        except Exception:
            pass

    def on_task_completed(agent_id: str, task_output):
        try:
            event_queue.put({
                "type": "task_completed",
                "agent_id": agent_id,
                "agent": agent_details[agent_id],
                "message": f"{agent_details[agent_id]} completed."
            })
        except Exception:
            pass

    def run_crew():
        try:
            event_queue.put({
                "type": "start",
                "message": f"Deploying 6 travel agents for {inputs['destination']}..."
            })

            crew_instance = TravelConciergeCrew().crew()

            task_to_agent = {
                id(task): agent_id
                for agent_id, task in zip(task_agent_ids, getattr(crew_instance, "tasks", []))
            }
            agent_object_ids = {
                id(agent): agent_id
                for agent_id, agent in zip(task_agent_ids, getattr(crew_instance, "agents", []))
            }
            role_to_agent = {
                str(getattr(agent, "role", "")).strip().casefold(): agent_id
                for agent_id, agent in zip(task_agent_ids, getattr(crew_instance, "agents", []))
            }
            agent_uid_to_id = {
                str(getattr(agent, "id", "")): agent_id
                for agent_id, agent in zip(task_agent_ids, getattr(crew_instance, "agents", []))
            }
            task_uid_to_agent = {
                str(getattr(task, "id", "")): agent_id
                for agent_id, task in zip(task_agent_ids, getattr(crew_instance, "tasks", []))
            }
            for agent_id, task in zip(task_agent_ids, getattr(crew_instance, "tasks", [])):
                task_agent = getattr(task, "agent", None)
                if task_agent is not None:
                    agent_object_ids[id(task_agent)] = agent_id
                    role_to_agent[str(getattr(task_agent, "role", "")).strip().casefold()] = agent_id
                    agent_uid_to_id[str(getattr(task_agent, "id", ""))] = agent_id

            def resolve_agent_id(agent=None, task=None, role=None, agent_uid=None, task_uid=None):
                if agent is not None and id(agent) in agent_object_ids:
                    return agent_object_ids[id(agent)]
                if task is not None and id(task) in task_to_agent:
                    return task_to_agent[id(task)]
                if agent_uid and str(agent_uid) in agent_uid_to_id:
                    return agent_uid_to_id[str(agent_uid)]
                if task_uid and str(task_uid) in task_uid_to_agent:
                    return task_uid_to_agent[str(task_uid)]
                if role:
                    return role_to_agent.get(str(role).strip().casefold())
                return None

            def trace_event(agent_id, label, message, details=None, status=None):
                if not agent_id:
                    return
                payload = {
                    "type": "step",
                    "agent_id": agent_id,
                    "agent": agent_details[agent_id],
                    "label": label,
                    "message": str(message or ""),
                }
                if status:
                    payload["status"] = status
                if details is not None:
                    payload["details"] = details
                event_queue.put(payload)

            def on_agent_started(_source, event):
                agent = getattr(event, "agent", None)
                agent_id = resolve_agent_id(agent, getattr(event, "task", None))
                task_prompt = getattr(event, "task_prompt", "")
                trace_event(agent_id, "AGENT INPUT", "Agent started work", task_prompt, status="running")

            def on_agent_completed(_source, event):
                agent_id = resolve_agent_id(getattr(event, "agent", None), getattr(event, "task", None))
                trace_event(agent_id, "AGENT OUTPUT", "Agent finished its response", getattr(event, "output", ""), status="completed")

            def on_tool_started(_source, event):
                agent_id = resolve_agent_id(
                    getattr(event, "agent", None),
                    role=getattr(event, "agent_role", None),
                    agent_uid=getattr(event, "agent_id", None),
                    task_uid=getattr(event, "task_id", None),
                )
                args = getattr(event, "tool_args", {})
                trace_event(agent_id, "TOOL REQUEST", f"Requested tool: {getattr(event, 'tool_name', 'tool')}", args)

            def on_tool_finished(_source, event):
                agent_id = resolve_agent_id(
                    getattr(event, "agent", None),
                    role=getattr(event, "agent_role", None),
                    agent_uid=getattr(event, "agent_id", None),
                    task_uid=getattr(event, "task_id", None),
                )
                trace_event(
                    agent_id,
                    "TOOL RESULT",
                    f"{getattr(event, 'tool_name', 'Tool')} returned",
                    getattr(event, "output", ""),
                )

            def on_tool_error(_source, event):
                agent_id = resolve_agent_id(
                    getattr(event, "agent", None),
                    role=getattr(event, "agent_role", None),
                    agent_uid=getattr(event, "agent_id", None),
                    task_uid=getattr(event, "task_id", None),
                )
                trace_event(
                    agent_id,
                    "TOOL ERROR",
                    f"{getattr(event, 'tool_name', 'Tool')} failed",
                    getattr(event, "error", "Unknown tool error"),
                )

            event_handlers = [
                (AgentExecutionStartedEvent, on_agent_started),
                (AgentExecutionCompletedEvent, on_agent_completed),
                (ToolUsageStartedEvent, on_tool_started),
                (ToolUsageFinishedEvent, on_tool_finished),
                (ToolUsageErrorEvent, on_tool_error),
            ]
            for event_type, handler in event_handlers:
                crewai_event_bus.on(event_type)(handler)

            for agent_id, task in zip(task_agent_ids, getattr(crew_instance, "tasks", [])):
                task.callback = (lambda aid: lambda output: on_task_completed(aid, output))(agent_id)

            try:
                result = crew_instance.kickoff(inputs=inputs)
                crewai_event_bus.flush(timeout=30)
            finally:
                for event_type, handler in event_handlers:
                    crewai_event_bus.off(event_type, handler)

            final_data = None
            if hasattr(result, "pydantic") and result.pydantic:
                final_data = result.pydantic.model_dump()
            elif hasattr(result, "json_dict") and result.json_dict:
                final_data = result.json_dict
            elif hasattr(result, "raw") and result.raw:
                final_data = extract_json_data(result.raw)

            if final_data:
                event_queue.put({"type": "complete", "data": final_data})
            else:
                event_queue.put({"type": "error", "message": "Failed to extract structured itinerary"})
        except Exception as exc:
            import traceback
            traceback.print_exc()
            event_queue.put({"type": "error", "message": str(exc)})
        finally:
            event_queue.put(None)  # Sentinel to end stream

    threading.Thread(target=run_crew, daemon=True).start()

    def event_generator():
        while True:
            item = event_queue.get()
            if item is None:
                break
            yield f"data: {json.dumps(item, default=str)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/plan-trip", response_model=CompleteTripItinerary)
def plan_trip(req: TripPlanRequest):
    """
    Execute the multi-agent travel concierge crew to generate a comprehensive,
    day-by-day JSON itinerary.
    """
    try:
        dep_date, ret_date, travel_dates_summary = resolve_trip_dates(
            req.departure_date, req.return_date, req.duration_days, req.travel_dates
        )

        inputs = {
            "destination": req.destination.strip(),
            "current_year": datetime.now().year,
            "duration_days": req.duration_days,
            "travel_style": req.travel_style or "Cultural & Foodie",
            "interests": req.interests.strip() if req.interests and req.interests.strip() else "Iconic sights, cultural landmarks, local food and authentic neighborhoods",
            "dietary_preferences": req.dietary_preferences.strip() if req.dietary_preferences and req.dietary_preferences.strip() else "No restrictions",
            "budget": req.budget.strip() if req.budget and req.budget.strip() else "1500",
            "currency": req.currency or "USD",
            "destination_currency": get_destination_currency(req.destination, req.currency or "USD"),
            "pace": req.pace or "Balanced",
            "travel_dates": travel_dates_summary,
            "origin": (req.origin or "").strip() if req.origin and req.origin.strip() else "Major Airport",
            "departure_date": dep_date,
            "return_date": ret_date,
            "flight_type": (req.flight_type or "round_trip").strip(),
        }

        crew_instance = TravelConciergeCrew().crew()
        result = crew_instance.kickoff(inputs=inputs)

        if hasattr(result, "pydantic") and result.pydantic:
            return result.pydantic
        elif hasattr(result, "json_dict") and result.json_dict:
            return CompleteTripItinerary(**result.json_dict)
        elif hasattr(result, "raw") and result.raw:
            try:
                parsed = json.loads(result.raw)
                return CompleteTripItinerary(**parsed)
            except Exception:
                pass

        raise HTTPException(
            status_code=500,
            detail="Failed to parse structured itinerary from multi-agent output.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Crew execution error: {str(e)}")



@app.get("/api/sample-itinerary", response_model=CompleteTripItinerary)
def get_sample_itinerary():
    """
    Instant preview payload for rapid UI testing and verification.
    """
    return CompleteTripItinerary(
        trip_title="Kyoto Zen & Flavors: 3-Day Autumn Immersion",
        destination="Kyoto, Japan",
        duration_days=3,
        travel_style="Cultural & Foodie",
        weather={
            "expected_temp_range": "11°C - 19°C (52°F - 66°F)",
            "condition_summary": "Crisp autumn air, vibrant maple foliage, low chance of rain.",
            "packing_recommendations": [
                "Layered wool or fleece cardigan",
                "Ultra-comfortable slip-on walking shoes for temple visits",
                "Compact daypack and portable charger",
            ],
        },
        flights={
            "origin": "New York (JFK)",
            "destination": "Kansai / Kyoto (KIX)",
            "flight_type": "round_trip",
            "departure_date": "2026-11-10",
            "return_date": "2026-11-18",
            "estimated_total_airfare": "$895 - $920 USD",
            "notes": "Queried live flight offers. Japan Airlines and ANA offer top-tier comfort and baggage allowances on transpacific routes.",
            "options": [
                {
                    "airline": "Japan Airlines",
                    "total_price": "$920 USD",
                    "cabin_class": "Economy",
                    "booking_advice": "Includes 2 checked bags and seamless Haneda transfer",
                    "outbound": {
                        "origin": "JFK",
                        "destination": "KIX",
                        "date": "2026-11-10",
                        "airline": "Japan Airlines",
                        "flight_number": "JL 005",
                        "departure_time": "12:15 PM",
                        "arrival_time": "04:30 PM (+1)",
                        "duration": "14h 15m",
                        "stops": 0,
                    },
                    "inbound": {
                        "origin": "KIX",
                        "destination": "JFK",
                        "date": "2026-11-18",
                        "airline": "Japan Airlines",
                        "flight_number": "JL 006",
                        "departure_time": "06:20 PM",
                        "arrival_time": "06:05 PM",
                        "duration": "13h 45m",
                        "stops": 0,
                    },
                },
                {
                    "airline": "ANA (All Nippon Airways)",
                    "total_price": "$895 USD",
                    "cabin_class": "Economy",
                    "booking_advice": "5-star Skytrax hospitality with complimentary seat selection",
                    "outbound": {
                        "origin": "JFK",
                        "destination": "ITM",
                        "date": "2026-11-10",
                        "airline": "ANA",
                        "flight_number": "NH 109",
                        "departure_time": "11:00 AM",
                        "arrival_time": "03:15 PM (+1)",
                        "duration": "14h 15m",
                        "stops": 1,
                    },
                    "inbound": {
                        "origin": "ITM",
                        "destination": "JFK",
                        "date": "2026-11-18",
                        "airline": "ANA",
                        "flight_number": "NH 110",
                        "departure_time": "04:45 PM",
                        "arrival_time": "04:30 PM",
                        "duration": "13h 45m",
                        "stops": 1,
                    },
                },
            ],
        },
        top_stays=[
            {
                "name": "The Thousand Kyoto",
                "neighborhood": "Shimogyo Ward (Near Kyoto Station)",
                "tier": "Mid-Range",
                "estimated_price_per_night": "$180 - $220 / night",
                "why_recommended": "Steps from Shinkansen and bus hub, stunning zen-modern minimalist architecture.",
                "latitude": 34.9858,
                "longitude": 135.7588,
            },
            {
                "name": "Ryokan Gion Sano",
                "neighborhood": "Higashiyama / Gion",
                "tier": "Cultural Traditional",
                "estimated_price_per_night": "$140 - $180 / night",
                "why_recommended": "Authentic tatami rooms right inside the historic preservation quarter.",
                "latitude": 34.9995,
                "longitude": 135.7785,
            },
        ],
        day_plans=[
            {
                "day_number": 1,
                "date_or_label": "Day 1 - Temples of East Kyoto & Gion Lanterns",
                "theme": "Sacred Shrines & Historic Alleys",
                "neighborhood_focus": "Higashiyama District",
                "activities": [
                    {
                        "time_slot": "Morning (08:30 - 11:30)",
                        "title": "Fushimi Inari Taisha Torii Path",
                        "description": "Hike through thousands of vermilion torii gates up Mount Inari before the midday crowds arrive.",
                        "location_name": "Fushimi Inari-taisha",
                        "latitude": 34.9671,
                        "longitude": 135.7727,
                        "cost_estimate": "Free",
                        "duration_hours": 2.5,
                        "booking_tips": "Arrive before 9 AM for peaceful photos.",
                    },
                    {
                        "time_slot": "Afternoon (14:00 - 16:30)",
                        "title": "Kiyomizu-dera Wooden Stage",
                        "description": "Marvel at the ancient temple perched over the mountainside with sweeping views of Kyoto.",
                        "location_name": "Kiyomizu-dera",
                        "latitude": 34.9948,
                        "longitude": 135.7850,
                        "cost_estimate": "$4 (400 JPY)",
                        "duration_hours": 2.0,
                        "booking_tips": "Walk down through Sannenzaka slope for pottery shops.",
                    },
                ],
                "dining": [
                    {
                        "meal_type": "Lunch",
                        "name": "Omen Kodai-ji",
                        "cuisine": "Handmade Udon & Seasonal Tempura",
                        "description": "Famous for dipping udon served with fresh seasonal mountain vegetables and roasted sesame.",
                        "location_name": "Higashiyama",
                        "latitude": 35.0006,
                        "longitude": 135.7801,
                        "price_level": "$$",
                        "must_try_dish": "Signature Cold Dipping Udon with Tempura",
                    },
                    {
                        "meal_type": "Dinner",
                        "name": "Gion Karyo",
                        "cuisine": "Modern Kaiseki Tasting",
                        "description": "Approachable multi-course seasonal dining in a restored 120-year-old machiya townhouse.",
                        "location_name": "Gion Hanamikoji",
                        "latitude": 35.0037,
                        "longitude": 135.7752,
                        "price_level": "$$$",
                        "must_try_dish": "Autumn Hamo (Pike Eel) & Matsutake broth",
                    },
                ],
                "transit_notes": "Take JR Nara line from Kyoto Station to Inari (5 mins), then Keihan Line north to Gion-Shijo.",
            },
            {
                "day_number": 2,
                "date_or_label": "Day 2 - Bamboo Groves & Zen Rock Gardens",
                "theme": "Nature, Zen Aesthetics & River Valleys",
                "neighborhood_focus": "Arashiyama (West Kyoto)",
                "activities": [
                    {
                        "time_slot": "Morning (09:00 - 11:30)",
                        "title": "Arashiyama Bamboo Grove & Tenryu-ji Garden",
                        "description": "Walk among towering green bamboo stalks followed by viewing the UNESCO 14th-century landscape garden.",
                        "location_name": "Tenryu-ji",
                        "latitude": 35.0158,
                        "longitude": 135.6775,
                        "cost_estimate": "$5 (500 JPY)",
                        "duration_hours": 2.5,
                        "booking_tips": "Visit Okochi Sanso villa garden at the end of the bamboo path.",
                    },
                    {
                        "time_slot": "Afternoon (14:30 - 16:30)",
                        "title": "Ryoan-ji Zen Dry Rock Garden",
                        "description": "Contemplate the enigmatic 15-stone Zen rock garden framed by clay walls and weeping cherry trees.",
                        "location_name": "Ryoan-ji",
                        "latitude": 35.0345,
                        "longitude": 135.7182,
                        "cost_estimate": "$5 (500 JPY)",
                        "duration_hours": 1.5,
                        "booking_tips": "Sit quietly on the wooden veranda to soak in the atmosphere.",
                    },
                ],
                "dining": [
                    {
                        "meal_type": "Lunch",
                        "name": "Shigetsu (inside Tenryu-ji)",
                        "cuisine": "Shojin Ryori (Zen Buddhist Vegan)",
                        "description": "Delicate, beautiful vegetarian temple cuisine eaten sitting on tatami looking out onto gardens.",
                        "location_name": "Arashiyama",
                        "latitude": 35.0160,
                        "longitude": 135.6769,
                        "price_level": "$$",
                        "must_try_dish": "Simmered seasonal yuba (tofu skin) and mountain shoots",
                    },
                    {
                        "meal_type": "Dinner",
                        "name": "Chao Chao Gyoza",
                        "cuisine": "Artisan Pan-Fried Dumplings & Craft Beer",
                        "description": "High-energy counter bar serving crispy linked gyoza sheets and local Kyoto ales.",
                        "location_name": "Kawaramachi",
                        "latitude": 35.0051,
                        "longitude": 135.7708,
                        "price_level": "$",
                        "must_try_dish": "Crispy Pork & Spring Onion Gyoza with chili oil",
                    },
                ],
                "transit_notes": "Take JR Sagano Line to Saga-Arashiyama Station (15 mins from Kyoto Station). Take Keifuku Randen tram between Arashiyama and Ryoan-ji.",
            },
            {
                "day_number": 3,
                "date_or_label": "Day 3 - Golden Pavilion, Nishiki Market & Pontocho",
                "theme": "Imperial Radiance & Gastronomy",
                "neighborhood_focus": "North Kyoto & Downtown",
                "activities": [
                    {
                        "time_slot": "Morning (09:00 - 11:00)",
                        "title": "Kinkaku-ji (The Golden Pavilion)",
                        "description": "Witness the top two floors of this stunning Zen temple completely covered in pure gold leaf reflecting over Kyoko-chi mirror pond.",
                        "location_name": "Kinkaku-ji",
                        "latitude": 35.0394,
                        "longitude": 135.7292,
                        "cost_estimate": "$4 (400 JPY)",
                        "duration_hours": 1.5,
                        "booking_tips": "Early morning light produces the best mirror reflections.",
                    },
                    {
                        "time_slot": "Afternoon (12:30 - 15:30)",
                        "title": "Nishiki Market Food Exploration",
                        "description": "Walk through 'Kyoto's Kitchen'—a 400-year-old narrow five-block shopping street with 100+ lively food vendors.",
                        "location_name": "Nishiki Market",
                        "latitude": 35.0050,
                        "longitude": 135.7649,
                        "cost_estimate": "$25 (Snack budget)",
                        "duration_hours": 2.5,
                        "booking_tips": "Eat at designated stalls, as walking and eating simultaneously is frowned upon in Kyoto.",
                    },
                ],
                "dining": [
                    {
                        "meal_type": "Lunch",
                        "name": "Nishiki Market Stalls",
                        "cuisine": "Street Food Tasting",
                        "description": "Sample grilled dashi-tamago (rolled omelet), tako tamago (baby octopus), and matcha warabi mochi.",
                        "location_name": "Nishiki Dori",
                        "latitude": 35.0050,
                        "longitude": 135.7650,
                        "price_level": "$",
                        "must_try_dish": "Freshly torched dashi-egg skewer & matcha soft serve",
                    },
                    {
                        "meal_type": "Dinner",
                        "name": "Pontocho Robin",
                        "cuisine": "Kyoto Cuisine on River Terrace (Kawayuka)",
                        "description": "Dine over the Kamogawa river on a wooden terrace listening to water flowing under lantern light.",
                        "location_name": "Pontocho Alley",
                        "latitude": 35.0042,
                        "longitude": 135.7712,
                        "price_level": "$$$",
                        "must_try_dish": "Kyoto wagyu beef sukiyaki and seasonal sashimi",
                    },
                ],
                "transit_notes": "City bus #205 connects Kinkaku-ji back to Kawaramachi / Shijo downtown.",
            },
        ],
        budget={
            "lodging_total": "$540 (3 nights @ $180/night)",
            "food_total": "$320 ($105/day for dining & snacks)",
            "activities_total": "$65 (Temple tickets & gardens)",
            "transit_total": "$45 (IC card trains, buses, Randen tram)",
            "grand_total": "$970 USD",
            "currency": "USD",
            "within_budget": True,
            "savings_tips": [
                "Tap an IC Card (ICOCA or Welcome Suica) for all trains, subways, and convenience stores to skip ticket queues.",
                "Visit major temples (Fushimi Inari and Kiyomizu-dera) early morning to avoid crowds and entry delays.",
                "Grab high-quality convenience store breakfasts (7-Eleven / Lawson onigiri and iced lattes) to save budget for Kaiseki dinners.",
            ],
        },
        airport_transfer_guide="From Kansai International Airport (KIX), board the JR Haruka Limited Express (approx. 75 minutes direct to Kyoto Station, reserved seat ~3,600 JPY). From Itami Airport (ITM), take the direct airport limousine bus (50 minutes, ~1,340 JPY).",
        general_transit_tips="Kyoto is best navigated via JR and Keihan train lines combined with walking. Avoid city buses during peak afternoon traffic on Shijo street.",
    )


def generate_ics_calendar(itinerary: CompleteTripItinerary) -> str:
    """
    Generates an RFC 5545 compliant iCalendar (.ics) string from a CompleteTripItinerary.
    """
    now = datetime.utcnow()
    dt_stamp = now.strftime("%Y%m%dT%H%M%SZ")

    start_date = None
    if itinerary.flights and itinerary.flights.departure_date:
        try:
            start_date = datetime.strptime(itinerary.flights.departure_date.strip(), "%Y-%m-%d")
        except Exception:
            pass
    if not start_date:
        start_date = now + timedelta(days=14)

    cal_name = itinerary.trip_title or f"{itinerary.destination} Itinerary"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TravelConcierge AI//Multi-Agent Travel Planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{cal_name}",
        "X-WR-TIMEZONE:UTC",
    ]

    def escape_text(text: str) -> str:
        if not text:
            return ""
        return (
            str(text)
            .replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\r\n", "\\n")
            .replace("\n", "\\n")
        )

    # 1. Flight Events
    if itinerary.flights and itinerary.flights.options:
        top_flight = itinerary.flights.options[0]
        if top_flight.outbound:
            f_start = start_date.replace(hour=10, minute=0, second=0)
            f_end = start_date.replace(hour=14, minute=0, second=0)
            desc = f"Airline: {top_flight.airline}\nCabin: {top_flight.cabin_class}\nFare: {top_flight.total_price}"
            flight_summary = f"✈️ Flight to {itinerary.destination}: {top_flight.airline}"
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:flight-out-{int(now.timestamp())}@travelconcierge.ai",
                f"DTSTAMP:{dt_stamp}",
                f"DTSTART:{f_start.strftime('%Y%m%dT%H%M%S')}",
                f"DTEND:{f_end.strftime('%Y%m%dT%H%M%S')}",
                f"SUMMARY:{escape_text(flight_summary)}",
                f"DESCRIPTION:{escape_text(desc)}",
                f"LOCATION:{escape_text(itinerary.flights.origin or 'Airport')}",
                "STATUS:CONFIRMED",
                "END:VEVENT",
            ])

    # 2. Stay Event
    if itinerary.top_stays:
        stay = itinerary.top_stays[0]
        s_start = start_date.replace(hour=15, minute=0, second=0)
        s_end = (start_date + timedelta(days=itinerary.duration_days)).replace(hour=11, minute=0, second=0)
        desc = f"Hotel: {stay.name}\nNeighborhood: {stay.neighborhood}\nTier: {stay.tier}\nWhy: {stay.why_recommended}"
        stay_summary = f"🏨 Stay: {stay.name} ({stay.neighborhood})"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:stay-{int(now.timestamp())}@travelconcierge.ai",
            f"DTSTAMP:{dt_stamp}",
            f"DTSTART:{s_start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{s_end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{escape_text(stay_summary)}",
            f"DESCRIPTION:{escape_text(desc)}",
            f"LOCATION:{escape_text(stay.name + ', ' + stay.neighborhood + ', ' + itinerary.destination)}",
            "STATUS:CONFIRMED",
            "END:VEVENT",
        ])

    # 3. Daily Activities & Dining
    for day_idx, dp in enumerate(itinerary.day_plans):
        day_date = start_date + timedelta(days=day_idx)
        next_day = day_date + timedelta(days=1)
        day_summary = f"📅 Day {dp.day_number}: {dp.theme} [{dp.neighborhood_focus}]"
        day_desc = f"Theme: {dp.theme}\nDistrict: {dp.neighborhood_focus}\nTransit: {dp.transit_notes}"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:day-{dp.day_number}-theme-{int(now.timestamp())}@travelconcierge.ai",
            f"DTSTAMP:{dt_stamp}",
            f"DTSTART;VALUE=DATE:{day_date.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{next_day.strftime('%Y%m%d')}",
            f"SUMMARY:{escape_text(day_summary)}",
            f"DESCRIPTION:{escape_text(day_desc)}",
            f"LOCATION:{escape_text(dp.neighborhood_focus + ', ' + itinerary.destination)}",
            "STATUS:CONFIRMED",
            "END:VEVENT",
        ])

        for a_idx, act in enumerate(dp.activities):
            a_start = day_date.replace(hour=min(23, 9 + a_idx * 3), minute=0, second=0)
            a_end = day_date.replace(hour=min(23, 11 + a_idx * 3), minute=0, second=0)
            desc = f"{act.description}\nCost: {act.cost_estimate}\nBooking: {act.booking_tips or 'None'}"
            act_summary = f"🎯 {act.title}"
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:day-{dp.day_number}-act-{a_idx}-{int(now.timestamp())}@travelconcierge.ai",
                f"DTSTAMP:{dt_stamp}",
                f"DTSTART:{a_start.strftime('%Y%m%dT%H%M%S')}",
                f"DTEND:{a_end.strftime('%Y%m%dT%H%M%S')}",
                f"SUMMARY:{escape_text(act_summary)}",
                f"DESCRIPTION:{escape_text(desc)}",
                f"LOCATION:{escape_text(act.location_name + ', ' + itinerary.destination)}",
                "STATUS:CONFIRMED",
                "END:VEVENT",
            ])

        for d_idx, din in enumerate(dp.dining):
            d_hour = 8 if "breakfast" in din.meal_type.lower() else (12 if "lunch" in din.meal_type.lower() else 19)
            d_start = day_date.replace(hour=d_hour, minute=30, second=0)
            d_end = day_date.replace(hour=d_hour + 1, minute=30, second=0)
            desc = f"{din.description}\nCuisine: {din.cuisine}\nMust-try: {din.must_try_dish}\nPrice: {din.price_level}"
            din_summary = f"🍽️ {din.meal_type}: {din.name} ({din.cuisine})"
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:day-{dp.day_number}-din-{d_idx}-{int(now.timestamp())}@travelconcierge.ai",
                f"DTSTAMP:{dt_stamp}",
                f"DTSTART:{d_start.strftime('%Y%m%dT%H%M%S')}",
                f"DTEND:{d_end.strftime('%Y%m%dT%H%M%S')}",
                f"SUMMARY:{escape_text(din_summary)}",
                f"DESCRIPTION:{escape_text(desc)}",
                f"LOCATION:{escape_text(din.location_name + ', ' + itinerary.destination)}",
                "STATUS:CONFIRMED",
                "END:VEVENT",
            ])

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


@app.post("/api/export-ics")
def export_ics(itinerary: CompleteTripItinerary):
    """
    Export a CompleteTripItinerary as an RFC 5545 iCalendar (.ics) attachment.
    """
    ics_content = generate_ics_calendar(itinerary)
    safe_destination = re.sub(r"[^a-zA-Z0-9]+", "-", itinerary.destination).strip("-").lower()
    filename = f"{safe_destination}-itinerary.ics"
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=8000, reload=True)
