import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import { Event } from "../../../types";
import { EventMarkerIcon } from "../components/EventMarkerIcon";

export const getPinSize = () => {
  return { size: 44, badge: 18 };
};

export const createCustomIcon = (event: Event) => {
  const { size, badge } = getPinSize();
  const html = renderToStaticMarkup(
    <EventMarkerIcon event={event} size={size} badgeSize={badge} />,
  );

  return L.divIcon({
    html: html,
    className: "custom-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};
