import { EventType } from '../types';

export interface CategoryTheme {
  label: string;
  color: string;
  icon: string;
}

export const EVENT_CATEGORIES: Record<EventType, CategoryTheme> = {
  esportes: {
    label: 'Esportes',
    color: '#22c55e',
    icon: '⚽',
  },
  estudo: {
    label: 'Estudo',
    color: '#3b82f6',
    icon: '📚',
  },
  lazer: {
    label: 'Lazer',
    color: '#f97316',
    icon: '🎮',
  },
  artes: {
    label: 'Artes',
    color: '#a855f7',
    icon: '🎨',
  },
};

export const DEFAULT_CATEGORY: CategoryTheme = {
  label: 'Evento',
  color: '#6366f1',
  icon: '📅',
};

export const getEventTheme = (type: EventType): CategoryTheme => {
  return EVENT_CATEGORIES[type] || DEFAULT_CATEGORY;
};
