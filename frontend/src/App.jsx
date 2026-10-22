

import React, { useState } from 'react';
import {
  Plane, Compass, MapPin, Calendar, CloudSun, Utensils,
  Hotel, Train, RotateCcw, Clock,
  AlertCircle, Eye, ChevronRight, ChevronDown, PieChart, ExternalLink,
  Activity, CheckCircle2, FileText, Printer, Download, Share2, Sparkles
} from 'lucide-react';
import WelcomeHero from './components/WelcomeHero';
import AgentPipelineTracker from './components/AgentPipelineTracker';
import TripInputForm from './components/TripInputForm';
import ExportModal from './components/ExportModal';
import PrintDossier from './components/PrintDossier';
import { downloadItineraryIcs } from './utils/calendarExport';

const API_BASE = 'http://localhost:8000';

const googleMapsSearchUrl = (...parts) => {
  const query = parts.filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const isValidPrice = (val) => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  // Suppress bare currency signs (e.g. '$', '$$', '$$$') and meaningless placeholders
  if (/^[\$\€\£\¥\s\-_/.,;:?!~*]+$/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (['$', '$$', '$$$', '$$$$', 'n/a', 'na', 'none', 'unknown', 'tbd', 'null', 'undefined', 'varies', 'price varies'].includes(lower)) {
    return false;
  }
  return true;
};

const initialEmptyForm = {
  destination: '',
  origin: '',
  departure_date: '',
  return_date: '',
  flight_type: 'round_trip',
  duration_days: 3,
  travel_style: 'Cultural & Foodie',
  interests: '',
  dietary_preferences: '',
  budget: '',
  currency: 'USD',
  pace: 'Balanced',
  travel_dates: '',
};

export default function App() {
  const [formData, setFormData] = useState(initialEmptyForm);
  const [loading, setLoading] = useState(false);
  const [itinerary, setItinerary] = useState(null);
  const [tripView, setTripView] = useState('intro');
  const [selectedDay, setSelectedDay] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showBudgetDetails, setShowBudgetDetails] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Manual loader for instant preview verification if requested
  const handleLoadSample = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`${API_BASE}/api/sample-itinerary`);
      if (res.ok) {
        const data = await res.json();
        setItinerary(data);
        setTripView('results');
        setSelectedDay(0);
        setFormData({
          destination: 'Kyoto, Japan',
          origin: 'New York (JFK)',
          departure_date: '2026-11-10',
          return_date: '2026-11-18',
          flight_type: 'round_trip',
          duration_days: 3,
          travel_style: 'Cultural & Foodie',
          interests: 'Historic temples, traditional tea houses, vibrant street food, bamboo groves',
          dietary_preferences: 'No restrictions',
          budget: '1200',
          currency: 'USD',
          pace: 'Balanced',
          travel_dates: 'November (Autumn)',
        });
      }
    } catch (err) {
      console.warn('Backend not running locally yet:', err);
      setErrorMsg(`Could not connect to backend: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset everything to complete scratch state
  const handleStartFromScratch = () => {
    setItinerary(null);
    setTripView('intro');
    setFormData(initialEmptyForm);
    setSelectedDay(0);
    setErrorMsg(null);
  };

  const [liveLogs, setLiveLogs] = useState([]);
  const [agentStatus, setAgentStatus] = useState({});
  const [completedCount, setCompletedCount] = useState(0);

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!formData.destination.trim()) {
      alert('Please enter a destination to begin planning!');
      return;
    }

    setLoading(true);
    setTripView('execution');
    setErrorMsg(null);
    setLiveLogs([]);
    setAgentStatus({});
    setCompletedCount(0);
    const completedAgentIds = new Set();
    const visibleAgentIds = new Set(['flight', 'stay', 'experience', 'culinary', 'mobility', 'budget', 'compiler']);

    try {
      // Connect to SSE stream
      const response = await fetch(`${API_BASE}/api/plan-trip-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep remainder

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.replace('data:', '').trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'step') {
              const now = new Date();
              const timeStr = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
              const activeId = event.agent_id || null;

              if (activeId) {
                const incomingStatus = event.status || 'running';
                setAgentStatus((prev) => prev[activeId] === 'completed' && incomingStatus !== 'completed'
                  ? prev
                  : { ...prev, [activeId]: incomingStatus });
                if (incomingStatus === 'completed' && visibleAgentIds.has(activeId)) {
                  const isNewCompletion = !completedAgentIds.has(activeId);
                  completedAgentIds.add(activeId);
                  if (isNewCompletion) setCompletedCount(completedAgentIds.size);
                }
              }

              setLiveLogs((prev) => [
                ...prev,
                {
                  type: 'step',
                  agent_id: event.agent_id,
                  agent: event.agent || 'Agent',
                  label: event.label || 'AGENT STEP',
                  message: event.message,
                  details: event.details,
                  time: timeStr
                }
              ]);
            } else if (event.type === 'task_completed') {
              const now = new Date();
              const timeStr = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
              const doneId = event.agent_id || null;

              if (doneId) {
                setAgentStatus((prev) => ({
                  ...prev,
                  [doneId]: 'completed'
                }));
                if (visibleAgentIds.has(doneId)) {
                  const isNewCompletion = !completedAgentIds.has(doneId);
                  completedAgentIds.add(doneId);
                  if (isNewCompletion) {
                    setCompletedCount(completedAgentIds.size);
                  }
                }
              }
              setLiveLogs((prev) => [
                ...prev,
                {
                  type: 'task_completed',
                  agent_id: event.agent_id,
                  agent: event.agent || 'Agent',
                  message: event.message,
                  time: timeStr
                }
              ]);
            } else if (event.type === 'complete') {
              setItinerary(event.data);
              setSelectedDay(0);
              setTripView('complete');
              setLoading(false);
              return;
            } else if (event.type === 'error') {
              throw new Error(event.message || 'Stream encountered an error');
            }
          } catch (pErr) {
            console.error('Failed to parse SSE JSON chunk:', pErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to generate live crew itinerary:', err);
      setErrorMsg(
        err.message || 'An error occurred during multi-agent execution. Please check your backend connection.'
      );
    } finally {
      setLoading(false);
    }
  };


  const currentDay = itinerary?.day_plans?.[selectedDay] || null;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 2rem 5rem' }}>

      {/* Top Navbar - Centered Logo */}
      <header style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        marginBottom: '2rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Centered Logo */}
        <div
          onClick={handleStartFromScratch}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.2rem' }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              TravelConcierge <span className="gradient-text">AI</span>
            </h1>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            Autonomous Multi-Agent Travel Architecture
          </p>
        </div>

        {/* Action Controls on Right */}
        <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {itinerary && (
            <>
              <button
                onClick={() => setShowExportModal(true)}
                className="no-print"
                title="Export itinerary to Calendar or PDF"
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8',
                  padding: '0.45rem 0.95rem',
                  borderRadius: '9999px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s'
                }}
              >
                <Download size={13} /> Export Trip
              </button>
              <button
                onClick={handleStartFromScratch}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '9999px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s'
                }}
              >
                <RotateCcw size={13} /> New Trip
              </button>
            </>
          )}

          <button
            onClick={handleLoadSample}
            disabled={loading}
            title="Load demo itinerary"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '0.45rem 0.95rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s'
            }}
          >
            <Eye size={13} /> Demo (Kyoto)
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT (FULL-WIDTH) */}
      <main style={{ width: '100%' }}>

        {/* Error Banner */}
        {errorMsg && (
          <div
            className="glass-panel"
            style={{
              padding: '1.25rem 1.5rem',
              marginBottom: '1.75rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}
          >
            <AlertCircle size={20} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flexGrow: 1 }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f87171', marginBottom: '0.2rem' }}>
                Execution Interrupted
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#fca5a5', lineHeight: 1.5 }}>
                {errorMsg}
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                <button
                  onClick={handleGenerate}
                  style={{
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid #f87171',
                    color: '#fff',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Retry Operation
                </button>
                <button
                  onClick={() => setErrorMsg(null)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-secondary)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STATE 1: LOADING -> SHOW ELEGANT AGENT PIPELINE TRACKER */}
        {loading && tripView === 'execution' && (
          <AgentPipelineTracker
            destination={formData.destination}
            formData={formData}
            liveLogs={liveLogs}
            agentStatus={agentStatus}
            completedCount={completedCount}
          />
        )}

        {!loading && itinerary && tripView === 'complete' && (
          <section className="glass-panel" style={{ maxWidth: 760, margin: '4rem auto', padding: '3rem', textAlign: 'center' }}>
            <CheckCircle2 size={42} color="#34d399" style={{ marginBottom: '1rem' }} />
            <span className="section-kicker" style={{ display: 'block' }}>Planning complete</span>
            <h2 style={{ fontSize: '2rem', margin: '.5rem 0' }}>Your {itinerary.destination} itinerary is ready.</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 auto 1.6rem', maxWidth: 520, lineHeight: 1.6 }}>
              The six-agent team has finished its work. Choose whether to review the trip plan or inspect the agents’ execution trace.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => setTripView('results')} style={{ background: 'linear-gradient(135deg, #0284c7, #38bdf8)', border: 0, borderRadius: 10, color: '#fff', padding: '.75rem 1.1rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                <FileText size={16} /> View itinerary
              </button>
              <button onClick={() => setTripView('execution')} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-primary)', padding: '.75rem 1.1rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                <Activity size={16} /> Review agent execution
              </button>
            </div>
          </section>
        )}

        {!loading && itinerary && tripView === 'execution' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => setTripView('results')} style={{ background: 'linear-gradient(135deg, #0284c7, #38bdf8)', border: 0, borderRadius: 10, color: '#fff', padding: '.65rem 1rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.45rem' }}>
                <FileText size={15} /> View itinerary
              </button>
            </div>
            <AgentPipelineTracker
              destination={formData.destination}
              liveLogs={liveLogs}
              agentStatus={agentStatus}
              completedCount={completedCount}
              isComplete
            />
          </>
        )}

        {/* STATE 2: EMPTY STATE -> INTRO FIRST, THEN THE 6 AGENTS, THEN THE INPUT BOX */}
        {!loading && !itinerary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {/* 1. App Introduction + 6 Autonomous Specialists + Popular Presets */}
            <WelcomeHero onSelectPreset={(preset) => {
              const { duration_days, ...cleanPreset } = preset;
              setFormData((prev) => ({
                ...prev,
                ...cleanPreset,
                flight_type: prev.flight_type || 'round_trip',
                duration_days: prev.duration_days || 3,
              }));
              const el = document.getElementById('trip-planner-studio');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }} />

            {/* 2. Trip Planning Studio (Input Box) */}
            <TripInputForm
              formData={formData}
              setFormData={setFormData}
              onGenerate={handleGenerate}
              loading={loading}
            />
          </div>
        )}

        {/* STATE 3: COMPLETED ITINERARY -> PRIORITY-ORDERED & INTERACTIVE RESULTS */}
        {!loading && itinerary && tripView === 'results' && (
          <>
            <div className="screen-only" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="no-print"
                  style={{
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: 10,
                    color: '#38bdf8',
                    padding: '.65rem 1.1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.45rem'
                  }}
                >
                  <Download size={15} /> Export Itinerary (.ics / PDF)
                </button>
                <button onClick={() => setTripView('execution')} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-primary)', padding: '.65rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.45rem' }}>
                  <Activity size={15} /> View agent execution
                </button>
              </div>

              {/* 1. HERO SUMMARY CARD */}
              <div className="glass-panel" style={{ padding: '2rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                  <div style={{ maxWidth: '800px' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-emerald">{itinerary.duration_days} Days Planned</span>
                      <span className="badge badge-cyan">{itinerary.travel_style}</span>
                      <span className="badge badge-amber">{itinerary.budget?.grand_total || 'Estimated Budget'}</span>
                    </div>
                    <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.5rem' }}>
                      {itinerary.trip_title}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MapPin size={18} color="#38bdf8" /> Destination: <strong style={{ color: '#fff' }}>{itinerary.destination}</strong>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => downloadItineraryIcs(itinerary, formData)}
                      className="no-print"
                      style={{
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#38bdf8',
                        padding: '0.65rem 1.15rem',
                        borderRadius: '12px',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                      }}
                      title="Export to Apple Calendar, Google Calendar, or Outlook (.ics)"
                    >
                      <Calendar size={16} color="#38bdf8" /> Add to Calendar (.ics)
                    </button>

                    <button
                      onClick={() => setShowExportModal(true)}
                      className="no-print"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        color: '#fff',
                        padding: '0.65rem 1.15rem',
                        borderRadius: '12px',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                      }}
                      title="Export options: Printable PDF Dossier, Calendar, or Markdown"
                    >
                      <Printer size={16} color="#34d399" /> Export PDF & Dossier
                    </button>

                    <button
                      onClick={handleStartFromScratch}
                      className="no-print"
                      style={{
                        background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                        border: 'none',
                        color: '#fff',
                        padding: '0.65rem 1.4rem',
                        borderRadius: '12px',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 15px rgba(56, 189, 248, 0.35)',
                      }}
                    >
                      <RotateCcw size={15} /> Plan New Trip
                    </button>
                  </div>
                </div>

                {/* Weather Bar */}
                {itinerary.weather && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem 1.35rem',
                    background: 'rgba(56, 189, 248, 0.05)',
                    borderRadius: '14px',
                    border: '1px solid rgba(56, 189, 248, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <CloudSun size={24} color="#38bdf8" />
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                          {itinerary.weather.expected_temp_range} • {itinerary.weather.condition_summary}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Weather & Packing Advisory</div>
                      </div>
                    </div>
                    <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', flex: '1 1 300px' }}>
                      <strong style={{ color: '#cbd5e1' }}>Pack:</strong> {itinerary.weather.packing_recommendations?.join(', ')}
                    </div>
                  </div>
                )}

                {/* Round-Trip Flights Dossier Card */}
                {itinerary.flights && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1.25rem 1.5rem',
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(30, 41, 59, 0.5) 100%)',
                    borderRadius: '16px',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Plane size={22} color="#38bdf8" />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                              Flight Routes: {itinerary.flights.origin || 'Origin'} ➔ {itinerary.flights.destination || itinerary.destination}
                            </h4>
                            <span style={{
                              fontSize: '0.72rem',
                              padding: '0.15rem 0.55rem',
                              borderRadius: '999px',
                              background: itinerary.flights.flight_type === 'one_way' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                              color: itinerary.flights.flight_type === 'one_way' ? '#f59e0b' : '#38bdf8',
                              border: `1px solid ${itinerary.flights.flight_type === 'one_way' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
                              fontWeight: 700
                            }}>
                              {itinerary.flights.flight_type === 'one_way' ? 'One-way' : 'Round-trip'}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            {itinerary.flights.flight_type === 'one_way'
                              ? `Departure Date: ${itinerary.flights.departure_date} · Live Duffel MCP Search`
                              : `Dates: ${itinerary.flights.departure_date} to ${itinerary.flights.return_date || 'Return'} · Live Duffel MCP Search`
                            }
                          </span>
                        </div>
                      </div>
                      {itinerary.flights.estimated_total_airfare && (
                        <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '999px', padding: '0.35rem 0.85rem', color: '#38bdf8', fontSize: '0.82rem', fontWeight: 700 }}>
                          Airfare: {itinerary.flights.estimated_total_airfare}
                        </div>
                      )}
                    </div>

                    {itinerary.flights.notes && (
                      <div style={{ fontSize: '0.78rem', color: '#a7b5c9', marginBottom: '0.85rem', fontStyle: 'italic' }}>
                        💡 {itinerary.flights.notes}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                      {itinerary.flights.options?.map((opt, oIdx) => (
                        <div key={oIdx} style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>{opt.airline}</strong>
                            <span style={{ color: '#34d399', fontWeight: 800, fontSize: '0.92rem' }}>{opt.total_price}</span>
                          </div>
                          {opt.outbound && (
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                              <span style={{ color: '#38bdf8', fontWeight: 600 }}>{itinerary.flights.flight_type === 'one_way' ? 'Flight:' : 'Outbound:'}</span> {opt.outbound.departure_time} - {opt.outbound.arrival_time} ({opt.outbound.duration || 'Flight'}, {opt.outbound.stops === 0 ? 'Nonstop' : `${opt.outbound.stops} stop`})
                            </div>
                          )}
                          {opt.inbound && itinerary.flights.flight_type !== 'one_way' && (
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.45rem' }}>
                              <span style={{ color: '#818cf8', fontWeight: 600 }}>Return:</span> {opt.inbound.departure_time} - {opt.inbound.arrival_time} ({opt.inbound.duration || 'Flight'}, {opt.inbound.stops === 0 ? 'Nonstop' : `${opt.inbound.stops} stop`})
                            </div>
                          )}
                          {opt.booking_advice && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                              {opt.booking_advice}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. PRIORITY SECTION 1: RECOMMENDED STAYS (TOP PRIORITY) */}
              {itinerary.top_stays && itinerary.top_stays.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.75rem 2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '10px' }}>
                        <Hotel size={22} color="#10b981" />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>Recommended Stays & Bases</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Curated neighborhoods & accommodations selected for convenience and vibe</p>
                      </div>
                    </div>
                    <span className="badge badge-emerald">{itinerary.top_stays.length} Handpicked Options</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', alignItems: 'stretch' }}>
                    {itinerary.top_stays.map((stay, sIdx) => (
                      <div
                        key={sIdx}
                        className="glass-card"
                        style={{
                          padding: '1.4rem',
                          borderTop: '3px solid #10b981',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minWidth: 0,
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          height: '100%'
                        }}
                      >
                        <div>
                          {/* Hotel Name Full-Width Header */}
                          <div style={{ marginBottom: '0.65rem' }}>
                            <h4 style={{ fontSize: '1.08rem', fontWeight: 700, margin: 0, lineHeight: 1.35, wordBreak: 'break-word' }}>
                              <a
                                href={googleMapsSearchUrl(stay.name, stay.neighborhood, itinerary.destination)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#fff',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  flexWrap: 'wrap'
                                }}
                              >
                                <span>{stay.name}</span>
                                <ExternalLink size={14} color="#34d399" style={{ flexShrink: 0 }} />
                              </a>
                            </h4>
                          </div>

                          {/* Badges & Estimated Price in Dedicated Wrapped Row */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', marginBottom: '0.9rem' }}>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: '0.72rem' }}>
                              📍 {stay.neighborhood}
                            </span>
                            <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                              {stay.tier}
                            </span>
                            {stay.estimated_price_per_night && isValidPrice(stay.estimated_price_per_night) && (
                              <span
                                style={{
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  color: '#34d399',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  border: '1px solid rgba(16, 185, 129, 0.28)',
                                  borderRadius: '8px',
                                  padding: '0.22rem 0.55rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  wordBreak: 'break-word',
                                  lineHeight: 1.35,
                                  maxWidth: '100%'
                                }}
                              >
                                💵 {stay.estimated_price_per_night}
                              </span>
                            )}
                          </div>

                          {/* Recommendation Description */}
                          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, wordBreak: 'break-word', margin: 0 }}>
                            {stay.why_recommended}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. PRIORITY SECTION 2: INTERACTIVE BUDGET BREAKDOWN (DROPDOWN / COLLAPSIBLE ACCORDION) */}
              {itinerary.budget && (
                <div className="glass-panel" style={{ padding: '1.5rem 2rem', overflow: 'hidden' }}>
                  {/* Header Toggle */}
                  <div
                    onClick={() => setShowBudgetDetails(!showBudgetDetails)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '10px' }}>
                        <PieChart size={22} color="#38bdf8" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>Estimated Trip Budget</h3>
                          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399' }}>{itinerary.budget.grand_total}</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {showBudgetDetails ? 'Click to collapse breakdown' : 'Click to inspect visual breakdown & insider savings tips'}
                        </p>
                      </div>
                    </div>

                    <button
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.75rem',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.82rem',
                        fontWeight: 600
                      }}
                    >
                      {showBudgetDetails ? 'Hide Breakdown' : 'View Breakdown'}
                      {showBudgetDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>

                  {/* Collapsible Content */}
                  {showBudgetDetails && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>

                      {/* Visual 4-Stat Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', alignItems: 'stretch' }}>
                        <div className="glass-card" style={{ borderLeft: '3px solid #10b981', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, wordBreak: 'break-word' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>🏨 Lodging</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{itinerary.budget.lodging_total}</div>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#10b981', marginTop: '6px' }}>Estimated across all nights</div>
                        </div>

                        <div className="glass-card" style={{ borderLeft: '3px solid #f59e0b', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, wordBreak: 'break-word' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>🍽️ Dining & Food</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{itinerary.budget.food_total}</div>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#f59e0b', marginTop: '6px' }}>Meals & signature spots</div>
                        </div>

                        <div className="glass-card" style={{ borderLeft: '3px solid #38bdf8', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, wordBreak: 'break-word' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>🎟️ Activities & Tours</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{itinerary.budget.activities_total}</div>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#38bdf8', marginTop: '6px' }}>Tickets & landmarks</div>
                        </div>

                        <div className="glass-card" style={{ borderLeft: '3px solid #c084fc', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, wordBreak: 'break-word' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>🚇 Local Mobility</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{itinerary.budget.transit_total}</div>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#c084fc', marginTop: '6px' }}>Passes & transfers</div>
                        </div>
                      </div>

                      {/* Savings Tips Box */}
                      {itinerary.budget.savings_tips && itinerary.budget.savings_tips.length > 0 && (
                        <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: '1.15rem 1.35rem' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            💡 Insider Money-Saving Hacks:
                          </div>
                          <ul style={{ paddingLeft: '1.2rem', fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {itinerary.budget.savings_tips.map((tip, tIdx) => (
                              <li key={tIdx}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}

              {/* 4. PRIORITY SECTION 3: DAY-BY-DAY ITINERARY WITH TABS & STICKY MAP */}
              <div>
                {/* Day Selector Navigation Tabs */}
                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                  alignItems: 'center',
                  overflowX: 'auto',
                  paddingBottom: '0.25rem'
                }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>
                    Explore Days:
                  </span>
                  {itinerary.day_plans?.map((dp, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(idx)}
                      style={{
                        padding: '0.6rem 1.35rem',
                        borderRadius: '12px',
                        background: selectedDay === idx ? 'linear-gradient(135deg, #0284c7, #38bdf8)' : 'rgba(255, 255, 255, 0.04)',
                        border: selectedDay === idx ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: selectedDay === idx ? '#fff' : 'var(--text-secondary)',
                        fontWeight: selectedDay === idx ? 700 : 500,
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      <Calendar size={15} /> Day {dp.day_number}
                    </button>
                  ))}
                </div>

                {/* Day View: schedule and linked place names */}
                {currentDay && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.75rem', alignItems: 'start' }}>

                    {/* LEFT COLUMN: EXPERIENCES & DINING */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                      {/* Day Focus Header */}
                      <div className="glass-card" style={{ padding: '1.35rem', borderLeft: '4px solid #38bdf8' }}>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#38bdf8', fontWeight: 800 }}>
                          {currentDay.date_or_label || `Day ${currentDay.day_number}`}
                        </div>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0 6px 0', color: '#fff' }}>
                          {currentDay.theme}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          📍 <strong>District Focus:</strong> {currentDay.neighborhood_focus}
                        </p>
                      </div>

                      {/* Scheduled Activities */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Compass size={18} color="#38bdf8" />
                          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Experiences & Activities</h4>
                        </div>

                        {currentDay.activities?.map((act, aIdx) => (
                          <div key={aIdx} className="glass-card" style={{ padding: '1.25rem', borderLeft: '3px solid #0ea5e9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span className="badge badge-cyan" style={{ fontSize: '0.74rem' }}>
                                <Clock size={12} /> {act.time_slot}
                              </span>
                              {isValidPrice(act.cost_estimate) && (
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#34d399' }}>
                                  {act.cost_estimate}
                                </span>
                              )}
                            </div>
                            <h5 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                              <a href={googleMapsSearchUrl(act.title, act.location_name, itinerary.destination)} target="_blank" rel="noopener noreferrer" style={{ color: '#f8fafc', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                {act.title}<ExternalLink size={13} color="#38bdf8" />
                              </a>
                            </h5>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.45rem' }}>
                              📍 {act.location_name}
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                              {act.description}
                            </p>
                            {act.booking_tips && (
                              <div style={{ fontSize: '0.78rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: '8px', marginTop: '0.65rem' }}>
                                💡 <strong>Tip:</strong> {act.booking_tips}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Dining Spots */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Utensils size={18} color="#f59e0b" />
                          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Curated Dining</h4>
                        </div>

                        {currentDay.dining?.map((din, dIdx) => (
                          <div key={dIdx} className="glass-card" style={{ padding: '1.25rem', borderLeft: '3px solid #f59e0b' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span className="badge badge-amber" style={{ fontSize: '0.74rem' }}>
                                {din.meal_type} • {din.cuisine}
                              </span>
                              {isValidPrice(din.price_level) && (
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f59e0b' }}>
                                  {din.price_level}
                                </span>
                              )}
                            </div>
                            <h5 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                              <a href={googleMapsSearchUrl(din.name, din.location_name, itinerary.destination)} target="_blank" rel="noopener noreferrer" style={{ color: '#f8fafc', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                {din.name}<ExternalLink size={13} color="#f59e0b" />
                              </a>
                            </h5>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.45rem' }}>
                              📍 {din.location_name}
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                              {din.description}
                            </p>
                            <div style={{ fontSize: '0.8rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.08)', padding: '6px 10px', borderRadius: '8px', marginTop: '0.65rem' }}>
                              ⭐ <strong>Must Try Dish:</strong> {din.must_try_dish}
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>

                  </div>
                )}
              </div>

              {/* 5. DEDICATED MOBILITY & TRANSIT GUIDE */}
              {(itinerary.airport_transfer_guide || itinerary.general_transit_tips) && (
                <div
                  className="glass-panel"
                  style={{
                    padding: '1.75rem 2rem',
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.04) 0%, rgba(56, 189, 248, 0.04) 100%)',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    borderRadius: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '7px 9px', borderRadius: '10px' }}>
                      <Train size={20} color="#c084fc" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                        Mobility & Transit Guide
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                        Curated by Mobility & Transit Agent • Seamless navigation & airport connection
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>

                    {/* Airport Transfer Card */}
                    {itinerary.airport_transfer_guide && (
                      <div
                        className="glass-card"
                        style={{
                          padding: '1.25rem',
                          borderLeft: '3px solid #38bdf8',
                          background: 'rgba(15, 23, 42, 0.55)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>✈️</span>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8', margin: 0 }}>
                            Airport-to-City Transfer
                          </h4>
                        </div>
                        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
                          {itinerary.airport_transfer_guide}
                        </p>
                      </div>
                    )}

                    {/* General Transit & Passes Card */}
                    {itinerary.general_transit_tips && (
                      <div
                        className="glass-card"
                        style={{
                          padding: '1.25rem',
                          borderLeft: '3px solid #c084fc',
                          background: 'rgba(15, 23, 42, 0.55)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>🚇</span>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#c084fc', margin: 0 }}>
                            Metro Passes, Taxis & City Mobility
                          </h4>
                        </div>
                        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
                          {itinerary.general_transit_tips}
                        </p>
                      </div>
                    )}

                  </div>
                </div>
              )}

            </div>

            {/* Complete Multi-Page Printable PDF Dossier */}
            <PrintDossier itinerary={itinerary} formData={formData} />
          </>
        )}

      </main>

      {/* Global Export & Synchronization Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        itinerary={itinerary}
        formData={formData}
      />

    </div>
  );
}
