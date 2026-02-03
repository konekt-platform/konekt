import { Event } from "../../../types";
import { getVisibilityColor } from "../utils/eventLabels";

interface EventMarkerIconProps {
  event: Event;
  size: number;
  badgeSize: number;
}

export function EventMarkerIcon({
  event,
  size,
  badgeSize,
}: EventMarkerIconProps) {
  const { icon } = event.theme;
  const visibilityColor = getVisibilityColor(event.visibility);
  const glowShadow =
    event.visibility === "public"
      ? "0 0 0 2px rgba(34,197,94,0.4), 0 0 14px rgba(34,197,94,0.8)"
      : event.visibility === "friends"
        ? "0 0 0 2px rgba(59,130,246,0.4), 0 0 12px rgba(59,130,246,0.7)"
        : "0 0 0 2px rgba(156,163,175,0.4), 0 0 10px rgba(156,163,175,0.6)";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div
        style={{
          width: size,
          height: size,
          background: "white",
          borderRadius: "50%",
          boxShadow: `0 4px 12px rgba(0,0,0,0.15), ${glowShadow}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Borda neutra (sem cor de visibilidade) para manter apenas o glow colorido
          border: "3px solid white",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundImage: `url('${event.image}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: -4,
          right: -4,
          width: badgeSize,
          height: badgeSize,
          background: visibilityColor,
          borderRadius: "50%",
          border: "2px solid white",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: badgeSize - 8,
        }}
      >
        {icon}
      </div>
    </div>
  );
}
