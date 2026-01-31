import { Event } from '../../../types';

type AttendanceTone = 'available' | 'almost-full' | 'full';

export const getAttendanceStatus = (event: Event) => {
  if (event.attendees >= event.maxAttendees) {
    return { label: 'Lotado', tone: 'full' as AttendanceTone };
  }

  if (event.attendees >= event.maxAttendees * 0.8) {
    return { label: 'Quase cheio', tone: 'almost-full' as AttendanceTone };
  }

  return { label: 'Vagas disponíveis', tone: 'available' as AttendanceTone };
};

export const getAttendanceToneClasses = (tone: AttendanceTone) => {
  switch (tone) {
    case 'full':
      return 'bg-destructive/10 text-destructive';
    case 'almost-full':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-accent text-accent-foreground';
  }
};

