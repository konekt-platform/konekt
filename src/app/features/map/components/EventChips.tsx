import { Event } from "../../../types";
import { getGenderFocusLabel, getVisibilityLabel } from "../utils/eventLabels";

interface EventChipsProps {
  event: Event;
  variant: "card" | "popup";
}

export function EventChips({ event, variant }: EventChipsProps) {
  const chips: string[] = [];

  chips.push(`${event.distanceKm} km`);
  if (event.genderFocus === "women") {
    chips.push(getGenderFocusLabel(event.genderFocus));
  }
  if (event.isLgbtFriendly) {
    chips.push("LGBTQIA+ friendly");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}
