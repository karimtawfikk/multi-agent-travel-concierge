from typing import List, Optional
from pydantic import BaseModel, Field


class DaySpatialAnchor(BaseModel):
    day_number: int = Field(..., description="Day number (1, 2, 3...)")
    theme: str = Field(..., description="E.g., 'Ancient Wonders & Giza Plateau'")
    district_focus: str = Field(..., description="Primary geographic district/neighborhood for this day, e.g., 'Giza Plateau & Al Haram'")
    strategic_rationale: str = Field(..., description="Brief rationale for clustering activities in this area")


class TripSpatialBlueprint(BaseModel):
    destination: str = Field(..., description="Destination city/region")
    duration_days: int = Field(..., description="The calculated usable activity days for the trip")
    recommended_stay_neighborhoods: List[str] = Field(..., description="Top 1-2 strategic central base neighborhoods to stay in")
    daily_anchors: List[DaySpatialAnchor] = Field(..., description="Day-by-day geographic district anchors for all scout agents to coordinate around")


class ActivityItem(BaseModel):
    time_slot: str = Field(..., description="Time window in 12-hour AM/PM format, e.g., 'Morning (09:30 AM - 12:00 PM)', 'Afternoon (02:00 PM - 05:00 PM)', 'Evening (07:00 PM - 09:30 PM)'")
    title: str = Field(..., description="Name of activity or landmark")
    description: str = Field(..., description="Short engaging description of what to do and see")
    location_name: str = Field(..., description="Place name")
    cost_estimate: str = Field(..., description="E.g., 'Free', '€18 / $20'")
    duration_hours: float = Field(default=2.0, description="Estimated duration in hours")
    booking_tips: Optional[str] = Field(None, description="E.g., 'Book online 2 weeks in advance'")


class DiningItem(BaseModel):
    meal_type: str = Field(..., description="'Breakfast', 'Lunch', 'Dinner', or 'Snack/Cafe'")
    name: str = Field(..., description="Restaurant or cafe name")
    cuisine: str = Field(..., description="Cuisine type, e.g., 'Authentic Neapolitan Pizza', 'Ramen'")
    description: str = Field(..., description="Why this spot is special")
    location_name: str = Field(..., description="Neighborhood or street")
    price_level: str = Field(..., description="'$' (Budget), '$$' (Moderate), '$$$' (Splurge)")
    must_try_dish: str = Field(..., description="Signature dish or drink")


class DayPlan(BaseModel):
    day_number: int = Field(..., description="Day number (1, 2, 3...)")
    date_or_label: str = Field(..., description="E.g., 'Day 1 - Historic Heart & Night Markets'")
    theme: str = Field(..., description="Theme of the day, e.g., 'Art, Cathedrals & Seine Sunset'")
    neighborhood_focus: str = Field(..., description="Primary district or area explored")
    activities: List[ActivityItem] = Field(default_factory=list, description="List of scheduled activities")
    dining: List[DiningItem] = Field(default_factory=list, description="Recommended dining for the day. MUST include Breakfast, Lunch, and Dinner, with an optional Snack/Cafe.")
    transit_notes: str = Field(..., description="Transit advice between locations for this specific day")


class StayRecommendation(BaseModel):
    name: str = Field(..., description="Hotel, boutique stay, or hostel name")
    neighborhood: str = Field(..., description="District or area")
    tier: str = Field(..., description="'Budget', 'Mid-Range', or 'Luxury Boutique'")
    estimated_price_per_night: str = Field(..., description="E.g., '€110 - €140 / night'")
    why_recommended: str = Field(..., description="Key advantages, walkability, or ambiance")


class BudgetSummary(BaseModel):
    lodging_total: str = Field(..., description="E.g., '€450 - €600 (~$490 - $650)' or '3,200 EGP (~$65)'. Keep it short and clean.")
    food_total: str = Field(..., description="E.g., '€250 - €350 (~$270 - $380)'. Short, clean price range with currency only.")
    activities_total: str = Field(..., description="E.g., '€120 - €180 (~$130 - $195)'. Short, clean price range with currency only.")
    transit_total: str = Field(..., description="E.g., '€40 - €60 (~$45 - $65)'. Short, clean price range with currency only.")
    grand_total: str = Field(..., description="E.g., '€860 - €1,190 (~$935 - $1,290)'. Short, clean grand total price range with currency only.")
    currency: str = Field(..., description="Destination/local currency code used as the primary currency (e.g. EGP, JPY, EUR)")
    within_budget: bool = Field(..., description="Whether the estimated total, compared in the user's currency, fits the stated budget")
    savings_tips: List[str] = Field(default_factory=list, description="Practical money-saving tips tailored to the trip")


