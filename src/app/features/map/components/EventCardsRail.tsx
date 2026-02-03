import { Event } from "../../../types";
import { getPinSize } from "../utils/eventPins";
import { EventCard } from "./EventCard";

interface EventCardsRailProps {
  events?: Event[];
  onSelectEvent: (event: Event) => void;
}

export function EventCardsRail({ events, onSelectEvent }: EventCardsRailProps) {
  if (!events?.length) {
    return null;
  }

  return (
    <div className="absolute bottom-6 left-0 right-0 z-[1000] px-3 pointer-events-none">
      <div className="flex gap-3 overflow-x-auto pb-2 pointer-events-auto snap-x snap-mandatory">
        {events.map((event) => {
          const { size } = getPinSize();

          return (
            <EventCard
              key={`event-card-${event.id}-${event.attendees}`}
              event={event}
              opacity={size >= 48 ? 1 : 0.95}
              onSelect={() => onSelectEvent(event)}
            />
          );
        })}
      </div>
    </div>
  );
}
