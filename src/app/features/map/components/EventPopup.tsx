import { ChevronLeft, ChevronRight } from "lucide-react";
import { Event } from "../../../types";
import { getVisibilityColor, getVisibilityGlow } from "../utils/eventLabels";
import { formatEventTimeRange } from "../utils/eventSchedule";

interface EventPopupProps {
  event: Event;
  overlappingEvents?: Event[];
  onNavigate?: (event: Event) => void;
  onViewMore?: (event: Event) => void;
}

export function EventPopup({
  event,
  overlappingEvents,
  onNavigate,
  onViewMore,
}: EventPopupProps) {
  const { icon, label } = event.theme;

  const hasOverlap = overlappingEvents && overlappingEvents.length > 1;
  const currentIndex = hasOverlap
    ? overlappingEvents.findIndex((e) => e.id === event.id)
    : -1;

  const handleNavigate = (direction: "prev" | "next") => {
    if (!hasOverlap || !onNavigate) return;

    const total = overlappingEvents.length;
    const offset = direction === "prev" ? -1 : 1;
    const targetIndex = (currentIndex + offset + total) % total;
    const targetEvent = overlappingEvents[targetIndex];
    if (targetEvent) {
      onNavigate(targetEvent);
    }
  };

  const visibilityColor = getVisibilityColor(event.visibility);
  const visibilityGlow = getVisibilityGlow(event.visibility);
  const timeRange = formatEventTimeRange(event);

  return (
    <div
      className="w-[220px] rounded-xl overflow-hidden bg-background text-foreground"
      style={{
        border: `2px solid ${visibilityColor}`,
        boxShadow: visibilityGlow,
      }}
    >
      <div className="w-full h-[100px] relative rounded-t-xl overflow-hidden">
        <img
          src={event.image}
          alt={event.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-[12px] font-semibold text-white line-clamp-1">
            {event.name}
          </p>
        </div>
        {hasOverlap && (
          <>
            <button
              onClick={() => handleNavigate("prev")}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 transition-all ${"bg-black/70 backdrop-blur-sm text-white hover:bg-black/90 hover:scale-110 cursor-pointer"}`}
              type="button"
              aria-label="Evento anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleNavigate("next")}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 transition-all ${"bg-black/70 backdrop-blur-sm text-white hover:bg-black/90 hover:scale-110 cursor-pointer"}`}
              type="button"
              aria-label="Próximo evento"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
        <div
          className="absolute top-2 left-2 text-white px-2.5 py-1 rounded-2xl text-[11px] font-semibold flex items-center gap-1"
          style={{ background: visibilityColor }}
        >
          <span>{icon}</span>
          <span>{label}</span>
        </div>
        {!hasOverlap && (
          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white px-2.5 py-1 rounded-2xl text-[11px] font-semibold">
            👥{" "}
            <span key={`popup-attendees-${event.id}-${event.attendees}`}>
              {event.attendees || 0}
            </span>
          </div>
        )}
      </div>
      <div className="p-3.5">
        <p className="m-0 mb-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="text-sm">📅</span>
          <span>
            {event.date} às {timeRange || event.time}
          </span>
        </p>
        <button
          onClick={() => onViewMore?.(event)}
          className="w-full text-white py-2.5 rounded-xl border-none cursor-pointer font-semibold text-[13px] transition-all hover:scale-[1.02] active:scale-100 flex items-center justify-center"
          style={{ background: visibilityColor }}
          type="button"
        >
          Ver mais
        </button>
      </div>
    </div>
  );
}
