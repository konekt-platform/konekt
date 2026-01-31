import { EventDayFilter, EventFilters, EventGenderFilter, EventTypeFilter } from '../utils/eventFilters';
import { EventType } from '../../../types';

interface EventFiltersBarProps {
  filters: EventFilters;
  defaultFilters: EventFilters;
  onChange: (filters: EventFilters) => void;
  onReset: () => void;
}

const distanceOptions = [3, 5, 8, 10, 15];

const genderLabels: Record<EventGenderFilter, string> = {
  all: 'Para todos',
  women: 'Para mulheres',
  lgbt: 'LGBTQIA+ friendly',
  men: 'Para homens',
};

const dayLabels: Record<EventDayFilter, string> = {
  all: 'Qualquer dia',
  today: 'Hoje',
  tomorrow: 'Amanhã',
  next_3_days: 'Próximos 3 dias',
  this_week: 'Nesta semana',
  next_week: 'Próxima semana',
};

const typeLabels: Record<EventTypeFilter, string> = {
  all: 'Todos os tipos',
  esportes: 'Esportes',
  estudo: 'Estudo',
  lazer: 'Lazer',
  artes: 'Artes',
};

const visibilityLabels: Record<'all' | 'public' | 'friends' | 'invite-only', string> = {
  all: 'Todas as visibilidades',
  public: 'Público',
  friends: 'Para amigos',
  'invite-only': 'Apenas convite',
};

export function EventFiltersBar({ filters, defaultFilters, onChange, onReset }: EventFiltersBarProps) {
  const update = (partial: Partial<EventFilters>) => {
    onChange({ ...filters, ...partial });
  };

  const activeChips = [
    filters.radiusKm !== defaultFilters.radiusKm ? `Até ${filters.radiusKm} km` : null,
    filters.dayRange !== defaultFilters.dayRange ? dayLabels[filters.dayRange] : null,
    filters.genderFocus !== defaultFilters.genderFocus ? genderLabels[filters.genderFocus] : null,
    filters.eventType !== defaultFilters.eventType ? typeLabels[filters.eventType] : null,
    filters.visibility !== defaultFilters.visibility ? visibilityLabels[filters.visibility] : null,
  ].filter(Boolean) as string[];

  return (
    <div className="bg-card/95 backdrop-blur-lg border border-border rounded-2xl px-3 py-2 shadow-sm">
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {activeChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {chip}
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] text-primary hover:opacity-80"
          >
            Limpar filtros
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
          <select
            value={filters.radiusKm}
            onChange={(event) => update({ radiusKm: Number(event.target.value) })}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
          >
            {distanceOptions.map((distance) => (
              <option key={distance} value={distance}>
                Até {distance} km
              </option>
            ))}
          </select>

        <select
          value={filters.dayRange}
          onChange={(event) => update({ dayRange: event.target.value as EventDayFilter })}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
        >
          <option value="all">Qualquer dia</option>
          <option value="today">Hoje</option>
          <option value="tomorrow">Amanhã</option>
          <option value="next_3_days">Próximos 3 dias</option>
          <option value="this_week">Nesta semana</option>
          <option value="next_week">Próxima semana</option>
        </select>

        <select
          value={filters.genderFocus}
          onChange={(event) => update({ genderFocus: event.target.value as EventGenderFilter })}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
        >
          <option value="all">Para todos</option>
          <option value="women">Para mulheres</option>
          <option value="lgbt">LGBTQIA+ friendly</option>
        </select>

        <select
          value={filters.eventType}
          onChange={(event) => update({ eventType: event.target.value as EventTypeFilter })}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
        >
          <option value="all">Todos os tipos</option>
          <option value="esportes">Esportes</option>
          <option value="estudo">Estudo</option>
          <option value="lazer">Lazer</option>
          <option value="artes">Artes</option>
        </select>

        <select
          value={filters.visibility}
          onChange={(event) => update({ visibility: event.target.value as 'all' | 'public' | 'friends' | 'invite-only' })}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
        >
          <option value="all">Todas as visibilidades</option>
          <option value="public">Público</option>
          <option value="friends">Para amigos</option>
          <option value="invite-only">Apenas convite</option>
        </select>
      </div>
    </div>
  );
}

