import { Event, Notification } from '../../types';
import { apiFetch } from './client';
import { getMockNotifications, markNotificationAsRead, removeNotification } from './mocks';
import { getEventsRequest } from './events';

type NotificationState = {
  notified: string[];
  signatures: Record<number, string>;
};

const getNotificationState = (userId?: number): NotificationState => {
  const key = `konekt_event_notifications_${userId ?? 'guest'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { notified: [], signatures: {} };
    const parsed = JSON.parse(raw) as NotificationState;
    return {
      notified: Array.isArray(parsed.notified) ? parsed.notified : [],
      signatures: parsed.signatures ?? {},
    };
  } catch {
    return { notified: [], signatures: {} };
  }
};

const setNotificationState = (userId: number | undefined, state: NotificationState) => {
  const key = `konekt_event_notifications_${userId ?? 'guest'}`;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
};

const parseEventStart = (event: Event) => {
  if (event.startsAt) {
    const date = new Date(event.startsAt);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (event.date && event.time) {
    const time = event.time.includes('–') ? event.time.split('–')[0] : event.time;
    const date = new Date(`${event.date} ${time}`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
};

const getUserId = (): number | undefined => {
  try {
    const raw = localStorage.getItem('konekt_user');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { id?: number };
    return parsed.id;
  } catch {
    return undefined;
  }
};

const isParticipant = (event: Event, userId: number | undefined) => {
  if (!userId) return false;
  const attendeeIds = (event as Event & { attendeeIds?: number[] }).attendeeIds;
  if (Array.isArray(attendeeIds) && attendeeIds.includes(userId)) return true;
  const attendeesList = (event as Event & { attendeesList?: Array<{ id: number }> }).attendeesList;
  if (Array.isArray(attendeesList) && attendeesList.some((attendee) => attendee.id === userId)) return true;
  const creatorId = (event as Event & { creatorId?: number }).creatorId;
  if (creatorId === userId) return true;
  try {
    const raw = localStorage.getItem(`konekt_event_participation_${userId}`);
    const ids = raw ? (JSON.parse(raw) as number[]) : [];
    return ids.includes(event.id);
  } catch {
    return false;
  }
};

const buildEventNotifications = (events: Event[]): Notification[] => {
  const userId = getUserId();
  const relevantEvents = events.filter((event) => isParticipant(event, userId));
  if (relevantEvents.length === 0) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextDayStart = new Date(todayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);

  const state = getNotificationState(userId);
  const notified = new Set(state.notified);
  const nextSignatures = { ...state.signatures };
  const notifications: Notification[] = [];

  relevantEvents.forEach((event) => {
    const signature = JSON.stringify({
      name: event.name,
      location: event.location,
      date: event.date,
      time: event.time,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
    const previousSignature = state.signatures[event.id];
    if (previousSignature && previousSignature !== signature) {
      const key = `change:${event.id}:${signature}`;
      if (!notified.has(key)) {
        notifications.push({
          id: Date.now() + notifications.length,
          type: 'event',
          message: `O evento ${event.name} foi atualizado`,
          time: 'agora',
          unread: true,
        });
        notified.add(key);
      }
    }
    nextSignatures[event.id] = signature;

    const start = parseEventStart(event);
    if (!start) return;
    const startKey = `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;

    if (start >= now && start < nextDayStart) {
      const key = `today:${event.id}:${startKey}`;
      if (!notified.has(key)) {
        notifications.push({
          id: Date.now() + notifications.length,
          type: 'reminder',
          message: `${event.name} acontece hoje`,
          time: 'agora',
          unread: true,
        });
        notified.add(key);
      }
    }

    const diffMs = start.getTime() - now.getTime();
    if (diffMs > 0 && diffMs <= 60 * 60 * 1000) {
      const key = `1h:${event.id}:${startKey}`;
      if (!notified.has(key)) {
        notifications.push({
          id: Date.now() + notifications.length,
          type: 'reminder',
          message: `${event.name} começa em 1 hora`,
          time: 'agora',
          unread: true,
        });
        notified.add(key);
      }
    }
  });

  setNotificationState(userId, {
    notified: Array.from(notified),
    signatures: nextSignatures,
  });

  return notifications;
};

export const getNotificationsRequest = async (): Promise<Notification[]> => {
  try {
    const [notifications, events] = await Promise.all([
      apiFetch<Notification[]>('/notifications'),
      getEventsRequest(),
    ]);
    const eventNotifications = buildEventNotifications(events);
    return [...eventNotifications, ...notifications];
  } catch {
    const base = getMockNotifications();
    const events = await getEventsRequest();
    const eventNotifications = buildEventNotifications(events);
    return [...eventNotifications, ...base];
  }
};

export const markAsReadRequest = async (id: number): Promise<void> => {
  try {
    await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
  } catch {
    markNotificationAsRead(id);
  }
};

export const removeNotificationRequest = async (id: number): Promise<void> => {
  try {
    await apiFetch(`/notifications/${id}`, { method: 'DELETE' });
  } catch {
    removeNotification(id);
  }
};
