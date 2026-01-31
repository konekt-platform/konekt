import { Event, EventType } from '../../../types';

export type EventPeriodFilter = 'all' | 'morning' | 'afternoon' | 'evening';
export type EventDayFilter = 'all' | 'today' | 'tomorrow' | 'next_3_days' | 'this_week' | 'next_week';
export type EventVisibilityFilter = 'all' | Event['visibility'];
export type EventGenderFilter = 'all' | Event['genderFocus'];
export type EventTypeFilter = 'all' | EventType;

export interface EventFilters {
  radiusKm: number;
  period: EventPeriodFilter;
  dayRange: EventDayFilter;
  genderFocus: EventGenderFilter;
  visibility: EventVisibilityFilter;
  eventType: EventTypeFilter;
}

const getHourFromTime = (time: string) => {
  const [hour] = time.split(':').map(Number);
  return Number.isNaN(hour) ? 0 : hour;
};

const matchesPeriod = (event: Event, period: EventPeriodFilter) => {
  if (period === 'all') return true;
  const hour = getHourFromTime(event.time);

  if (period === 'morning') return hour >= 5 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 18;
  return hour >= 18 || hour < 5;
};

const getEventDate = (event: Event) => {
  const value = event.startsAt || `${event.date} ${event.time}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const matchesDayRange = (event: Event, range: EventDayFilter) => {
  if (range === 'all') return true;
  const eventDate = getEventDate(event);
  if (!eventDate) return true;

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const dayIndex = (todayStart.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - dayIndex);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextNextWeekStart = new Date(weekStart);
  nextNextWeekStart.setDate(nextNextWeekStart.getDate() + 14);

  if (range === 'today') {
    const end = new Date(tomorrowStart);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return eventDate >= todayStart && eventDate <= end;
  }

  if (range === 'tomorrow') {
    const end = new Date(tomorrowStart);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return eventDate >= tomorrowStart && eventDate <= end;
  }

  if (range === 'next_3_days') {
    const threeDaysEnd = new Date(todayStart);
    threeDaysEnd.setDate(threeDaysEnd.getDate() + 3);
    threeDaysEnd.setHours(23, 59, 59, 999);
    return eventDate >= todayStart && eventDate <= threeDaysEnd;
  }

  if (range === 'this_week') {
    return eventDate >= weekStart && eventDate < nextWeekStart;
  }

  return eventDate >= nextWeekStart && eventDate < nextNextWeekStart;
};

export const filterEvents = (events: Event[], filters: EventFilters) => {
  return events.filter((event) => {
    if (event.distanceKm > filters.radiusKm) return false;
    if (!matchesDayRange(event, filters.dayRange)) return false;
    if (!matchesPeriod(event, filters.period)) return false;
    if (filters.genderFocus !== 'all' && event.genderFocus !== filters.genderFocus) return false;
    if (filters.visibility !== 'all' && event.visibility !== filters.visibility) return false;
    if (filters.eventType !== 'all' && event.type !== filters.eventType) return false;
    return true;
  });
};

