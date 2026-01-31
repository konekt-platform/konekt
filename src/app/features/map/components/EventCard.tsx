import { Event } from '../../../types';
import { EventChips } from './EventChips';
import { getVisibilityColor } from '../utils/eventLabels';

interface EventCardProps {
  event: Event;
  opacity?: number;
  onSelect?: () => void;
}

export function EventCard({ event, opacity = 1, onSelect }: EventCardProps) {
  const { icon } = event.theme;
  const visibilityColor = getVisibilityColor(event.visibility);
  const cardShadow =
    event.visibility === 'public'
      ? '0 0 0 1px rgba(34,197,94,0.4), 0 0 12px rgba(34,197,94,0.6)'
      : event.visibility === 'friends'
        ? '0 0 0 1px rgba(59,130,246,0.4), 0 0 10px rgba(59,130,246,0.5)'
        : '0 0 0 1px rgba(156,163,175,0.5), 0 0 8px rgba(156,163,175,0.5)';

  return (
    <div
      className="min-w-[130px] w-[130px] sm:min-w-[150px] sm:w-[150px] bg-card/95 backdrop-blur-sm rounded-lg overflow-hidden transition-all cursor-pointer flex-shrink-0 border-2"
      style={{ opacity, borderColor: visibilityColor, boxShadow: cardShadow }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(eventKey) => {
        if (eventKey.key === 'Enter' || eventKey.key === ' ') {
          onSelect?.();
        }
      }}
    >
      <div className="relative h-14 sm:h-16">
        <img src={event.image} alt={event.name} className="w-full h-full object-cover" />
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white text-[10px] flex items-center gap-1"
          style={{ backgroundColor: visibilityColor }}
        >
          <span className="text-[10px]">{icon}</span>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1">
          <span>👥</span>
          <span key={`attendees-${event.id}-${event.attendees}`}>{event.attendees || 0}/{event.maxAttendees || '∞'}</span>
        </div>
      </div>
      <div className="p-2">
        <h3 className="text-[13px] font-semibold text-foreground mb-0.5 line-clamp-1">
          {event.name}
        </h3>
        <p className="text-[10px] text-muted-foreground mb-2 line-clamp-1">
          {event.location} · {event.date}
        </p>
        <EventChips event={event} variant="card" />
      </div>
    </div>
  );
}
