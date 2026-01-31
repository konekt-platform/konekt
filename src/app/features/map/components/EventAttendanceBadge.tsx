import { Event } from '../../../types';
import { getAttendanceStatus, getAttendanceToneClasses } from '../utils/eventAttendance';

interface EventAttendanceBadgeProps {
  event: Event;
}

export function EventAttendanceBadge({ event }: EventAttendanceBadgeProps) {
  const status = getAttendanceStatus(event);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${getAttendanceToneClasses(
        status.tone,
      )}`}
    >
      {status.label}
    </span>
  );
}

