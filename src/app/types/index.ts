export type EventType = "esportes" | "estudo" | "lazer" | "artes";

// Raw event data from API
export interface ApiEvent {
  id: number;
  name: string;
  type: EventType;
  location: string;
  position: [number, number];
  attendees: number;
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  image: string;
  description: string;
  labels?: string[];
}

// Enriched event object for View
export interface Event extends ApiEvent {
  theme: {
    label: string;
    color: string;
    icon: string;
  };
  distanceKm: number;
  maxAttendees: number;
  visibility: "public" | "friends" | "invite-only";
  requiresApproval: boolean;
  isLgbtFriendly: boolean;
  genderFocus: "all" | "women" | "men" | "lgbt";
  isRecurring: boolean;
  attendeeIds?: number[];
  pendingRequestIds?: number[];
  creatorId?: number;
  attendeesList?: { id: number; name: string; avatar: string }[];
  userStatus?: "attending" | "pending";
  cancelled?: boolean;
}

export interface PrivacySettings {
  profilePublic: boolean;
  showEmail: boolean;
  showBirthDate: boolean;
  showFollowers: boolean;
}

// User interface definition
export interface User {
  id: number;
  username: string;
  name: string;
  avatar: string;
  city?: string;
  bio?: string;
  birthDate?: string;
  email?: string;
  followers?: number;
  following?: number;
  followerIds?: number[];
  followingIds?: number[];
  privacy?: PrivacySettings;
}

export interface Post {
  id: number;
  event: {
    name: string;
    location: string;
    date: string;
  };
  image: string;
  images?: string[];
  attendees: {
    name: string;
    avatar: string;
  }[];
  totalAttendees: number;
  likes: number;
  comments: number;
  likedByIds?: number[];
  commentsList?: {
    id: number;
    userId: number;
    username: string;
    text: string;
    createdAt: string;
  }[];
  timeAgo: string;
  caption?: string;
  // Autor do post (undefined = post oficial do evento)
  author?: {
    id: number;
    username: string;
    name: string;
    avatar: string;
  };
  // Indica se é post oficial do evento ou post de usuário
  isEventPost?: boolean;
}

export type NotificationType = "comment" | "connection" | "event" | "reminder";

export interface Notification {
  id: number;
  type: NotificationType;
  user?: string;
  avatar?: string;
  userId?: number; // ID do usuário relacionado (para notificações de conexão)
  message: string;
  time: string;
  unread: boolean;
  theme?: {
    icon: React.ReactNode;
    colorClass: string;
  };
}

export type View = "feed" | "map" | "profile" | "search";
