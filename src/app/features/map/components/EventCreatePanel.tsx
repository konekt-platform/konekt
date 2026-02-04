import { useState, useEffect, useRef } from "react";
import { X, MapPin, Map as MapIcon, Loader2, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEventRequest } from "../../../services/api/events";
import { Event, EventType } from "../../../types";
import { getEventTheme } from "../../../config/event-categories";
import { useAuth } from "../../../contexts/AuthContext";

// Cache simples em memória para evitar requisições repetidas
const addressCache = new Map<string, string>();

// Função para criar chave de cache (arredonda para ~10m de precisão)
function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// Função para formatar endereço estilo Uber (rua, número e bairro ou nome do local)
function formatAddressUberStyle(data: any): string {
  const addr = data.address || {};

  // Tenta pegar nome do local primeiro (mais importante)
  if (data.name && data.name !== addr.road && data.name !== addr.house_number) {
    return data.name;
  }

  // Monta endereço: rua + número + bairro
  const parts: string[] = [];

  if (addr.road) {
    parts.push(addr.road);
  }

  if (addr.house_number) {
    parts.push(addr.house_number);
  }

  if (addr.suburb || addr.neighbourhood || addr.quarter) {
    parts.push(addr.suburb || addr.neighbourhood || addr.quarter);
  }

  if (parts.length > 0) {
    return parts.join(", ");
  }

  // Fallback: usa display_name se não conseguir montar
  return data.display_name || "";
}

// Reverse geocoding otimizado usando Nominatim (OpenStreetMap)
async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const cacheKey = getCacheKey(lat, lng);

  // Verifica cache primeiro
  if (addressCache.has(cacheKey)) {
    return addressCache.get(cacheKey) || null;
  }

  try {
    // Usa parâmetros otimizados: zoom=18 para resposta mais rápida, sem detalhes extras
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Timeout de 3 segundos

    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "konekt-prototipo/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();

    if (data) {
      const address = formatAddressUberStyle(data);
      if (address) {
        // Salva no cache
        addressCache.set(cacheKey, address);
        return address;
      }
    }
    return null;
  } catch (error) {
    // Ignora erros de abort/timeout silenciosamente
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    return null;
  }
}

type AddressSuggestion = {
  displayName: string;
  lat: number;
  lon: number;
};

