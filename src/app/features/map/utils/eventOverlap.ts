import { Event } from "../../../types";

/**
 * Calcula a distância em metros entre duas coordenadas usando a fórmula de Haversine
 */
function getDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Agrupa eventos que estão no mesmo local (dentro de 50 metros de distância)
 */
export function groupOverlappingEvents(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  const processed = new Set<number>();

  events.forEach((event) => {
    if (processed.has(event.id)) {
      return;
    }

    const groupKey = `${event.position[0]}-${event.position[1]}`;
    const overlapping: Event[] = [event];
    processed.add(event.id);

    // Procura eventos próximos (dentro de 50 metros)
    events.forEach((otherEvent) => {
      if (processed.has(otherEvent.id)) {
        return;
      }

      const distance = getDistanceInMeters(
        event.position[0],
        event.position[1],
        otherEvent.position[0],
        otherEvent.position[1],
      );

      if (distance < 50) {
        // 50 metros de tolerância
        overlapping.push(otherEvent);
        processed.add(otherEvent.id);
      }
    });

    if (overlapping.length > 1) {
      groups.set(groupKey, overlapping);
    }
  });

  return groups;
}

/**
 * Encontra eventos sobrepostos para um evento específico
 */
export function findOverlappingEvents(
  event: Event,
  allEvents: Event[],
): Event[] {
  const overlapping: Event[] = [event];

  allEvents.forEach((otherEvent) => {
    if (otherEvent.id === event.id) {
      return;
    }

    const distance = getDistanceInMeters(
      event.position[0],
      event.position[1],
      otherEvent.position[0],
      otherEvent.position[1],
    );

    if (distance < 50) {
      // 50 metros de tolerância
      overlapping.push(otherEvent);
    }
  });

  // Ordena por id para garantir uma ordem consistente independente
  // de qual evento foi clicado primeiro. Assim o índice atual funciona
  // corretamente para anterior/próximo.
  return overlapping.sort((a, b) => a.id - b.id);
}