class WeatherAdvisory(BaseModel):
    expected_temp_range: str = Field(..., description="E.g., '14°C - 21°C (57°F - 70°F)'")
    condition_summary: str = Field(..., description="E.g., 'Partly sunny with light breeze, low rain probability'")
    packing_recommendations: List[str] = Field(default_factory=list, description="Recommended clothing items")


class FlightLeg(BaseModel):
    origin: str = Field(..., description="Departure airport or city, e.g., 'JFK' or 'Cairo (CAI)'")
    destination: str = Field(..., description="Arrival airport or city, e.g., 'KIX' or 'Tokyo (HND)'")
    date: str = Field(..., description="Date of travel (YYYY-MM-DD)")
    airline: Optional[str] = Field(None, description="Airline name or carrier, e.g., 'Emirates'")
    flight_number: Optional[str] = Field(None, description="Flight number, e.g., 'EK 318'")
    departure_time: Optional[str] = Field(None, description="Departure time in 12-hour format, e.g., '07:21 PM' or '10:30 AM'")
    arrival_time: Optional[str] = Field(None, description="Arrival time in 12-hour format, e.g., '02:57 PM' or '05:03 AM'")
    duration: Optional[str] = Field(None, description="Flight duration, e.g., '11h 45m'")
    stops: Optional[int] = Field(0, description="Number of layovers (0 for nonstop)")


class FlightOption(BaseModel):
    airline: str = Field(..., description="Primary airline carrier")
    outbound: Optional[FlightLeg] = Field(None, description="Outbound flight details")
    inbound: Optional[FlightLeg] = Field(None, description="Return flight details")
    total_price: str = Field(..., description="Total airfare per person with currency, e.g., '$750 USD'")
    cabin_class: str = Field(default="Economy", description="Cabin class (Economy, Business, etc.)")
    booking_advice: Optional[str] = Field(None, description="Booking tip or advice on baggage/timing")


class FlightRecommendation(BaseModel):
    origin: str = Field(..., description="User's departure city/airport")
    destination: str = Field(..., description="Arrival city/airport")
    flight_type: Optional[str] = Field("round_trip", description="'round_trip' or 'one_way'")
    departure_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    return_date: Optional[str] = Field(None, description="Return date (YYYY-MM-DD)")
    options: List[FlightOption] = Field(default_factory=list, description="Top flight choices found")
    estimated_total_airfare: Optional[str] = Field(None, description="Typical price range for the flights, e.g., '$680 - $820 USD'")
    notes: Optional[str] = Field(None, description="Helpful context on live flight options or booking insights")


class CompleteTripItinerary(BaseModel):
    trip_title: str = Field(..., description="Catchy, tailored trip title, e.g., 'Tokyo Neon & Temples: 5-Day Odyssey'")
    destination: str = Field(..., description="Destination city/region")
    duration_days: int = Field(..., description="Number of days")
    travel_style: str = Field(..., description="Travel style (e.g., Cultural, Foodie, Adventurous, Relaxed)")
    weather: WeatherAdvisory = Field(..., description="Weather forecast and seasonal notes")
    flights: Optional[FlightRecommendation] = Field(None, description="Round-trip flight research and options")
    top_stays: List[StayRecommendation] = Field(default_factory=list, description="Lodging recommendations")
    day_plans: List[DayPlan] = Field(default_factory=list, description="Detailed day-by-day plans")
    budget: BudgetSummary = Field(..., description="Comprehensive budget breakdown")
    airport_transfer_guide: str = Field(..., description="Concise numbered airport arrival steps, one per line")
    general_transit_tips: str = Field(..., description="Concise numbered local mobility tips, one per line")
