interface EventMapHeaderProps {
  eventsCount: number;
  radiusKm: number;
  capacitySummary?: string;
}

export function EventMapHeader({
  eventsCount,
  radiusKm,
  capacitySummary,
}: EventMapHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-[1000] bg-background/90 backdrop-blur-lg border-b border-border px-4 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-primary">Eventos Perto de Você</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Até {radiusKm} km · {eventsCount} eventos acontecendo agora
      </p>
      {capacitySummary && (
        <p className="text-xs text-muted-foreground mt-1">
          ⚠️ {capacitySummary}
        </p>
      )}
    </div>
  );
}
