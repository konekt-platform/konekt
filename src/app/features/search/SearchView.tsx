import { useState, useEffect, useMemo } from "react";
import {
  Search,
  X,
  Calendar,
  Users,
  Filter,
  ChevronLeft,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { Event, User, EventType } from "../../types";
import {
  searchRequest,
  getSearchHistoryRequest,
  SearchHistoryEntry,
  SearchFilters,
} from "../../services/api/search";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { EventCard } from "../map/components/EventCard";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "../../components/ui/avatar";

interface SearchViewProps {
  onBack: () => void;
  onNavigateToProfile?: (userId: number) => void;
  onNavigateToEvent?: (eventId: number) => void;
}

export function SearchView({
  onBack,
  onNavigateToProfile,
  onNavigateToEvent,
}: SearchViewProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "events" | "users">(
    "all",
  );
  const [results, setResults] = useState<{ events: Event[]; users: User[] }>({
    events: [],
    users: [],
  });
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Carregar histórico de buscas
  useEffect(() => {
    getSearchHistoryRequest()
      .then(setSearchHistory)
      .catch(() => {
        // ignore errors
      });
  }, []);

  // Busca com debounce
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!query.trim()) {
      setResults({ events: [], users: [] });
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      searchRequest(query, searchType === "all" ? "all" : searchType, filters)
        .then(setResults)
        .catch(() => {
          setResults({ events: [], users: [] });
        })
        .finally(() => setLoading(false));
    }, 300);

    setDebounceTimer(timer);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [query, searchType, filters]);

  const handleSearchFromHistory = (historyEntry: SearchHistoryEntry) => {
    setQuery(historyEntry.query);
    setSearchType(
      historyEntry.type === "events"
        ? "events"
        : historyEntry.type === "users"
          ? "users"
          : "all",
    );
  };

  const eventTypes: EventType[] = ["esportes", "estudo", "lazer", "artes"];

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-lg">
        <div className="flex items-center gap-2 p-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-2 hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar eventos, usuários..."
              className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`rounded-lg p-2 transition-colors ${
              filtersOpen || Object.keys(filters).length > 0
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        {filtersOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Tipo de evento
              </label>
              <select
                value={filters.eventType || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    eventType: e.target.value || undefined,
                  })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Data inicial
                </label>
                <input
                  type="date"
                  value={filters.dateFrom || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      dateFrom: e.target.value || undefined,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Data final
                </label>
                <input
                  type="date"
                  value={filters.dateTo || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      dateTo: e.target.value || undefined,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs
          value={searchType}
          onValueChange={(v) => setSearchType(v as "all" | "events" | "users")}
        >
          <TabsList className="w-full rounded-none border-b border-border bg-transparent">
            <TabsTrigger value="all" className="flex-1">
              Tudo
            </TabsTrigger>
            <TabsTrigger value="events" className="flex-1">
              Eventos
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-1">
              Usuários
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto">
        {!query && searchHistory.length > 0 && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Buscas recentes
              </h3>
            </div>
            <div className="space-y-2">
              {searchHistory.map((entry, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSearchFromHistory(entry)}
                  className="w-full text-left p-2 rounded-lg hover:bg-accent transition-colors"
                >
                  <p className="text-sm text-foreground">{entry.query}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.type === "all"
                      ? "Tudo"
                      : entry.type === "events"
                        ? "Eventos"
                        : "Usuários"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {query && loading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Buscando...</p>
          </div>
        )}

        {query && !loading && (
          <>
            {(searchType === "all" || searchType === "events") && (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Eventos ({results.events.length})
                </h3>
                {results.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum evento encontrado
                  </p>
                ) : (
                  <div className="space-y-3">
                    {results.events.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onNavigateToEvent?.(Number(event.id))}
                        className="w-full text-left"
                      >
                        <EventCard event={event} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(searchType === "all" || searchType === "users") && (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Usuários ({results.users.length})
                </h3>
                {results.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum usuário encontrado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {results.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => onNavigateToProfile?.(Number(user.id))}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback>
                            <UserIcon className="w-6 h-6" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-foreground">
                            {user.name || user.username}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            @{user.username}
                          </p>
                          {user.bio && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {user.bio}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
