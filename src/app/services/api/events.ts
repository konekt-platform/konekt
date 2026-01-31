import { Event } from "../../types";
import { getEventTheme } from "../../config/event-categories";
import { apiFetch } from "./client";
import { getMockEvents } from "./mocks";

export const getEventsRequest = async (): Promise<Event[]> => {
  try {
    const data = await apiFetch<Event[]>("/events");
    const mockEvents = getMockEvents();
    const merged = new Map<number, Event>();
    [...mockEvents, ...data].forEach((event) => {
      merged.set(event.id, event);
    });
    return Array.from(merged.values()).map((event) => ({
      ...event,
      theme: getEventTheme(event.type),
    }));
  } catch {
    const mockEvents = getMockEvents();
    return mockEvents.map((event) => ({
      ...event,
      theme: getEventTheme(event.type),
    }));
  }
};

export const getEventRequest = async (eventId: number): Promise<Event> => {
  return apiFetch<Event>(`/events/${eventId}`);
};

export const requestJoinEventRequest = async (eventId: number) => {
  return apiFetch<{ status: "pending" | "joined"; event?: Event }>(
    `/events/${eventId}/join`,
    {
      method: "POST",
    },
  );
};

export type EventChatMessage = {
  id: number;
  authorId: number;
  author: string;
  authorAvatar?: string;
  text?: string;
  photoUrl?: string;
  createdAt: string;
};

export type EventMediaItem = {
  id: number;
  authorId: number;
  author: string;
  authorAvatar?: string;
  photoUrl: string;
  createdAt: string;
};

export const getEventChatRequest = async (
  eventId: number,
): Promise<EventChatMessage[]> => {
  return apiFetch<EventChatMessage[]>(`/events/${eventId}/chat`);
};

export const postEventChatRequest = async (
  eventId: number,
  payload: { text?: string; photoUrl?: string; authorId?: number },
): Promise<{
  message: EventChatMessage;
  chat: EventChatMessage[];
  media: EventMediaItem[];
}> => {
  return apiFetch<{
    message: EventChatMessage;
    chat: EventChatMessage[];
    media: EventMediaItem[];
  }>(`/events/${eventId}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getEventMediaRequest = async (
  eventId: number,
): Promise<EventMediaItem[]> => {
  return apiFetch<EventMediaItem[]>(`/events/${eventId}/media`);
};

export const createEventRequest = async (event: Event): Promise<Event> => {
  return await apiFetch<Event>("/events", {
    method: "POST",
    body: JSON.stringify(event),
  });
};

export const updateEventRequest = async (
  eventId: number,
  event: Partial<Event>,
): Promise<Event> => {
  try {
    return await apiFetch<Event>(`/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(event),
    });
  } catch {
    // Fallback: retorna evento atualizado localmente
    return event as Event;
  }
};

export const deleteEventRequest = async (eventId: number): Promise<void> => {
  try {
    await apiFetch(`/events/${eventId}`, {
      method: "DELETE",
    });
  } catch {
    // Ignora erros no fallback
  }
};

export const checkInEventRequest = async (
  eventId: number,
  photo: File,
): Promise<{
  ok: boolean;
  message: string;
  photoUrl: string;
  participation: any;
}> => {
  const formData = new FormData();
  formData.append("photo", photo);

  const API_URL =
    (import.meta as any).env.VITE_API_URL || "http://localhost:3000";
  const token = localStorage.getItem("konekt_token");

  const res = await fetch(`${API_URL}/events/${eventId}/checkin`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res
      .json()
      .catch(() => ({ error: "Falha ao fazer check-in" }));
    throw new Error(errorData.error || "Falha ao fazer check-in");
  }

  return res.json();
};

export const getParticipationsRequest = async (filters?: {
  status?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ participations: any[]; stats: any }> => {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.eventType) params.append("eventType", filters.eventType);
  if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.append("dateTo", filters.dateTo);

  const query = params.toString();
  return apiFetch<{ participations: any[]; stats: any }>(
    `/users/me/participations${query ? `?${query}` : ""}`,
  );
};

// Expenses API
export const getEventExpensesRequest = async (
  eventId: number,
): Promise<any[]> => {
  return apiFetch<any[]>(`/events/${eventId}/expenses`);
};

export const addEventExpenseRequest = async (
  eventId: number,
  expense: {
    title: string;
    amount: number;
    participants?: any[];
    pixKey?: string;
  },
): Promise<any> => {
  return apiFetch<any>(`/events/${eventId}/expenses`, {
    method: "POST",
    body: JSON.stringify(expense),
  });
};

export const updateEventExpenseRequest = async (
  eventId: number,
  expenseId: string | number,
  expense: { title?: string; amount?: number; participants?: any[] },
): Promise<any> => {
  return apiFetch<any>(`/events/${eventId}/expenses/${expenseId}`, {
    method: "PUT",
    body: JSON.stringify(expense),
  });
};

// Update status of a participant in an expense
export const updateExpenseParticipantStatusRequest = async (
  eventId: number,
  expenseId: number,
  participantId: number,
  status: "pending" | "paid_waiting_confirmation" | "paid",
): Promise<any> => {
  return apiFetch<any>(
    `/events/${eventId}/expenses/${expenseId}/participants/${participantId}`,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    },
  );
};

export const deleteEventExpenseRequest = async (
  eventId: number,
  expenseId: string | number,
): Promise<void> => {
  await apiFetch(`/events/${eventId}/expenses/${expenseId}`, {
    method: "DELETE",
  });
};
