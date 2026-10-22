
/**
 * Universal iCalendar (.ics) and Calendar Export Utility
 * Generates RFC 5545 compliant .ics files for Apple Calendar, Google Calendar, and Outlook.
 */

/**
 * Escapes characters for iCalendar text fields according to RFC 5545
 */
function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Formats a Date object as YYYYMMDDTHHMMSS (floating local time)
 */
function formatIcsDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${m}${d}T${h}${min}${s}`;
}

/**
 * Formats a Date object as YYYYMMDD (all-day event)
 */
function formatIcsDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}${m}${d}`;
}

/**
 * Parses time slots like "Morning (09:00 - 11:00)", "09:30 AM - 12:00 PM",
 * "Afternoon (02:00 PM - 05:00 PM)", or falls back gracefully based on index.
 */
function parseTimeSlotHours(timeSlot, fallbackIndex = 0) {
  const fallbackSlots = [
    { startH: 9, startM: 30, endH: 11, endM: 30 },
    { startH: 13, startM: 0, endH: 15, endM: 0 },
    { startH: 15, startM: 30, endH: 17, endM: 30 },
    { startH: 19, startM: 0, endH: 21, endM: 0 },
  ];

  if (!timeSlot || typeof timeSlot !== 'string') {
    return fallbackSlots[Math.min(fallbackIndex, fallbackSlots.length - 1)];
  }

  // Look for 12-hour format e.g. "09:30 AM - 12:00 PM" or "2:00 PM - 4:30 PM"
  const ampmRegex = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—to]+\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;
  const ampmMatch = timeSlot.match(ampmRegex);
  if (ampmMatch) {
    let sH = parseInt(ampmMatch[1], 10);
    const sM = parseInt(ampmMatch[2], 10);
    const sPeriod = ampmMatch[3].toUpperCase();
    let eH = parseInt(ampmMatch[4], 10);
    const eM = parseInt(ampmMatch[5], 10);
    const ePeriod = ampmMatch[6].toUpperCase();

    if (sPeriod === 'PM' && sH < 12) sH += 12;
    if (sPeriod === 'AM' && sH === 12) sH = 0;
    if (ePeriod === 'PM' && eH < 12) eH += 12;
    if (ePeriod === 'AM' && eH === 12) eH = 0;

    return { startH: sH, startM: sM, endH: eH, endM: eM };
  }

  // Look for 24-hour format e.g. "09:00 - 11:00" or "14:30 - 17:00"
  const h24Regex = /(\d{1,2}):(\d{2})\s*[-–—to]+\s*(\d{1,2}):(\d{2})/;
  const h24Match = timeSlot.match(h24Regex);
  if (h24Match) {
    const sH = parseInt(h24Match[1], 10);
    const sM = parseInt(h24Match[2], 10);
    const eH = parseInt(h24Match[3], 10);
    const eM = parseInt(h24Match[4], 10);
    return { startH: sH, startM: sM, endH: eH, endM: eM };
  }

  // Heuristic based on keywords in time_slot
  const lower = timeSlot.toLowerCase();
  if (lower.includes('morning')) return { startH: 9, startM: 0, endH: 11, endM: 30 };
  if (lower.includes('afternoon')) return { startH: 13, startM: 30, endH: 16, endM: 0 };
  if (lower.includes('evening') || lower.includes('night')) return { startH: 18, startM: 30, endH: 21, endM: 0 };

  return fallbackSlots[Math.min(fallbackIndex, fallbackSlots.length - 1)];
}

/**
 * Returns default meal times based on meal type
 */
function getMealTimeHours(mealType) {
  const lower = (mealType || '').toLowerCase();
  if (lower.includes('breakfast')) return { startH: 8, startM: 30, endH: 9, endM: 30 };
  if (lower.includes('lunch')) return { startH: 12, startM: 30, endH: 13, endM: 45 };
  if (lower.includes('dinner')) return { startH: 19, startM: 0, endH: 20, endM: 45 };
  if (lower.includes('snack') || lower.includes('cafe')) return { startH: 15, startM: 30, endH: 16, endM: 30 };
  return { startH: 13, startM: 0, endH: 14, endM: 0 };
}

