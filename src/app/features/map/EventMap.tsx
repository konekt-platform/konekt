import React, { useEffect, useRef, useState } from "react";
import { Bell, Plus, Search, X, Check, Navigation } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Tooltip,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGetEvents } from "../../hooks/useGetEvents";
import { useQueryClient } from "@tanstack/react-query";
import { EventPopup } from "./components/EventPopup";
import { EventCardsRail } from "./components/EventCardsRail";
import { EventCreatePanel } from "./components/EventCreatePanel";
import { EventFiltersPanel } from "./components/EventFiltersPanel";
import { NotificationPanel } from "../notifications/NotificationPanel";
import { EventFilters, filterEvents } from "./utils/eventFilters";
import { createCustomIcon } from "./utils/eventPins";
import { findOverlappingEvents } from "./utils/eventOverlap";
import { Event } from "../../types";
import { EventFullCard } from "./components/EventFullCard";
import { useAuth } from "../../contexts/AuthContext";
import { hasEventEnded } from "./utils/eventSchedule";

// Função para formatar endereço estilo Uber
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

// Função para fazer reverse geocoding
async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "konekt-prototipo/1.0",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data) {
      return formatAddressUberStyle(data);
    }
    return null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

// Fix Leaflet's default icon path issues
const icon = new URL(
  "leaflet/dist/images/marker-icon.png",
  import.meta.url,
).toString();
const iconShadow = new URL(
  "leaflet/dist/images/marker-shadow.png",
  import.meta.url,
).toString();

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Componente para capturar cliques no mapa
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (e: L.LeafletMouseEvent) => void;
}) {
  useMapEvents({
    click: onMapClick,
  });
  return null;
}

