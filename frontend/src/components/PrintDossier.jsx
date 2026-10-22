import React from 'react';
import { Plane, Hotel, Calendar, Compass, Utensils, Train, MapPin, DollarSign, CloudSun } from 'lucide-react';

export default function PrintDossier({ itinerary, formData }) {
  if (!itinerary) return null;

  return (
    <div className="print-dossier" style={{ display: 'none' }}>
      
      {/* 1. COVER / BRANDED HEADER */}
      <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '1.5rem', marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0284c7' }}>
              TravelConcierge AI • Bespoke Trip Dossier
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0 0.5rem 0', lineHeight: 1.2 }}>
              {itinerary.trip_title || `${itinerary.destination} Itinerary`}
            </h1>
            <div style={{ fontSize: '0.95rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📍 <strong>Destination:</strong> {itinerary.destination}</span>
              <span>•</span>
              <span>🗓️ <strong>Duration:</strong> {itinerary.duration_days} Days</span>
              <span>•</span>
              <span>✨ <strong>Style:</strong> {itinerary.travel_style}</span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Estimated Budget</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669' }}>
              {itinerary.budget?.grand_total || 'N/A'}
            </div>
            {formData?.departure_date && (
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.2rem' }}>
                Dates: {formData.departure_date} {formData.return_date ? `to ${formData.return_date}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Weather & Packing Quick Summary */}
        {itinerary.weather && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: '#334155' }}>
            <div>
              <strong>Weather Forecast:</strong> {itinerary.weather.expected_temp_range} • {itinerary.weather.condition_summary}
            </div>
            {itinerary.weather.packing_recommendations?.length > 0 && (
              <div style={{ color: '#475569' }}>
                <strong>Packing:</strong> {itinerary.weather.packing_recommendations.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. FLIGHTS (IF AVAILABLE) */}
      {itinerary.flights?.options?.length > 0 && (
        <div style={{ marginBottom: '1.75rem', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
            ✈️ Flight Itinerary ({itinerary.flights.origin || 'Origin'} ➔ {itinerary.flights.destination || itinerary.destination})
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {itinerary.flights.options.slice(0, 2).map((opt, oIdx) => (
              <div key={oIdx} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.85rem', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                  <span>{opt.airline} ({opt.cabin_class || 'Economy'})</span>
                  <span style={{ color: '#059669' }}>{opt.total_price}</span>
                </div>
                {opt.outbound && (
                  <div style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '0.25rem' }}>
                    <strong>Outbound:</strong> {opt.outbound.departure_time} - {opt.outbound.arrival_time} ({opt.outbound.duration || 'Flight'}, {opt.outbound.stops === 0 ? 'Nonstop' : `${opt.outbound.stops} stop`})
                  </div>
                )}
                {opt.inbound && itinerary.flights.flight_type !== 'one_way' && (
                  <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                    <strong>Return:</strong> {opt.inbound.departure_time} - {opt.inbound.arrival_time} ({opt.inbound.duration || 'Flight'}, {opt.inbound.stops === 0 ? 'Nonstop' : `${opt.inbound.stops} stop`})
                  </div>
                )}
                {opt.booking_advice && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', fontStyle: 'italic' }}>
                    Tip: {opt.booking_advice}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. RECOMMENDED STAYS */}
      {itinerary.top_stays?.length > 0 && (
        <div style={{ marginBottom: '1.75rem', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
            🏨 Accommodations & Base Districts
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {itinerary.top_stays.map((stay, sIdx) => (
              <div key={sIdx} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.85rem', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{stay.name}</strong>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>{stay.estimated_price_per_night}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.35rem' }}>
                  📍 {stay.neighborhood} • <span style={{ textTransform: 'capitalize' }}>{stay.tier}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#334155', margin: 0, lineHeight: 1.45 }}>
                  {stay.why_recommended}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. COMPLETE DAY-BY-DAY PLANS (ALL DAYS!) */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #0f172a', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
          📅 Complete Day-by-Day Master Schedule
        </h2>

        {itinerary.day_plans?.map((dp, idx) => (
          <div 
            key={idx} 
            style={{ 
              marginBottom: '1.75rem', 
              pageBreakInside: 'avoid',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '1.15rem',
              background: '#ffffff',
            }}
          >
            {/* Day Header */}
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.65rem', marginBottom: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7', letterSpacing: '0.05em' }}>
                  {dp.date_or_label || `Day ${dp.day_number}`}
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0.15rem 0' }}>
                  Day {dp.day_number}: {dp.theme}
                </h3>
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '0.3rem 0.65rem', borderRadius: '6px' }}>
                📍 {dp.neighborhood_focus}
              </div>
            </div>

            {/* Activities */}
            {dp.activities?.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0284c7', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  🎯 Activities & Landmarks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {dp.activities.map((act, aIdx) => (
                    <div key={aIdx} style={{ background: '#f8fafc', borderLeft: '3px solid #0284c7', padding: '0.65rem 0.85rem', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                          {act.time_slot ? `[${act.time_slot}] ` : ''}{act.title}
                        </span>
                        {act.cost_estimate && (
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>
                            {act.cost_estimate}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>
                        📍 {act.location_name}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#334155', margin: 0, lineHeight: 1.45 }}>
                        {act.description}
                      </p>
                      {act.booking_tips && (
                        <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem', fontWeight: 600 }}>
                          💡 Tip: {act.booking_tips}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dining */}
            {dp.dining?.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d97706', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  🍽️ Curated Dining
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem' }}>
                  {dp.dining.map((din, dIdx) => (
                    <div key={dIdx} style={{ background: '#fffbeb', borderLeft: '3px solid #f59e0b', padding: '0.55rem 0.75rem', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.15rem' }}>
                        <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                          {din.meal_type}: {din.name}
                        </strong>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309' }}>
                          {din.price_level}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#78350f', marginBottom: '0.2rem' }}>
                        {din.cuisine} • 📍 {din.location_name}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#334155', margin: 0, lineHeight: 1.4 }}>
                        {din.description}
                      </p>
                      <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '0.25rem', fontWeight: 600 }}>
                        ⭐ Must-try: {din.must_try_dish}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transit Notes */}
            {dp.transit_notes && (
              <div style={{ background: '#f1f5f9', padding: '0.55rem 0.75rem', borderRadius: '4px', fontSize: '0.78rem', color: '#334155' }}>
                🚇 <strong>Transit Logistics:</strong> {dp.transit_notes}
              </div>
            )}

          </div>
        ))}
      </div>

      {/* 5. ITEMIZED BUDGET AUDIT */}
      {itinerary.budget && (
        <div style={{ marginBottom: '1.75rem', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
            💰 Itemized Budget Breakdown ({itinerary.budget.currency})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.85rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem 0', fontWeight: 600, color: '#334155' }}>🏨 Lodging</td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{itinerary.budget.lodging_total}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem 0', fontWeight: 600, color: '#334155' }}>🍽️ Dining & Food</td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{itinerary.budget.food_total}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem 0', fontWeight: 600, color: '#334155' }}>🎟️ Activities & Attractions</td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{itinerary.budget.activities_total}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem 0', fontWeight: 600, color: '#334155' }}>🚇 Local Mobility</td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{itinerary.budget.transit_total}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                <td style={{ padding: '0.65rem 0.5rem', fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>Grand Total Estimate</td>
                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1rem' }}>{itinerary.budget.grand_total}</td>
              </tr>
            </tbody>
          </table>

          {itinerary.budget.savings_tips?.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.75rem', fontSize: '0.78rem', color: '#92400e' }}>
              <strong>💡 Insider Savings Tips:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.2rem', padding: 0 }}>
                {itinerary.budget.savings_tips.map((tip, tIdx) => (
                  <li key={tIdx} style={{ marginBottom: '0.2rem' }}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 6. MOBILITY & TRANSIT GUIDE */}
      {(itinerary.airport_transfer_guide || itinerary.general_transit_tips) && (
        <div style={{ marginBottom: '1.75rem', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
            🚇 Airport Transfers & City Mobility Guide
          </h2>
          {itinerary.airport_transfer_guide && (
            <div style={{ marginBottom: '0.65rem', fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
              <strong>✈️ Airport-to-City Transfers:</strong> {itinerary.airport_transfer_guide}
            </div>
          )}
          {itinerary.general_transit_tips && (
            <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
              <strong>🚆 City Navigation & Rail Passes:</strong> {itinerary.general_transit_tips}
            </div>
          )}
        </div>
      )}

      {/* 7. PRINT FOOTER */}
      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem', textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8' }}>
        Generated by <strong>TravelConcierge AI</strong> — Autonomous Multi-Agent Travel Architecture • Printed on {new Date().toLocaleDateString()}
      </div>

    </div>
  );
}