/**
 * Determines base start date for Day 1
 */
function getTripStartDate(formData, itinerary) {
  const candidate = formData?.departure_date || itinerary?.flights?.departure_date;
  if (candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    const [y, m, d] = candidate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Fallback: 14 days from today
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 14);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

/**
 * Generates an RFC 5545 compliant .ics string from the complete itinerary
 */
export function generateItineraryIcs(itinerary, formData = {}) {
  if (!itinerary) return '';

  const now = new Date();
  const dtStamp = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const startDate = getTripStartDate(formData, itinerary);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TravelConcierge AI//Multi-Agent Travel Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(itinerary.trip_title || `${itinerary.destination} Itinerary`)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  let eventCounter = 1;
  const generateUid = (prefix) =>
    `${prefix}-${Date.now()}-${eventCounter++}@travelconcierge.ai`;

  // 1. Flight Events (if available)
  if (itinerary.flights?.options?.length > 0) {
    const topFlight = itinerary.flights.options[0];

    // Outbound Flight
    if (topFlight.outbound) {
      const fDateStr = itinerary.flights.departure_date;
      const fDate = fDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fDateStr)
        ? new Date(...fDateStr.split('-').map((v, i) => i === 1 ? v - 1 : +v))
        : new Date(startDate);

      const fTimes = parseTimeSlotHours(`${topFlight.outbound.departure_time} - ${topFlight.outbound.arrival_time}`, 0);
      const fStart = new Date(fDate);
      fStart.setHours(fTimes.startH, fTimes.startM, 0, 0);
      const fEnd = new Date(fDate);
      fEnd.setHours(fTimes.endH, fTimes.endM, 0, 0);
      if (fEnd <= fStart) fEnd.setDate(fEnd.getDate() + 1);

      const desc = [
        `Airline: ${topFlight.airline}`,
        topFlight.outbound.flight_number ? `Flight #: ${topFlight.outbound.flight_number}` : '',
        `Route: ${itinerary.flights.origin || 'Origin'} ➔ ${itinerary.flights.destination || itinerary.destination}`,
        `Cabin: ${topFlight.cabin_class || 'Economy'}`,
        `Fare: ${topFlight.total_price || ''}`,
        topFlight.booking_advice ? `Note: ${topFlight.booking_advice}` : '',
      ].filter(Boolean).join('\n');

      lines.push(
        'BEGIN:VEVENT',
        `UID:${generateUid('flight-out')}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${formatIcsDateTime(fStart)}`,
        `DTEND:${formatIcsDateTime(fEnd)}`,
        `SUMMARY:${escapeIcsText(`✈️ Flight to ${itinerary.destination}: ${topFlight.airline} (${itinerary.flights.origin} ➔ ${itinerary.destination})`)}`,
        `DESCRIPTION:${escapeIcsText(desc)}`,
        `LOCATION:${escapeIcsText(itinerary.flights.origin || 'Airport')}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }

    // Inbound Flight
    if (topFlight.inbound && itinerary.flights.flight_type !== 'one_way') {
      const retDateStr = itinerary.flights.return_date;
      const retDate = retDateStr && /^\d{4}-\d{2}-\d{2}$/.test(retDateStr)
        ? new Date(...retDateStr.split('-').map((v, i) => i === 1 ? v - 1 : +v))
        : new Date(startDate.getTime() + (itinerary.duration_days || 3) * 86400000);

      const rTimes = parseTimeSlotHours(`${topFlight.inbound.departure_time} - ${topFlight.inbound.arrival_time}`, 2);
      const rStart = new Date(retDate);
      rStart.setHours(rTimes.startH, rTimes.startM, 0, 0);
      const rEnd = new Date(retDate);
      rEnd.setHours(rTimes.endH, rTimes.endM, 0, 0);
      if (rEnd <= rStart) rEnd.setDate(rEnd.getDate() + 1);

      const desc = [
        `Airline: ${topFlight.airline}`,
        topFlight.inbound.flight_number ? `Flight #: ${topFlight.inbound.flight_number}` : '',
        `Route: ${itinerary.flights.destination || itinerary.destination} ➔ ${itinerary.flights.origin || 'Home'}`,
        `Cabin: ${topFlight.cabin_class || 'Economy'}`,
      ].filter(Boolean).join('\n');

      lines.push(
        'BEGIN:VEVENT',
        `UID:${generateUid('flight-in')}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${formatIcsDateTime(rStart)}`,
        `DTEND:${formatIcsDateTime(rEnd)}`,
        `SUMMARY:${escapeIcsText(`✈️ Return Flight: ${topFlight.airline} to ${itinerary.flights.origin || 'Home'}`)}`,
        `DESCRIPTION:${escapeIcsText(desc)}`,
        `LOCATION:${escapeIcsText(itinerary.destination)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }
  }

  // 2. Primary Stay / Lodging Event
  if (itinerary.top_stays?.length > 0) {
    const primaryStay = itinerary.top_stays[0];
    const checkIn = new Date(startDate);
    checkIn.setHours(15, 0, 0, 0); // standard 3 PM check-in
    const checkOut = new Date(startDate);
    checkOut.setDate(checkOut.getDate() + (itinerary.duration_days || 3));
    checkOut.setHours(11, 0, 0, 0); // standard 11 AM check-out

    const stayDesc = [
      `Hotel: ${primaryStay.name}`,
      `Neighborhood: ${primaryStay.neighborhood}`,
      `Tier: ${primaryStay.tier}`,
      primaryStay.estimated_price_per_night ? `Estimated Rate: ${primaryStay.estimated_price_per_night}` : '',
      `Why Recommended: ${primaryStay.why_recommended}`,
      `Google Maps: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${primaryStay.name}, ${primaryStay.neighborhood}, ${itinerary.destination}`)}`,
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${generateUid('stay')}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${formatIcsDateTime(checkIn)}`,
      `DTEND:${formatIcsDateTime(checkOut)}`,
      `SUMMARY:${escapeIcsText(`🏨 Hotel Stay: ${primaryStay.name} (${primaryStay.neighborhood})`)}`,
      `DESCRIPTION:${escapeIcsText(stayDesc)}`,
      `LOCATION:${escapeIcsText(`${primaryStay.name}, ${primaryStay.neighborhood}, ${itinerary.destination}`)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  // 3. Day Plans (Daily Overview, Activities & Dining)
  if (Array.isArray(itinerary.day_plans)) {
    itinerary.day_plans.forEach((dp, dayIdx) => {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + dayIdx);

      // Daily Theme All-Day Event
      const nextDayDate = new Date(dayDate);
      nextDayDate.setDate(nextDayDate.getDate() + 1);

      const daySummaryDesc = [
        `Theme: ${dp.theme}`,
        `District Focus: ${dp.neighborhood_focus}`,
        dp.transit_notes ? `Transit Notes: ${dp.transit_notes}` : '',
      ].filter(Boolean).join('\n');

      lines.push(
        'BEGIN:VEVENT',
        `UID:${generateUid(`day-${dp.day_number}-theme`)}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${formatIcsDate(dayDate)}`,
        `DTEND;VALUE=DATE:${formatIcsDate(nextDayDate)}`,
        `SUMMARY:${escapeIcsText(`📅 Day ${dp.day_number}: ${dp.theme} [${dp.neighborhood_focus}]`)}`,
        `DESCRIPTION:${escapeIcsText(daySummaryDesc)}`,
        `LOCATION:${escapeIcsText(`${dp.neighborhood_focus}, ${itinerary.destination}`)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );

      // Scheduled Activities
      if (Array.isArray(dp.activities)) {
        dp.activities.forEach((act, aIdx) => {
          const times = parseTimeSlotHours(act.time_slot, aIdx);
          const actStart = new Date(dayDate);
          actStart.setHours(times.startH, times.startM, 0, 0);
          const actEnd = new Date(dayDate);
          actEnd.setHours(times.endH, times.endM, 0, 0);

          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${act.title}, ${act.location_name}, ${itinerary.destination}`)}`;
          const actDesc = [
            act.description,
            '',
            act.cost_estimate ? `💰 Cost: ${act.cost_estimate}` : '',
            act.time_slot ? `⏰ Scheduled: ${act.time_slot}` : '',
            act.booking_tips ? `💡 Tip: ${act.booking_tips}` : '',
            `📍 Location: ${act.location_name}`,
            `🗺️ Google Maps: ${mapsUrl}`,
          ].filter(Boolean).join('\n');

          lines.push(
            'BEGIN:VEVENT',
            `UID:${generateUid(`day-${dp.day_number}-act-${aIdx}`)}`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${formatIcsDateTime(actStart)}`,
            `DTEND:${formatIcsDateTime(actEnd)}`,
            `SUMMARY:${escapeIcsText(`🎯 ${act.title}`)}`,
            `DESCRIPTION:${escapeIcsText(actDesc)}`,
            `LOCATION:${escapeIcsText(`${act.location_name}, ${itinerary.destination}`)}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
          );
        });
      }

      // Scheduled Dining
      if (Array.isArray(dp.dining)) {
        dp.dining.forEach((din, dIdx) => {
          const times = getMealTimeHours(din.meal_type);
          const dinStart = new Date(dayDate);
          dinStart.setHours(times.startH, times.startM, 0, 0);
          const dinEnd = new Date(dayDate);
          dinEnd.setHours(times.endH, times.endM, 0, 0);

          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${din.name}, ${din.location_name}, ${itinerary.destination}`)}`;
          const dinDesc = [
            din.description,
            '',
            din.cuisine ? `🍲 Cuisine: ${din.cuisine}` : '',
            din.must_try_dish ? `⭐ Must-Try: ${din.must_try_dish}` : '',
            din.price_level ? `💵 Price Level: ${din.price_level}` : '',
            `📍 Location: ${din.location_name}`,
            `🗺️ Google Maps: ${mapsUrl}`,
          ].filter(Boolean).join('\n');

          lines.push(
            'BEGIN:VEVENT',
            `UID:${generateUid(`day-${dp.day_number}-din-${dIdx}`)}`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${formatIcsDateTime(dinStart)}`,
            `DTEND:${formatIcsDateTime(dinEnd)}`,
            `SUMMARY:${escapeIcsText(`🍽️ ${din.meal_type}: ${din.name} (${din.cuisine || 'Local Cuisine'})`)}`,
            `DESCRIPTION:${escapeIcsText(dinDesc)}`,
            `LOCATION:${escapeIcsText(`${din.location_name}, ${itinerary.destination}`)}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
          );
        });
      }
    });
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Triggers browser download of .ics file
 */
export function downloadItineraryIcs(itinerary, formData = {}) {
  const icsContent = generateItineraryIcs(itinerary, formData);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const safeTitle = (itinerary?.destination || 'travel-itinerary')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${safeTitle}-itinerary.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Counts total exportable events for summary displays
 */
export function countItineraryEvents(itinerary) {
  if (!itinerary) return 0;
  let count = 0;
  if (itinerary.flights?.options?.length > 0) {
    count += itinerary.flights.options[0].outbound ? 1 : 0;
    count += (itinerary.flights.options[0].inbound && itinerary.flights.flight_type !== 'one_way') ? 1 : 0;
  }
  if (itinerary.top_stays?.length > 0) count += 1;
  if (Array.isArray(itinerary.day_plans)) {
    itinerary.day_plans.forEach((dp) => {
      count += 1; // All-day theme
      count += (dp.activities?.length || 0);
      count += (dp.dining?.length || 0);
    });
  }
  return count;
}