// Componente para mostrar pin fixo no centro do mapa (estilo iFood/Uber)
function CenterPinMarker() {
  const map = useMap();
  const [center, setCenter] = useState<[number, number]>(() => {
    const mapCenter = map.getCenter();
    return [mapCenter.lat, mapCenter.lng];
  });

  useEffect(() => {
    const updateCenter = () => {
      const mapCenter = map.getCenter();
      setCenter([mapCenter.lat, mapCenter.lng]);
    };

    map.on("move", updateCenter);
    map.on("moveend", updateCenter);
    updateCenter();

    return () => {
      map.off("move", updateCenter);
      map.off("moveend", updateCenter);
    };
  }, [map]);

  return (
    <Marker
      position={center}
      icon={L.divIcon({
        className: "center-pin-marker",
        html: `
          <div style="
            width: 40px;
            height: 40px;
            background: #e4811e;
            border: 3px solid white;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            position: relative;
          ">
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(45deg);
              width: 12px;
              height: 12px;
              background: white;
              border-radius: 50%;
            "></div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      })}
    />
  );
}

interface EventMapProps {
  unreadCount: number;
  initialNotificationsOpen: boolean;
}

export function EventMap({
  unreadCount,
  initialNotificationsOpen,
}: EventMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const queryClient = useQueryClient();
  const { data: events } = useGetEvents();
  const { user: authUser } = useAuth();
  const [userPosition, setUserPosition] = useState<[number, number] | null>(
    null,
  );
  const [locationError, setLocationError] = useState(false);
  const defaultFilters: EventFilters = {
    radiusKm: 10,
    period: "all",
    dayRange: "next_3_days",
    genderFocus: "all",
    visibility: "all",
    eventType: "all",
  };
  const [filters, setFilters] = useState<EventFilters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(
    initialNotificationsOpen,
  );
  const [openPopupEventId, setOpenPopupEventId] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<
    [number, number] | null
  >(null);
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  // Estado para forçar re-render quando eventos mudarem
  const [eventsUpdateKey, setEventsUpdateKey] = useState(0);

  // Força atualização quando eventos mudarem (especialmente attendees)
  useEffect(() => {
    console.log("Events updated");

    if (events) {
      // Cria uma chave baseada na soma de todos os attendees para detectar mudanças
      const attendeesSum = events.reduce(
        (sum, e) => sum + ((e.attendees || 0) * 1000 + e.id),
        0,
      );
      setEventsUpdateKey(attendeesSum);

      // Sincroniza o evento selecionado com os dados mais recentes
      if (selectedEvent) {
        const freshEvent = events.find((e) => e.id === selectedEvent.id);
        if (
          freshEvent &&
          JSON.stringify(freshEvent) !== JSON.stringify(selectedEvent)
        ) {
          setSelectedEvent(freshEvent);
        }
      }
    }
  }, [events, selectedEvent]);

  const hasConnections =
    (authUser?.followingIds?.length ?? 0) +
      (authUser?.followerIds?.length ?? 0) >
    0;
  const visibleEvents = events
    ? hasConnections
      ? events
      : events.filter((event) => event.visibility === "public")
    : [];
  const mapEvents = visibleEvents.filter((event) => {
    if (event.isRecurring) return true;
    return !hasEventEnded(event);
  });
  const filteredEvents = mapEvents.length
    ? filterEvents(mapEvents, filters)
    : [];
  const activePanel = notificationsOpen
    ? "notifications"
    : createOpen
      ? "create"
      : filtersOpen
        ? "filters"
        : "none";
  const isPanelOpen = activePanel !== "none";
  const isPopupOpen = openPopupEventId !== null;

  const closeAllPanels = () => {
    setNotificationsOpen(false);
    setCreateOpen(false);
    setFiltersOpen(false);
  };

  const isFirstLocationRef = useRef(true);

  // Função para centralizar mapa na localização do usuário
  const centerOnUserLocation = () => {
    if (mapRef.current && userPosition) {
      mapRef.current.flyTo(userPosition, 15, { animate: true });
    } else {
      // Se não tiver posição, tenta obter novamente
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const nextPosition: [number, number] = [
              position.coords.latitude,
              position.coords.longitude,
            ];
            setUserPosition(nextPosition);
            setLocationError(false);
            if (mapRef.current) {
              mapRef.current.flyTo(nextPosition, 15, { animate: true });
            }
          },
          (error) => {
            console.error("Erro ao obter localização:", error);
            setLocationError(true);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      }
    }
  };

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      console.error("Geolocalização não disponível no navegador");
      setLocationError(true);
      return;
    }

    let watchId: number | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    const tryGetLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextPosition: [number, number] = [
            position.coords.latitude,
            position.coords.longitude,
          ];
          console.log(
            "✅ Geolocalização obtida com sucesso:",
            nextPosition,
            "Precisão:",
            position.coords.accuracy,
            "m",
          );
          setUserPosition(nextPosition);
          setLocationError(false);
          // Centraliza na primeira vez
          if (isFirstLocationRef.current && mapRef.current) {
            mapRef.current.setView(nextPosition, 15, { animate: false });
            isFirstLocationRef.current = false;
          }
        },
        (error) => {
          console.error("❌ Erro ao obter geolocalização:", {
            code: error.code,
            message: error.message,
            retryCount,
          });

          // Códigos de erro:
          // 1 = PERMISSION_DENIED
          // 2 = POSITION_UNAVAILABLE
          // 3 = TIMEOUT

          if (error.code === 1) {
            console.error("Permissão de localização negada pelo usuário");
          } else if (error.code === 2) {
            console.error("Posição não disponível");
          } else if (error.code === 3) {
            console.error("Timeout ao obter localização");
          }

          // Tenta novamente se não excedeu o limite
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Tentando novamente (${retryCount}/${maxRetries})...`);
            setTimeout(tryGetLocation, 2000);
          } else {
            setLocationError(true);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        },
      );
    };

    // Tenta obter localização
    tryGetLocation();

    // Depois monitora mudanças de posição
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextPosition: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        console.log(
          "📍 Geolocalização atualizada:",
          nextPosition,
          "Precisão:",
          position.coords.accuracy,
          "m",
        );
        setUserPosition(nextPosition);
        setLocationError(false);
      },
      (error) => {
        console.error("❌ Erro ao monitorar geolocalização:", {
          code: error.code,
          message: error.message,
        });
        // Se falhar, mantém última posição conhecida mas marca erro
        setLocationError(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 1000,
      },
    );

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  return (
    <div className="h-full relative">
      {filtersOpen && (
        <EventFiltersPanel
          isOpen={filtersOpen}
          isCollapsed={activePanel !== "filters"}
          filters={filters}
          defaultFilters={defaultFilters}
          onChange={setFilters}
          onReset={() => setFilters(defaultFilters)}
          onClose={closeAllPanels}
        />
      )}
      {createOpen && (
        <EventCreatePanel
          isOpen={createOpen}
          isCollapsed={activePanel !== "create"}
          onClose={closeAllPanels}
          selectedPosition={selectedPosition}
          onMapClick={(lat, lng) => {
            setSelectedPosition([lat, lng]);
            if (mapRef.current) {
              mapRef.current.flyTo([lat, lng], 16, { animate: false });
            }
          }}
          onFocusMapForSelection={() => {
            setSelectingLocation(true);
            setCreateOpen(false);
            const target = selectedPosition ?? [-7.2159, -35.9108];
            mapRef.current?.flyTo(target, 16, { animate: false });
          }}
          onShowAddressOnMap={(address, position) => {
            setSelectionMessage(
              "Centralizando mapa para você conferir o endereço",
            );
            if (position) {
              mapRef.current?.flyTo(position, 5, { animate: false });
            } else {
              // mapRef.current?.flyTo([-7.2159, -35.9108], 15, { animate: true });
            }
            setTimeout(() => setSelectionMessage(null), 2500);
          }}
          onEventCreated={async (createdEvent) => {
            // Fecha o painel de criação
            setCreateOpen(false);
            // Força refetch dos eventos para garantir que o novo evento apareça
            await queryClient.refetchQueries({ queryKey: ["events"] });
            // Centraliza o mapa no evento criado
            if (mapRef.current && createdEvent.position) {
              mapRef.current.flyTo(createdEvent.position, 16, {
                animate: false,
              });
              // Aguarda um pouco para o evento aparecer no mapa antes de tentar abrir o popup
              setTimeout(() => {
                // Tenta encontrar o marker do evento criado e abrir o popup
                const marker = markersRef.current.get(createdEvent.id);
                if (marker) {
                  marker.openPopup();
                  setOpenPopupEventId(createdEvent.id);
                } else {
                  // Se não encontrar o marker, tenta novamente após mais tempo
                  setTimeout(() => {
                    const marker2 = markersRef.current.get(createdEvent.id);
                    if (marker2) {
                      marker2.openPopup();
                      setOpenPopupEventId(createdEvent.id);
                    }
                  }, 1000);
                }
              }, 500);
            }
          }}
          onLocationConfirmed={(address, position) => {
            // Callback será chamado quando a localização for confirmada no mapa
            // O EventCreatePanel já atualiza o campo automaticamente via useEffect
          }}
        />
      )}
      {notificationsOpen && (
        <NotificationPanel
          isOpen={notificationsOpen}
          isCollapsed={activePanel !== "notifications"}
          onClose={closeAllPanels}
        />
      )}

      {/* Map */}
      <div className={`h-full w-full ${isPanelOpen ? "lg:pr-80" : ""}`}>
        <div className="h-full w-full overflow-hidden">
          <MapContainer
            center={[-7.2159, -35.9108]}
            zoom={5}
            zoomControl={false}
            style={{ height: "110%", width: "100%" }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {/* Pin fixo no centro quando está selecionando localização */}
            {selectingLocation && <CenterPinMarker />}

            {/* Marcador da localização do usuário - só mostra se tiver posição válida */}
            {userPosition && !locationError && (
              <CircleMarker
                center={userPosition}
                radius={10}
                pathOptions={{
                  color: "#e4811e",
                  fillColor: "#e4811e",
                  fillOpacity: 0.9,
                  weight: 3,
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -6]}
                  opacity={1}
                  permanent={false}
                >
                  Sua localização
                </Tooltip>
              </CircleMarker>
            )}

            {events?.map((event) => {
              const overlappingEvents = events
                ? findOverlappingEvents(event, events)
                : [event];
              const hasOverlap = overlappingEvents.length > 1;

              return (
                <Marker
                  key={`marker-${event.id}-${event.attendees}-${eventsUpdateKey}`}
                  position={event.position}
                  icon={createCustomIcon(event)}
                  eventHandlers={{
                    add: (e) => {
                      // Registra o marker no mapa quando é adicionado
                      const marker = e.target as L.Marker;
                      markersRef.current.set(event.id, marker);
                    },
                    remove: () => {
                      // Remove o marker do mapa quando é removido
                      markersRef.current.delete(event.id);
                    },
                    popupopen: () => {
                      setOpenPopupEventId(event.id);
                    },
                    popupclose: () => {
                      setOpenPopupEventId(null);
                    },
                  }}
                >
                  <Popup
                    className="custom-popup"
                    maxWidth={240}
                    key={`popup-${event.id}-${event.attendees}`}
                  >
                    <EventPopup
                      event={event}
                      overlappingEvents={
                        hasOverlap ? overlappingEvents : undefined
                      }
                      onNavigate={(targetEvent) => {
                        // Fecha todos os popups primeiro
                        markersRef.current.forEach((marker) => {
                          marker.closePopup();
                        });

                        // Move o mapa para o novo evento se necessário
                        const targetMarker = markersRef.current.get(
                          targetEvent.id,
                        );
                        if (targetMarker) {
                          mapRef.current?.flyTo(
                            targetEvent.position,
                            15,
                            { animate: true },
                          );

                          // Abre o popup do novo evento após um pequeno delay
                          setTimeout(() => {
                            targetMarker.openPopup();
                            setOpenPopupEventId(targetEvent.id);
                          }, 300);
                        }
                      }}
                      onViewMore={(targetEvent) => {
                        // Fecha o popup e abre o card em tela cheia
                        markersRef.current.forEach((marker) => {
                          marker.closePopup();
                        });
                        setOpenPopupEventId(null);
                        setSelectedEvent(targetEvent);
                      }}
                    />
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Overlays de contraste (estilo apps de mobilidade) */}
      <div className="pointer-events-none absolute inset-0 z-[900]">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-background/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      {/* Event Cards Overlay */}
      {!selectedEvent && (
        <EventCardsRail
          key={`cards-rail-${eventsUpdateKey}`}
          events={[...(events ?? [])].sort(
            (a, b) => a.distanceKm - b.distanceKm,
          )}
          onSelectEvent={(event) => {
            // Fecha todos os popups primeiro
            markersRef.current.forEach((marker) => {
              marker.closePopup();
            });

            // Move o mapa para o evento
            mapRef.current?.flyTo(event.position, 15, { animate: true });

            // Abre o popup do evento após um pequeno delay
            setTimeout(() => {
              const marker = markersRef.current.get(event.id);
              if (marker) {
                marker.openPopup();
                setOpenPopupEventId(event.id);
              }
            }, 300);
          }}
        />
      )}

      {/* Fullscreen Event Card */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 px-4 py-6"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <EventFullCard
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              userPosition={userPosition}
            />
          </div>
        </div>
      )}

      {/* Botão de confirmação quando está selecionando localização */}
      {selectingLocation && (
        <div className="fixed bottom-24 left-0 right-0 z-[1400] px-4">
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={() => {
                if (mapRef.current) {
                  const center = mapRef.current.getCenter();
                  const position: [number, number] = [center.lat, center.lng];
                  setSelectedPosition(position);
                  setSelectingLocation(false);
                  setCreateOpen(true);
                  // O EventCreatePanel vai detectar a mudança em selectedPosition e fazer o reverse geocoding automaticamente
                }
              }}
              className="w-full bg-primary text-primary-foreground py-3 px-6 rounded-xl font-semibold text-base shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Confirmar localização
            </button>
          </div>
        </div>
      )}

      {/* Mensagem de seleção */}
      {selectingLocation && (
        <div className="fixed top-20 left-0 right-0 z-[1400] px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-background/95 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-lg">
              <p className="text-sm text-foreground text-center font-medium">
                Mova o mapa para escolher o local do evento
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-4 left-0 right-0 z-[1300] px-4">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen((prev) => !prev);
              setCreateOpen(false);
              setFiltersOpen(false);
            }}
            className={`relative flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur transition-all ${
              notificationsOpen
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background/90 text-foreground hover:bg-accent"
            }`}
          >
            <Bell className="h-5 w-5" />
            <span>Notificações</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const willOpen = !createOpen;
              setCreateOpen(willOpen);
              setFiltersOpen(false);
              setNotificationsOpen(false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lg"
          >
            <Plus className="h-6 w-6" />
            <span>Criar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFiltersOpen((prev) => !prev);
              setCreateOpen(false);
              setNotificationsOpen(false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur"
          >
            <Search className="h-5 w-5" />
            <span>Filtros</span>
          </button>
        </div>
      </div>

      {/* Mensagem de ajuda para seleção no mapa */}
      {selectionMessage && (
        <div className="pointer-events-none fixed top-4 left-1/2 z-[1400] -translate-x-1/2">
          <div className="rounded-full bg-black/80 px-4 py-2 text-xs font-medium text-white shadow-lg">
            {selectionMessage}
          </div>
        </div>
      )}

      {/* Botão flutuante para centralizar na localização do usuário */}
      <button
        type="button"
        onClick={centerOnUserLocation}
        className={`fixed bottom-24 right-4 z-[1300] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
          locationError
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
        title={
          locationError
            ? "Erro na localização"
            : "Centralizar na minha localização"
        }
      >
        <Navigation className="h-5 w-5" />
      </button>
    </div>
  );
}
