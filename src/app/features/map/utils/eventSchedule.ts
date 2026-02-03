import { Event } from "../../../types";

export const isEventActive = (event: Event, now: Date = new Date()) => {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return now >= start && now <= end;
};

export const formatEventTimeRange = (event: Event) => {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }

  const format = (value: Date) =>
    value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return `${format(start)}–${format(end)}`;
};

export const hasEventStarted = (event: Event, now: Date = new Date()) => {
  const start = new Date(event.startsAt);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  return now >= start;
};

export const hasEventEnded = (event: Event, now: Date = new Date()) => {
  const end = new Date(event.endsAt);

  if (Number.isNaN(end.getTime())) {
    return false;
  }

  return now > end;
};
