import { X } from "lucide-react";
import { EventFilters } from "../utils/eventFilters";
import { EventFiltersBar } from "./EventFiltersBar";

interface EventFiltersPanelProps {
  isOpen: boolean;
  isCollapsed: boolean;
  filters: EventFilters;
  defaultFilters: EventFilters;
  onChange: (filters: EventFilters) => void;
  onReset: () => void;
  onClose: () => void;
}

export function EventFiltersPanel({
  isOpen,
  isCollapsed,
  filters,
  defaultFilters,
  onChange,
  onReset,
  onClose,
}: EventFiltersPanelProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[1150] lg:hidden"
          onClick={onClose}
        />
      )}

      <div className="fixed inset-0 z-[1200] flex items-start justify-center px-4 pt-24 pb-6">
        <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border flex flex-col max-h-[75vh] overflow-hidden">
          <div className="px-4 py-6 border-b border-border bg-gradient-to-br from-background to-card">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h2 className="text-primary">Filtros</h2>
                <p className="text-xs text-muted-foreground">
                  Ajuste a busca dos eventos
                </p>
              </div>
              <button
                onClick={onClose}
                className="lg:hidden p-2 hover:bg-accent rounded-full"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <EventFiltersBar
              filters={filters}
              defaultFilters={defaultFilters}
              onChange={onChange}
              onReset={onReset}
            />
          </div>
        </div>
      </div>
    </>
  );
}
