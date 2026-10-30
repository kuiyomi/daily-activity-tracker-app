/**
 * app.js – application entry point.
 * Manages routing between the calendar and the day-detail screen.
 */

import { mountCalendarView } from './ui/calendarView.js';
import { mountDayDetailView } from './ui/dayDetailView.js';

const root = document.getElementById('app');

function showCalendar() {
  mountCalendarView(root, {
    onDaySelect: (dateStr) => showDayDetail(dateStr),
  });
}

function showDayDetail(dateStr) {
  mountDayDetailView(root, dateStr, {
    onBack: () => showCalendar(),
  });
}

// Boot
showCalendar();