async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&addressdetails=1&limit=5`;
  const res = await fetch(url, {
    signal,
    headers: {
      "User-Agent": "konekt-prototipo/1.0",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    name?: string;
    address?: any;
  }>;
  return data
    .map((item) => {
      // Formata o endereço no estilo Uber
      const formatted = formatAddressUberStyle(item);
      return {
        displayName: formatted || item.display_name,
        lat: Number(item.lat),
        lon: Number(item.lon),
      };
    })
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
}

interface EventCreatePanelProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  selectedPosition?: [number, number] | null;
  onFocusMapForSelection?: () => void;
  onShowAddressOnMap?: (address: string, position?: [number, number]) => void;
  onEventCreated?: (event: Event) => void;
  onLocationConfirmed?: (address: string, position: [number, number]) => void;
  userPosition?: [number, number] | null;
}

type LocationMode = "map" | "address" | null;

export function EventCreatePanel({
  isOpen,
  isCollapsed,
  onClose,
  onMapClick,
  selectedPosition,
  onFocusMapForSelection,
  onShowAddressOnMap,
  onEventCreated,
  onLocationConfirmed,
  userPosition,
}: EventCreatePanelProps) {
  const { user: authUser } = useAuth();
  const [locationMode, setLocationMode] = useState<LocationMode>("address");
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventVisibility, setEventVisibility] = useState<
    "public" | "friends" | "invite-only"
  >("public");
  const [maxAttendees, setMaxAttendees] = useState(20);
  const [eventType, setEventType] = useState<EventType>("estudo");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<
    AddressSuggestion[]
  >([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [selectedAddressPosition, setSelectedAddressPosition] = useState<
    [number, number] | null
  >(null);
  const [pendingAddressConfirmation, setPendingAddressConfirmation] =
    useState<AddressSuggestion | null>(null);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const addressAbortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) {
      setLocationMode("address");
      // Reset form
      setEventName("");
      setEventLocation("");
      setEventStart("");
      setEventEnd("");
      setEventDescription("");
      setEventVisibility("public");
      setMaxAttendees(20);
      setEventType("estudo");
      setSelectedLabels([]);
      setIsResolvingAddress(false);
      setAddressSuggestions([]);
      setAddressLoading(false);
      setSelectedAddressPosition(null);
      setPendingAddressConfirmation(null);
      setIsSearchingAddress(false);
      // Cancela requisição pendente se houver
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (addressAbortRef.current) {
        addressAbortRef.current.abort();
        addressAbortRef.current = null;
      }
    }
  }, [isOpen]);

  // Pre-fill user location address on open (one-off)
  useEffect(() => {
    if (isOpen && userPosition && !eventLocation && !selectedPosition && locationMode === "address") {
      const [lat, lng] = userPosition;
      
      const controller = new AbortController();
      // Only set if not already resolving
      if (!addressAbortRef.current) {
         addressAbortRef.current = controller;
         setIsResolvingAddress(true);
         setEventLocation("📍 Buscando sua localização...");
         
         reverseGeocode(lat, lng, controller.signal)
          .then((address) => {
            if (!controller.signal.aborted) {
               setEventLocation(address || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
               setIsResolvingAddress(false);
            }
          })
          .catch(() => {
             if (!controller.signal.aborted) {
               setIsResolvingAddress(false);
               setEventLocation("Minha localização atual"); 
             }
          })
          .finally(() => {
            if (addressAbortRef.current === controller) {
              addressAbortRef.current = null;
            }
          });
      }
    }
  }, [isOpen]); // Only run when isOpen changes, not when userPosition updates (to avoid loop)

  // Quando a localização é confirmada no mapa (quando selectedPosition muda e não estamos no modo mapa), atualiza o endereço
  useEffect(() => {
    // Só atualiza se não estiver no modo mapa (para evitar conflito com o outro useEffect)
    if (!selectedPosition || locationMode === "map") return;

    const [lat, lng] = selectedPosition;

    // Cancela requisição anterior se houver
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Cria novo controller para esta requisição
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Verifica cache primeiro (síncrono, instantâneo)
    const cacheKey = getCacheKey(lat, lng);
    if (addressCache.has(cacheKey)) {
      const cachedAddress = addressCache.get(cacheKey);
      if (cachedAddress) {
        setEventLocation(cachedAddress);
        setSelectedAddressPosition([lat, lng]);
        if (onLocationConfirmed) {
          onLocationConfirmed(cachedAddress, [lat, lng]);
        }
        abortControllerRef.current = null;
        return;
      }
    }

    // Faz requisição assíncrona
    reverseGeocode(lat, lng, controller.signal)
      .then((address) => {
        // Só atualiza se não foi cancelado
        if (!controller.signal.aborted) {
          const finalAddress =
            address || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
          setEventLocation(finalAddress);
          setSelectedAddressPosition([lat, lng]);
          if (onLocationConfirmed) {
            onLocationConfirmed(finalAddress, [lat, lng]);
          }
        }
      })
      .catch(() => {
        // Ignora erros de abort
        if (!controller.signal.aborted) {
          const fallbackAddress = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
          setEventLocation(fallbackAddress);
          setSelectedAddressPosition([lat, lng]);
          if (onLocationConfirmed) {
            onLocationConfirmed(fallbackAddress, [lat, lng]);
          }
        }
      })
      .finally(() => {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      });
  }, [selectedPosition, locationMode, onLocationConfirmed]);

  // Quando o usuário escolhe um ponto no mapa, tenta resolver o endereço automaticamente
  useEffect(() => {
    if (!isOpen || locationMode !== "map") return;

    if (!selectedPosition) {
      setEventLocation("");
      setIsResolvingAddress(false);
      // Cancela requisição anterior
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    const [lat, lng] = selectedPosition;

    // Cancela requisição anterior se houver
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Cria novo controller para esta requisição
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Mostra loading imediatamente
    setIsResolvingAddress(true);
    setEventLocation("Buscando endereço...");

    // Verifica cache primeiro (síncrono, instantâneo)
    const cacheKey = getCacheKey(lat, lng);
    if (addressCache.has(cacheKey)) {
      const cachedAddress = addressCache.get(cacheKey);
      if (cachedAddress) {
        setEventLocation(cachedAddress);
        setIsResolvingAddress(false);
        abortControllerRef.current = null;
        return;
      }
    }

    // Faz requisição assíncrona
    reverseGeocode(lat, lng, controller.signal)
      .then((address) => {
        // Só atualiza se não foi cancelado
        if (!controller.signal.aborted) {
          if (address) {
            setEventLocation(address);
          } else {
            setEventLocation(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
          }
          setIsResolvingAddress(false);
        }
      })
      .catch(() => {
        // Ignora erros de abort
        if (!controller.signal.aborted) {
          setEventLocation(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
          setIsResolvingAddress(false);
        }
      })
      .finally(() => {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      });
  }, [isOpen, locationMode, selectedPosition]);

  // Busca endereço quando o usuário pressiona Enter
  const handleAddressKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const query = eventLocation.trim();
    if (query.length < 3) {
      setError("Digite pelo menos 3 caracteres para buscar");
      return;
    }

    setIsSearchingAddress(true);
    setAddressSuggestions([]);
    setPendingAddressConfirmation(null);

    try {
      const results = await searchAddress(query);
      if (results.length === 0) {
        setError("Nenhum endereço encontrado. Tente outro termo de busca.");
        setIsSearchingAddress(false);
        return;
      }

      // Pega o primeiro resultado e mostra no mapa para confirmação
      const firstResult = results[0];
      setPendingAddressConfirmation(firstResult);

      // Mostra no mapa
      if (onShowAddressOnMap) {
        onShowAddressOnMap(firstResult.displayName, [
          firstResult.lat,
          firstResult.lon,
        ]);
      }

      setIsSearchingAddress(false);
    } catch (error) {
      setError("Erro ao buscar endereço. Tente novamente.");
      setIsSearchingAddress(false);
    }
  };

  // Confirma o endereço pendente
  const confirmAddress = () => {
    if (!pendingAddressConfirmation) return;

    setEventLocation(pendingAddressConfirmation.displayName);
    setSelectedAddressPosition([
      pendingAddressConfirmation.lat,
      pendingAddressConfirmation.lon,
    ]);
    setPendingAddressConfirmation(null);
    setAddressSuggestions([]);
  };

  // Cancela a confirmação pendente
  const cancelAddressConfirmation = () => {
    setPendingAddressConfirmation(null);
    setAddressSuggestions([]);
  };

  // Autocomplete enquanto digita (opcional, para melhor UX)
  useEffect(() => {
    if (!isOpen || locationMode !== "address") return;
    if (pendingAddressConfirmation) return; // Não busca se há confirmação pendente

    const query = eventLocation.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    if (addressAbortRef.current) {
      addressAbortRef.current.abort();
    }
    const controller = new AbortController();
    addressAbortRef.current = controller;
    setAddressLoading(true);

    const handle = setTimeout(() => {
      searchAddress(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted && !pendingAddressConfirmation) {
            setAddressSuggestions(results);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setAddressSuggestions([]);
          }
        })
        .finally(() => {
          if (addressAbortRef.current === controller) {
            setAddressLoading(false);
            addressAbortRef.current = null;
          }
        });
    }, 500);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [eventLocation, isOpen, locationMode, pendingAddressConfirmation]);

  const createEventMutation = useMutation({
    mutationFn: createEventRequest,
    onSuccess: async (createdEvent) => {
      // Invalida e refetch imediatamente
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.refetchQueries({ queryKey: ["events"] });
      // Notifica o componente pai sobre o evento criado
      if (onEventCreated) {
        onEventCreated(createdEvent);
      }
      handleClose();
    },
    onError: (err) => {
      console.error("Erro ao criar evento:", err);
      setError("Erro ao criar evento. Tente novamente.");
    },
  });

  const handleClose = () => {
    setLocationMode("address");
    setError("");
    setPendingAddressConfirmation(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!eventName || !eventLocation || !eventStart || !eventEnd) {
      return;
    }

    // Tenta usar a posição selecionada, senão usa a localização do usuário, senão usa padrão
    let position: [number, number] = userPosition ?? [-7.2159, -35.9108];
    if (locationMode === "map" && selectedPosition) {
      position = selectedPosition;
    } else if (locationMode === "address" && selectedAddressPosition) {
      position = selectedAddressPosition;
    } else {
      // Se não há posição selecionada, tenta usar a localização do usuário
      // Isso será passado via props se necessário
    }

    const startsAt = new Date(eventStart).toISOString();
    const endsAt = new Date(eventEnd).toISOString();
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError("A data de término deve ser após a data de início");
      return;
    }

    const formatTime = (value: string) =>
      new Date(value).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    const timeStr = `${formatTime(eventStart)}–${formatTime(eventEnd)}`;
    const dateStr = new Date(eventStart).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });

    const creatorId = authUser?.id ?? 1;
    const creatorName = authUser?.name || authUser?.username || "Você";
    const creatorAvatar = authUser?.avatar || "";
    const attendeeIds = [creatorId];
    const newEvent: Event = {
      id: Date.now(), // ID temporário
      name: eventName,
      type: eventType,
      location: eventLocation,
      position,
      attendees: attendeeIds.length,
      date: dateStr,
      time: timeStr,
      startsAt,
      endsAt,
      image:
        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400",
      description: eventDescription,
      distanceKm: 0,
      maxAttendees,
      visibility: eventVisibility,
      requiresApproval: eventVisibility === "invite-only",
      isLgbtFriendly: selectedLabels.includes("lgbt-friendly"),
      labels: selectedLabels,
      genderFocus: "all",
      isRecurring: false,
      theme: getEventTheme(eventType),
      creatorId,
      attendeeIds,
      attendeesList: [
        { id: creatorId, name: creatorName, avatar: creatorAvatar },
      ],
    };

    createEventMutation.mutate(newEvent);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[1150] lg:hidden"
          onClick={handleClose}
        />
      )}
      {isOpen && (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center px-4 pt-24 pb-6">
          <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border flex flex-col max-h-[75vh] overflow-hidden">
            <div className="px-4 py-6 border-b border-border bg-gradient-to-br from-background to-card">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h2 className="text-primary">Criar evento</h2>
                  <p className="text-xs text-muted-foreground">
                    {locationMode === "map"
                      ? "Selecione no mapa"
                      : "Digite o endereço e pressione Enter"}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="lg:hidden p-2 hover:bg-accent rounded-full"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Local</label>

                {locationMode === "map" ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                        {!selectedPosition && "Clique no mapa para selecionar"}
                        {selectedPosition &&
                          isResolvingAddress &&
                          "Buscando endereço..."}
                        {selectedPosition &&
                          !isResolvingAddress &&
                          eventLocation &&
                          eventLocation}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLocationMode("address");
                        setPendingAddressConfirmation(null);
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                    >
                      Voltar para digitar endereço
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        value={eventLocation}
                        onChange={(e) => {
                          setEventLocation(e.target.value);
                          setSelectedAddressPosition(null);
                          setPendingAddressConfirmation(null);
                          setError("");
                        }}
                        onKeyDown={handleAddressKeyDown}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm pr-20"
                        placeholder="Digite o endereço e pressione Enter"
                      />
                      {isSearchingAddress && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {addressLoading && !isSearchingAddress && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          Buscando...
                        </div>
                      )}
                      {addressSuggestions.length > 0 &&
                        !pendingAddressConfirmation && (
                          <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background shadow-lg max-h-40 overflow-y-auto">
                            {addressSuggestions.map((suggestion) => (
                              <button
                                key={`${suggestion.lat}-${suggestion.lon}`}
                                type="button"
                                onClick={() => {
                                  setEventLocation(suggestion.displayName);
                                  setSelectedAddressPosition([
                                    suggestion.lat,
                                    suggestion.lon,
                                  ]);
                                  setAddressSuggestions([]);
                                  setPendingAddressConfirmation(null);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-accent"
                              >
                                {suggestion.displayName}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>

                    {/* Mensagem de confirmação pendente */}
                    {pendingAddressConfirmation && (
                      <div className="rounded-lg border-2 border-primary bg-primary/10 p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">
                          Confirme o local encontrado:
                        </p>
                        <p className="text-sm text-foreground">
                          {pendingAddressConfirmation.displayName}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={confirmAddress}
                            className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-colors flex items-center justify-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={cancelAddressConfirmation}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mensagem de erro */}
                    {error && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                        {error}
                      </div>
                    )}

                    {/* Botão para definir no mapa */}
                    <button
                      type="button"
                      onClick={() => {
                        setLocationMode("map");
                        setPendingAddressConfirmation(null);
                        setAddressSuggestions([]);
                        onFocusMapForSelection?.();
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-2"
                    >
                      <MapPin className="w-3 h-3" />
                      Definir local no mapa
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nome</label>
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Nome do evento"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="esportes">Esportes</option>
                  <option value="estudo">Estudo</option>
                  <option value="lazer">Lazer</option>
                  <option value="artes">Artes</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Início
                  </label>
                  <input
                    type="datetime-local"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Fim</label>
                  <input
                    type="datetime-local"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Descrição
                </label>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  className="w-full min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Descreva o evento..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Privacidade
                </label>
                <select
                  value={eventVisibility}
                  onChange={(e) =>
                    setEventVisibility(
                      e.target.value as "public" | "friends" | "invite-only",
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="public">Público</option>
                  <option value="friends">Amigos</option>
                  <option value="invite-only">Somente convite</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Máximo de pessoas (até 20)
                </label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={maxAttendees}
                  onChange={(e) => setMaxAttendees(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "lgbt-friendly", label: "🏳️‍🌈 LGBTQIA+ Friendly" },
                    { id: "newbie-friendly", label: "👋 Iniciantes" },
                    { id: "pet-friendly", label: "🐾 Pet Friendly" },
                  ].map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        setSelectedLabels((prev) =>
                          prev.includes(tag.id)
                            ? prev.filter((id) => id !== tag.id)
                            : [...prev, tag.id],
                        );
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        selectedLabels.includes(tag.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border bg-muted">
              <button
                onClick={handleSubmit}
                disabled={
                  createEventMutation.isPending ||
                  !eventName ||
                  !eventLocation ||
                  !eventStart ||
                  !eventEnd
                }
                className={`w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  createEventMutation.isSuccess ? "bg-green-500" : ""
                }`}
                type="button"
              >
                {createEventMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Criando...</span>
                  </>
                ) : createEventMutation.isSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Criado!</span>
                  </>
                ) : (
                  "Criar evento"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
