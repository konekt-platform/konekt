import { useState, useMemo, useEffect, useCallback } from "react";
import {
  User as UserIcon,
  Plus,
  X,
  Check,
  Loader2,
  LogOut,
  Edit,
  Heart,
  MessageCircle,
  Share2,
  Users,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  UserPlus,
  Ban,
  UserCheck,
  Lock,
  LogOut as LogOutIcon,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { useGetEvents } from "../../hooks/useGetEvents";
import { useGetPosts } from "../../hooks/useGetPosts";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Event, Post, User } from "../../types";
import { createPostRequest } from "../../services/api/posts";
import {
  formatEventTimeRange,
  isEventActive,
  hasEventStarted,
  hasEventEnded,
} from "../map/utils/eventSchedule";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { ShareDialog } from "../../components/ShareDialog";
import {
  getFavoritesRequest,
  searchUsersRequest,
  toggleFollowRequest,
  updateFavoritesRequest,
  updateMeRequest,
  getPrivacySettingsRequest,
  updatePrivacySettingsRequest,
  blockUserRequest,
  unblockUserRequest,
  getFriendsRequest,
} from "../../services/api/users";
import { PrivacySettings } from "../../types";
import { API_URL, getAuthHeaders } from "../../services/api/client";
import { EventFullCard } from "../map/components/EventFullCard";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "../../components/ui/avatar";

interface Photo {
  id: string;
  url: string;
  eventId: number;
  owner: "me" | "other";
  status: "posted" | "pending";
  allowReuse?: boolean;
}

const EventRow = ({
  event,
  onSelect,
}: {
  event: Event;
  onSelect: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent transition-colors"
    >
      <img
        src={event.image}
        alt={event.name}
        className="h-12 w-12 rounded-lg object-cover"
      />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground line-clamp-1">
          {event.name}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {event.location} · {event.date}
        </p>
      </div>
      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
        {event.attendees}/{event.maxAttendees}
      </span>
    </button>
  );
};

interface ProfileViewProps {
  viewingUserId?: number | null;
  onBack?: () => void;
}

export function ProfileView({
  viewingUserId = null,
  onBack,
}: ProfileViewProps) {
  const { data: events } = useGetEvents();
  const {
    user: authUser,
    logout,
    logoutAll,
    changePassword,
    updateUser,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [userName, setUserName] = useState(authUser?.name || "Seu Perfil");
  const [userAvatar, setUserAvatar] = useState<string | null>(
    authUser?.avatar || null,
  );
  const [userBio, setUserBio] = useState(authUser?.bio || "");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendsSearchOpen, setFriendsSearchOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [draftName, setDraftName] = useState(userName);
  const [draftAvatar, setDraftAvatar] = useState(userAvatar ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [draftBio, setDraftBio] = useState(userBio);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    profilePublic: true,
    showEmail: false,
    showBirthDate: true,
    showFollowers: true,
  });
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const timeRange = selectedEvent ? formatEventTimeRange(selectedEvent) : "";
  const canPostMedia = selectedEvent ? isEventActive(selectedEvent) : false;

  // Estados para criar post
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [postEventId, setPostEventId] = useState<number | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const [showMoreEvents, setShowMoreEvents] = useState(false);
  const [ownedPhotos, setOwnedPhotos] = useState<Photo[]>([]);
  const [postCaption, setPostCaption] = useState("");
  const MAX_POST_MEDIA = 5;
  const [photoLimitMessage, setPhotoLimitMessage] = useState("");

  // Eventos favoritados (X) - apenas eventos que o usuário quer deixar no perfil
  const [favoriteEventIds, setFavoriteEventIds] = useState<Set<number>>(
    new Set(),
  );
  const favoriteKey = authUser
    ? `konekt_favorite_events_${authUser.id}`
    : "konekt_favorite_events";
  const [hiddenPastEventIds, setHiddenPastEventIds] = useState<Set<number>>(
    new Set(),
  );
  const hiddenPastKey = authUser
    ? `konekt_past_hidden_${authUser.id}`
    : "konekt_past_hidden";

  // Estado para modal de detalhes do post
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<
    Array<{ id: number; user: string; text: string; time: string }>
  >([]);
  const [shareOpen, setShareOpen] = useState(false);
  const POSTS_PAGE_SIZE = 6;
  const [visiblePostsCount, setVisiblePostsCount] = useState(POSTS_PAGE_SIZE);

  // Quando um post é selecionado, inicializa os estados
  useEffect(() => {
    if (selectedPost) {
      setIsLiked(false);
      setLikesCount(selectedPost.likes);
      setShowComments(false);
      setCommentText("");
      setComments([]);
      setCurrentImageIndex(0);
    }
  }, [selectedPost]);

  const isViewingOtherProfile =
    viewingUserId !== null && viewingUserId !== authUser?.id;

  // Carrega configurações de privacidade
  useEffect(() => {
    if (authUser && !isViewingOtherProfile) {
      getPrivacySettingsRequest()
        .then(setPrivacySettings)
        .catch(() => {
          // Usa valores padrão se falhar
        });
    }
  }, [authUser, isViewingOtherProfile]);

  // Carrega perfil de outro usuário se viewingUserId estiver definido
  useEffect(() => {
    if (viewingUserId && viewingUserId !== authUser?.id) {
      const loadUser = async () => {
        try {
          const users = await searchUsersRequest("");
          const user = users.find((u) => u.id === viewingUserId);
          if (user) {
            setViewingUser(user);
            setUserName(user.name || user.username);
            setUserAvatar(user.avatar || null);
            setUserBio(user.bio || "");
            // Verifica se já está seguindo
            setIsFollowing(authUser?.followingIds?.includes(user.id) || false);
          }
        } catch {
          // ignore errors
        }
      };
      loadUser();
    } else {
      setViewingUser(null);
    }
  }, [viewingUserId, authUser]);

  useEffect(() => {
    if (!authUser || viewingUserId) return; // Não atualiza se estiver vendo perfil de outro usuário
    // Prioriza avatar do authUser (que já vem com overrides do localStorage)
    const avatar = authUser.avatar || null;
    setUserName(authUser.name || "Seu Perfil");
    setUserAvatar(avatar);
    setUserBio(authUser.bio || "");
    setDraftName(authUser.name || "Seu Perfil");
    setDraftAvatar(avatar || "");
    setDraftBio(authUser.bio || "");
  }, [authUser, viewingUserId]);

  useEffect(() => {
    const loadFavorites = async () => {
      if (!authUser) return;
      try {
        const result = await getFavoritesRequest();
        setFavoriteEventIds(new Set(result.eventIds));
      } catch {
        try {
          const raw = localStorage.getItem(
            `konekt_favorite_events_${authUser.id}`,
          );
          const ids = raw ? (JSON.parse(raw) as number[]) : [];
          setFavoriteEventIds(new Set(ids));
        } catch {
          setFavoriteEventIds(new Set());
        }
      }
    };
    loadFavorites();
  }, [authUser?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(hiddenPastKey);
      const ids = raw ? (JSON.parse(raw) as number[]) : [];
      setHiddenPastEventIds(new Set(ids));
    } catch {
      setHiddenPastEventIds(new Set());
    }
  }, [hiddenPastKey]);

  useEffect(() => {
    if (!authUser) return;
    const handler = (event: any) => {
      if (!(event instanceof CustomEvent)) return;
      const ids = Array.isArray(event.detail) ? event.detail : [];
      setFavoriteEventIds(new Set(ids));
    };
    window.addEventListener("konekt:favorites-updated", handler);
    return () =>
      window.removeEventListener("konekt:favorites-updated", handler);
  }, [authUser?.id]);

  useEffect(() => {
    const loadUsers = async () => {
      setFriendsLoading(true);
      try {
        const users = await searchUsersRequest("");
        setAllUsers(users);
      } finally {
        setFriendsLoading(false);
      }
    };
    loadUsers();
  }, []);

  useEffect(() => {
    if (!friendsSearchOpen) {
      setFriendQuery("");
      return;
    }
    const query = friendQuery.trim().toLowerCase();
    if (query.length < 2) return;
    const handle = setTimeout(async () => {
      setFriendSearchLoading(true);
      try {
        await searchUsersRequest(query);
      } finally {
        setFriendSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [friendQuery, friendsSearchOpen]);

  const handleLike = () => {
    setIsLiked((prev) => {
      const newLiked = !prev;
      setLikesCount((count) => (newLiked ? count + 1 : count - 1));
      return newLiked;
    });
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    const newComment = {
      id: Date.now(),
      user: "Você",
      text: commentText.trim(),
      time: "agora",
    };
    setComments((prev) => [...prev, newComment]);
    setCommentText("");
  };

  const uploadAvatar = async (file: File) => {
    // Validação client-side
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Formato de imagem não suportado. Use JPG, PNG ou WEBP");
    }

    if (file.size > MAX_SIZE) {
      throw new Error("Arquivo muito grande. Tamanho máximo: 5MB");
    }

    const formData = new FormData();
    formData.append("avatar", file);

    const res = await fetch(`${API_URL}/users/me/avatar`, {
      method: "POST",
      headers: {
        ...(getAuthHeaders() as any),
      },
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ error: "Falha ao enviar imagem" }));
      throw new Error(errorData.error || "Falha ao enviar imagem");
    }

    const data = await res.json();
    const url = data?.avatar;
    if (!url) {
      throw new Error("Resposta inválida do upload");
    }

    // Atualizar usuário automaticamente
    if (data.user) {
      updateUser({ avatar: url });
    }

    return url.startsWith("http") ? url : `${API_URL}${url}`;
  };

  const shareUrl =
    selectedPost && typeof window !== "undefined"
      ? `${window.location.origin}/post/${selectedPost.id}`
      : selectedPost
        ? `post/${selectedPost.id}`
        : "";

  // Para o carrossel, vamos usar apenas a imagem do post por enquanto
  // (no futuro pode ter múltiplas fotos)
  const postImages = selectedPost ? [selectedPost.image] : [];

  const visibleEvents = useMemo(() => {
    if (!events) return [];
    const hasConnections =
      (authUser?.followingIds?.length ?? 0) +
        (authUser?.followerIds?.length ?? 0) >
      0;
    if (!hasConnections) {
      return events.filter((event) => event.visibility === "public");
    }
    return events;
  }, [events, authUser?.followingIds, authUser?.followerIds]);

  // Separar eventos em três grupos: futuros, acontecendo agora e passados
  const {
    upcomingEvents,
    activeEvents,
    pastEventsList,
    participatingEventsList,
  } = useMemo(() => {
    if (!visibleEvents.length) {
      return {
        upcomingEvents: [] as Event[],
        activeEvents: [] as Event[],
        pastEventsList: [] as Event[],
        participatingEventsList: [] as Event[],
      };
    }

    const now = new Date();
    const upcoming: Event[] = [];
    const active: Event[] = [];
    const past: Event[] = [];
    const userId = authUser?.id;
    const isParticipant = (event: Event) => {
      if (!userId) return false;
      const attendeeIds = (event as Event & { attendeeIds?: number[] })
        .attendeeIds;
      if (Array.isArray(attendeeIds) && attendeeIds.includes(userId))
        return true;
      const attendeesList = (
        event as Event & { attendeesList?: Array<{ id: number }> }
      ).attendeesList;
      if (
        Array.isArray(attendeesList) &&
        attendeesList.some((attendee) => attendee.id === userId)
      )
        return true;
      const creatorId = (event as Event & { creatorId?: number }).creatorId;
      if (creatorId === userId) return true;
      return false;
    };

    const sourceEvents = userId
      ? visibleEvents.filter((event) => isParticipant(event))
      : visibleEvents;

    sourceEvents.forEach((event) => {
      const startsAt = new Date(
        event.startsAt || `${event.date} ${event.time}`,
      );
      const ended = hasEventEnded(event, now);
      const isActiveNow = isEventActive(event);

      if (ended || startsAt < now) {
        // Já acabou ou já passou do horário de início e está marcado como encerrado
        if (ended) {
          past.push(event);
          return;
        }
      }

      if (isActiveNow) {
        active.push(event);
      } else if (startsAt > now) {
        upcoming.push(event);
      } else if (ended) {
        past.push(event);
      }
    });

    // Histórico ordena por data (mais recente primeiro)
    const sortByDate = (a: Event, b: Event) => {
      const dateA = new Date(a.startsAt || `${a.date} ${a.time}`);
      const dateB = new Date(b.startsAt || `${b.date} ${b.time}`);
      return dateB.getTime() - dateA.getTime();
    };

    past.sort(sortByDate);
    const filteredPast = past.filter(
      (event) => !hiddenPastEventIds.has(event.id),
    );

    // Participando (para outras lógicas) é a união de futuros + acontecendo
    const participating = [...upcoming, ...active];

    return {
      upcomingEvents: upcoming,
      activeEvents: active,
      pastEventsList: filteredPast,
      participatingEventsList: participating,
    };
  }, [visibleEvents, authUser?.id, hiddenPastEventIds]);

  const queryClient = useQueryClient();
  const { data: allPosts } = useGetPosts();

  // Fotos disponíveis para criar post (para o modal de criação)
  const galleryPhotos = useMemo(() => {
    if (!visibleEvents?.length) return [];

    const seeded = visibleEvents.slice(0, 4).map((event) => ({
      id: `seed-${event.id}`,
      url: event.image,
      eventId: event.id,
      owner: "other" as const,
      status: "posted" as const,
      allowReuse: true,
    }));

    return [...seeded, ...ownedPhotos];
  }, [visibleEvents, ownedPhotos]);

  // Eventos favoritados (X) - eventos que o usuário quer deixar no perfil
  const favoriteEvents = useMemo(() => {
    if (!visibleEvents) return [];
    return visibleEvents.filter((event) => favoriteEventIds.has(event.id));
  }, [visibleEvents, favoriteEventIds]);

  const applyFavorites = useCallback(
    (ids: number[]) => {
      setFavoriteEventIds(new Set(ids));
      try {
        localStorage.setItem(favoriteKey, JSON.stringify(ids));
      } catch {
        // ignore storage errors
      }
      window.dispatchEvent(
        new CustomEvent("konekt:favorites-updated", { detail: ids }),
      );
    },
    [favoriteKey],
  );

  const toggleFavorite = useCallback(
    (eventId: number) => {
      const current = Array.from(favoriteEventIds);
      const next = favoriteEventIds.has(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId];
      if (!authUser) {
        applyFavorites(next);
        return;
      }
      updateFavoritesRequest(next)
        .then((result) => applyFavorites(result.eventIds))
        .catch(() => applyFavorites(next));
    },
    [applyFavorites, authUser, favoriteEventIds],
  );

  useEffect(() => {
    if (!authUser) return;
    try {
      localStorage.setItem(
        `konekt_favorite_events_${authUser.id}`,
        JSON.stringify(Array.from(favoriteEventIds)),
      );
    } catch {
      // ignore storage errors
    }
  }, [favoriteEventIds, authUser?.id]);

  // Fotos públicas dos eventos que o usuário participou (para a aba de fotos)
  const publicPhotosFromEvents = useMemo(() => {
    if (!allPosts || !visibleEvents) return [];

    // Todos os eventos que o usuário participou (futuros e passados)
    const allParticipatedEvents = [
      ...participatingEventsList,
      ...pastEventsList,
    ];
    const participatedEventNames = new Set(
      allParticipatedEvents.map((event) => event.name),
    );

    // Coleta todas as fotos dos posts dos eventos participados
    const photos: Array<{
      id: string;
      url: string;
      eventId: number;
      eventName: string;
      postId: number;
      owner: "me" | "other";
    }> = [];

    allPosts.forEach((post) => {
      // Verifica se o post é de um evento que o usuário participou
      if (participatedEventNames.has(post.event.name)) {
        // Encontra o ID do evento correspondente
        const event = allParticipatedEvents.find(
          (e) => e.name === post.event.name,
        );
        if (event) {
          // Verifica se o post é do próprio usuário (usando author ou fallback para "Você")
          const isMyPost =
            post.author?.id === 1 ||
            (post.attendees?.some((attendee) => attendee.name === "Você") ??
              false);

          photos.push({
            id: `post-${post.id}`,
            url: post.image,
            eventId: event.id,
            eventName: post.event.name,
            postId: post.id,
            owner: isMyPost ? "me" : "other",
          });
        }
      }
    });

    return photos;
  }, [allPosts, participatingEventsList, pastEventsList, visibleEvents]);

  const availablePhotos = useMemo(() => {
    if (!postEventId) return [];
    return galleryPhotos.filter(
      (photo) =>
        photo.eventId === postEventId &&
        (photo.owner === "me" ||
          (photo.owner === "other" && photo.allowReuse === true)),
    );
  }, [galleryPhotos, postEventId]);

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
        setPhotoLimitMessage("");
      } else {
        if (next.size >= MAX_POST_MEDIA) {
          setPhotoLimitMessage(`Limite de ${MAX_POST_MEDIA} mídias por post.`);
          return next;
        }
        next.add(photoId);
        setPhotoLimitMessage("");
      }
      return next;
    });
  };

  // Filtra posts do usuário (posts onde o usuário é o autor)
  const userPosts = useMemo(() => {
    if (!allPosts) return [];
    return allPosts.filter(
      (post) =>
        post.author?.id === authUser?.id || // Usuário autenticado
        (post.attendees?.some((attendee) => attendee.name === "Você") ??
          false) || // Fallback para posts antigos
        post.attendees?.[0]?.name === "Você",
    );
  }, [allPosts, authUser?.id]);

  const totalEventsCount =
    upcomingEvents.length + activeEvents.length + pastEventsList.length;
  const friendsCount =
    authUser?.followingIds?.length ?? authUser?.following ?? 0;
  const postsCount = userPosts.length;
  const followingUsers = useMemo(() => {
    if (!authUser?.followingIds?.length) return [];
    return allUsers.filter((user) => authUser.followingIds?.includes(user.id));
  }, [allUsers, authUser?.followingIds]);

  const suggestedFriends = useMemo(() => {
    const query = friendQuery.trim().toLowerCase();
    const followingIds = new Set(authUser?.followingIds ?? []);
    return allUsers.filter((user) => {
      if (user.id === authUser?.id) return false;
      if (followingIds.has(user.id)) return false;
      if (!query) return true;
      return (
        user.username?.toLowerCase().includes(query) ||
        user.name?.toLowerCase().includes(query)
      );
    });
  }, [allUsers, authUser?.followingIds, authUser?.id, friendQuery]);

  const eventsById = useMemo(() => {
    return new Map((visibleEvents ?? []).map((event) => [event.id, event]));
  }, [visibleEvents]);

  const handleLoadMorePosts = useCallback(() => {
    setVisiblePostsCount((prev) =>
      Math.min(prev + POSTS_PAGE_SIZE, userPosts.length),
    );
  }, [userPosts.length]);

  const canLoadMorePosts = visiblePostsCount < userPosts.length;
  const loadMorePostsRef = useInfiniteScroll({
    enabled: canLoadMorePosts,
    onLoadMore: handleLoadMorePosts,
  });

  // Mutation para criar post
  const createPostMutation = useMutation({
    mutationFn: createPostRequest,
    onSuccess: (newPost) => {
      queryClient.setQueryData<Post[]>(["posts"], (prev) => {
        const list = prev ? [...prev] : [];
        if (!list.find((post) => post.id === newPost.id)) {
          list.unshift(newPost);
        }
        return list;
      });
      // Invalida o cache para recarregar os posts
      queryClient.invalidateQueries({ queryKey: ["posts"] });

      // Atualiza as fotos do perfil
      const selectedPhotos = availablePhotos.filter((photo) =>
        selectedPhotoIds.has(photo.id),
      );
      selectedPhotos.forEach((photo) => {
        if (photo.owner === "me") {
          setOwnedPhotos((prev) =>
            prev.map((p) =>
              p.id === photo.id ? { ...p, status: "posted" as const } : p,
            ),
          );
        }
      });

      // Limpa o formulário após delay para mostrar feedback
      setTimeout(() => {
        setCreatePostOpen(false);
        setSelectedPhotoIds(new Set());
        setPostEventId(null);
        setPostCaption("");
        setShowMoreEvents(false);
      }, 1500);
    },
  });

  const handleCreatePost = () => {
    if (!postEventId || selectedPhotoIds.size === 0) return;

    const event = eventsById.get(postEventId);
    if (!event) return;

    const selectedPhotos = availablePhotos.filter((photo) =>
      selectedPhotoIds.has(photo.id),
    );
    if (selectedPhotos.length === 0) return;

    // Usa a primeira foto selecionada como imagem principal do post
    const mainPhoto = selectedPhotos[0];

    // Cria o novo post
    const newPost: Post = {
      id: Date.now(), // ID temporário baseado em timestamp
      event: {
        name: event.name,
        location: event.location,
        date: event.date,
      },
      image: mainPhoto.url,
      attendees: [{ name: "Você", avatar: userAvatar || "" }],
      totalAttendees: event.attendees,
      likes: 0,
      comments: 0,
      timeAgo: "agora",
      caption: postCaption || undefined,
      author: authUser
        ? {
            id: authUser.id,
            username: authUser.username,
            name: userName || authUser.name,
            avatar: userAvatar || authUser.avatar || "",
          }
        : {
            id: 1,
            username: "fabiano_silva",
            name: userName || "Fabiano Silva",
            avatar: userAvatar || "",
          },
      isEventPost: false,
    };

    // Cria o post usando a mutation
    createPostMutation.mutate(newPost);
  };

  // isViewingOtherProfile is already declared in the component scope
  const displayUser = isViewingOtherProfile ? viewingUser : authUser;
  const displayName = isViewingOtherProfile
    ? viewingUser?.name || viewingUser?.username
    : userName;
  const displayAvatar = isViewingOtherProfile
    ? viewingUser?.avatar || null
    : userAvatar;
  const displayBio = isViewingOtherProfile ? viewingUser?.bio || "" : userBio;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-md px-4 pt-6 pb-24">
        {isViewingOtherProfile && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-sm text-foreground hover:text-muted-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Voltar</span>
          </button>
        )}
        <div className="relative mb-6 flex items-center gap-4">
          {!isViewingOtherProfile && (
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="absolute top-0 right-0 p-2 rounded-full hover:bg-accent transition-colors z-20"
            >
              <Settings className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent overflow-hidden border border-border">
            <Avatar className="h-full w-full">
              <AvatarImage src={displayAvatar || undefined} alt={displayName} />
              <AvatarFallback className="bg-accent text-primary">
                <UserIcon className="w-8 h-8" />
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1">
            <h2 className="text-lg text-foreground font-semibold line-clamp-1">
              {displayName}
            </h2>
            <p
              className={`mt-1 text-xs ${displayBio ? "text-foreground" : "text-muted-foreground"}`}
            >
              {displayBio ||
                (isViewingOtherProfile
                  ? ""
                  : "Adicione uma descrição ao seu perfil.")}
            </p>
            {isViewingOtherProfile && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!viewingUser) return;
                    try {
                      await toggleFollowRequest(viewingUser.id);
                      setIsFollowing((prev) => !prev);
                      if (authUser) {
                        const newFollowingIds = isFollowing
                          ? authUser.followingIds?.filter(
                              (id) => id !== viewingUser.id,
                            ) || []
                          : [...(authUser.followingIds || []), viewingUser.id];
                        updateUser({ followingIds: newFollowingIds });
                      }
                    } catch {
                      // ignore errors
                    }
                  }}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{isFollowing ? "Deixar de seguir" : "Seguir"}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!viewingUser) return;
                    try {
                      if (isBlocked) {
                        await unblockUserRequest(viewingUser.id);
                        setIsBlocked(false);
                      } else {
                        await blockUserRequest(viewingUser.id);
                        setIsBlocked(true);
                        setIsFollowing(false);
                      }
                    } catch {
                      // ignore errors
                    }
                  }}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Ban className="h-4 w-4" />
                  <span>{isBlocked ? "Desbloquear" : "Bloquear"}</span>
                </button>
              </div>
            )}
            {!isViewingOtherProfile && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {postsCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">posts</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setFriendsOpen(true);
                    try {
                      const friendsList = await getFriendsRequest();
                      setFriends(friendsList);
                    } catch {
                      // ignore errors
                    }
                  }}
                  className="rounded-lg hover:bg-accent/60 transition-colors py-1"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {friendsCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">amigos</p>
                </button>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {totalEventsCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">eventos</p>
                </div>
              </div>
            )}
            {!displayAvatar && !isViewingOtherProfile && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Adicione uma foto de perfil para completar seu cadastro.
              </p>
            )}
          </div>

          {profileMenuOpen && !isViewingOtherProfile && (
            <div className="absolute right-0 top-20 z-40 w-56 rounded-2xl border border-border bg-card shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setDraftName(userName);
                  setDraftAvatar(userAvatar ?? "");
                  setEditProfileOpen(true);
                  setProfileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Edit className="w-4 h-4" />
                <span>Editar perfil</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrivacyOpen(true);
                  setProfileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>Privacidade</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setChangePasswordOpen(true);
                  setProfileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>Alterar senha</span>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
                <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await logoutAll();
                  if (result.ok) {
                    setProfileMenuOpen(false);
                  } else {
                    alert(
                      result.error ||
                        "Erro ao fazer logout de todos os dispositivos",
                    );
                  }
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors border-t border-border"
              >
                <LogOutIcon className="w-4 h-4" />
                <span>Sair de todos os dispositivos</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setProfileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>

        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="posts" className="flex-1">
              Posts
            </TabsTrigger>
            <TabsTrigger value="favoritos" className="flex-1">
              X
            </TabsTrigger>
            <TabsTrigger value="eventos" className="flex-1">
              Eventos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4">
            {userPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum post ainda. Use o botão + para criar seu primeiro post!
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {userPosts.slice(0, visiblePostsCount).map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => {
                      setSelectedPost(post);
                      setCurrentImageIndex(0);
                    }}
                    className="flex flex-col overflow-hidden bg-background text-left hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={post.image}
                      alt={post.event.name}
                      className="w-full aspect-square object-cover"
                    />
                  </button>
                ))}
                {canLoadMorePosts && (
                  <div ref={loadMorePostsRef} className="col-span-3 h-6" />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="favoritos" className="mt-4">
            {favoriteEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum evento favoritado ainda. Adicione eventos aos seus
                favoritos para vê-los aqui!
              </p>
            ) : (
              <div className="space-y-3">
                {favoriteEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <img
                      src={event.image}
                      alt={event.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground line-clamp-1">
                        {event.name}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {event.location} · {event.date} às{" "}
                        {formatEventTimeRange(event) || event.time}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(event.id)}
                      className="p-2 hover:bg-destructive/20 rounded-full text-destructive transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="eventos" className="mt-4">
            {/* Esta aba é privada - apenas o próprio usuário pode ver */}
            <Tabs defaultValue="upcoming" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="upcoming" className="flex-1">
                  Futuros
                </TabsTrigger>
                <TabsTrigger value="active" className="flex-1">
                  Acontecendo
                </TabsTrigger>
                <TabsTrigger value="past" className="flex-1">
                  Passados
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="mt-4">
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum evento futuro por enquanto.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                      >
                        <div className="flex-1">
                          <EventRow
                            event={event}
                            onSelect={() => setSelectedEvent(event)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="active" className="mt-4">
                {activeEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum evento acontecendo agora.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {activeEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                      >
                        <div className="flex-1">
                          <EventRow
                            event={event}
                            onSelect={() => setSelectedEvent(event)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(hiddenPastEventIds);
                            next.add(event.id);
                            setHiddenPastEventIds(next);
                            try {
                              localStorage.setItem(
                                hiddenPastKey,
                                JSON.stringify(Array.from(next)),
                              );
                            } catch {
                              // ignore storage errors
                            }
                          }}
                          className="p-2 rounded-full bg-muted text-muted-foreground hover:bg-accent transition-colors"
                          title="Excluir"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="past" className="mt-4">
                {pastEventsList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum evento passado ainda.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pastEventsList.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                      >
                        <div className="flex-1">
                          <EventRow
                            event={event}
                            onSelect={() => setSelectedEvent(event)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {/* Botão flutuante para criar post */}
      <button
        type="button"
        onClick={() => {
          setCreatePostOpen(true);
          setPostEventId(null);
          setSelectedPhotoIds(new Set());
          setShowMoreEvents(false);
        }}
        className="fixed bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white border-2 border-primary text-primary shadow-lg hover:scale-110 transition-transform"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Modal de criar post de fotos */}
      <Dialog
        open={createPostOpen}
        onOpenChange={(open) => {
          setCreatePostOpen(open);
          if (!open) {
            setPostEventId(null);
            setSelectedPhotoIds(new Set());
            setShowMoreEvents(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {postEventId ? "Selecione as fotos" : "Escolha um evento"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!postEventId ? (
              // Lista de eventos já participados
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Selecione um evento que você já participou para criar um post
                  com fotos existentes
                </p>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {(showMoreEvents
                    ? pastEventsList
                    : pastEventsList.slice(0, 5)
                  ).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setPostEventId(event.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent transition-colors"
                    >
                      <img
                        src={event.image}
                        alt={event.name}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground line-clamp-1">
                          {event.name}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {event.location} · {event.date}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                {pastEventsList.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowMoreEvents((prev) => !prev)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
                  >
                    {showMoreEvents
                      ? "Mostrar menos"
                      : `Mostrar mais (${pastEventsList.length - 5})`}
                  </button>
                )}
              </>
            ) : (
              // Grid de fotos do evento selecionado
              <>
                <button
                  type="button"
                  onClick={() => setPostEventId(null)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  ← Voltar
                </button>
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src={eventsById.get(postEventId)?.image}
                      alt={eventsById.get(postEventId)?.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {eventsById.get(postEventId)?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {eventsById.get(postEventId)?.location}
                      </p>
                    </div>
                  </div>
                  <label className="text-sm font-semibold text-foreground mb-2 block">
                    Selecione as fotos ({selectedPhotoIds.size}/{MAX_POST_MEDIA}
                    )
                  </label>
                  {availablePhotos.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma foto disponível para este evento.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto mb-4">
                      {availablePhotos.map((photo) => {
                        const isSelected = selectedPhotoIds.has(photo.id);
                        const eventName =
                          eventsById.get(photo.eventId)?.name ?? "Evento";
                        return (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => togglePhotoSelection(photo.id)}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <img
                              src={photo.url}
                              alt={eventName}
                              className="h-full w-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <div className="rounded-full bg-primary text-primary-foreground p-1">
                                  <X className="h-4 w-4" />
                                </div>
                              </div>
                            )}
                            {photo.owner === "other" && (
                              <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                Outro
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {photoLimitMessage && (
                    <p className="text-xs text-destructive">
                      {photoLimitMessage}
                    </p>
                  )}
                </div>

                {/* Campo de descrição */}
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 block">
                    Descrição (opcional)
                  </label>
                  <textarea
                    value={postCaption}
                    onChange={(e) => setPostCaption(e.target.value)}
                    placeholder="Adicione uma descrição ao post..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {postCaption.length}/500
                  </p>
                </div>

                {/* Botão de postar */}
                <button
                  type="button"
                  onClick={handleCreatePost}
                  disabled={
                    selectedPhotoIds.size === 0 || createPostMutation.isPending
                  }
                  className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                    createPostMutation.isSuccess &&
                    !createPostMutation.isPending
                      ? "bg-green-500 text-white"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {createPostMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Postando...</span>
                    </>
                  ) : createPostMutation.isSuccess &&
                    !createPostMutation.isPending ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Postado com sucesso!</span>
                    </>
                  ) : (
                    <>
                      Postar{" "}
                      {selectedPhotoIds.size > 0 &&
                        `${selectedPhotoIds.size} foto${selectedPhotoIds.size > 1 ? "s" : ""}`}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal editar perfil */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>
              Atualize seu nome e foto de perfil.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-accent overflow-hidden flex items-center justify-center border border-border">
                {draftAvatar ? (
                  <img
                    src={draftAvatar}
                    alt={draftName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-8 h-8 text-primary" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">Nome</label>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Descrição
                  </label>
                  <textarea
                    value={draftBio}
                    onChange={(e) => setDraftBio(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                    rows={3}
                    placeholder="Fale um pouco sobre você"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Foto de perfil
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors">
                      Enviar foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setAvatarUploading(true);
                          uploadAvatar(file)
                            .then((url) => {
                              setDraftAvatar(url);
                              // Salva imediatamente no localStorage como fallback
                              if (authUser) {
                                updateUser({ avatar: url });
                              }
                            })
                            .catch(() => {
                              // Se o upload falhar, usa base64 como fallback
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === "string") {
                                  const base64Url = reader.result;
                                  setDraftAvatar(base64Url);
                                  // Salva base64 no localStorage como fallback
                                  if (authUser) {
                                    updateUser({ avatar: base64Url });
                                  }
                                }
                              };
                              reader.readAsDataURL(file);
                            })
                            .finally(() => setAvatarUploading(false));
                        }}
                      />
                    </label>
                    <label className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors">
                      Tirar foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setAvatarUploading(true);
                          uploadAvatar(file)
                            .then((url) => {
                              setDraftAvatar(url);
                              // Salva imediatamente no localStorage como fallback
                              if (authUser) {
                                updateUser({ avatar: url });
                              }
                            })
                            .catch(() => {
                              // Se o upload falhar, usa base64 como fallback
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === "string") {
                                  const base64Url = reader.result;
                                  setDraftAvatar(base64Url);
                                  // Salva base64 no localStorage como fallback
                                  if (authUser) {
                                    updateUser({ avatar: base64Url });
                                  }
                                }
                              };
                              reader.readAsDataURL(file);
                            })
                            .finally(() => setAvatarUploading(false));
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      URL da foto
                    </label>
                    <input
                      value={draftAvatar}
                      onChange={(e) => setDraftAvatar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                    {avatarUploading && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Enviando foto...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
                onClick={() => setEditProfileOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
                onClick={async () => {
                  const nextName = draftName || "Seu Perfil";
                  const nextAvatar = draftAvatar.trim()
                    ? draftAvatar.trim()
                    : "";
                  const nextBio = draftBio.trim();
                  setUserName(nextName);
                  setUserAvatar(nextAvatar || null);
                  setUserBio(nextBio);
                  // Atualiza local primeiro para feedback imediato
                  updateUser({
                    name: nextName,
                    avatar: nextAvatar,
                    bio: nextBio,
                  });
                  try {
                    // Tenta salvar no backend
                    const updatedUser = await updateMeRequest({
                      name: nextName,
                      avatar: nextAvatar,
                      bio: nextBio,
                    });
                    // Se o backend retornou o usuário atualizado, usa os dados do backend
                    if (updatedUser) {
                      updateUser({
                        name: updatedUser.name,
                        avatar: updatedUser.avatar,
                        bio: updatedUser.bio,
                      });
                      setUserAvatar(updatedUser.avatar || null);
                    }
                  } catch {
                    // Mantem local quando offline - a foto já está salva no localStorage via updateUser
                    console.warn(
                      "Falha ao salvar no backend, mantendo apenas local",
                    );
                  }
                  setEditProfileOpen(false);
                }}
              >
                <Check className="w-4 h-4" />
                Salvar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={friendsOpen} onOpenChange={setFriendsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Seguindo</DialogTitle>
            <DialogDescription>Contas que você segue</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFriendsSearchOpen((prev) => !prev)}
              className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
            >
              Adicionar amigo
            </button>
          </div>
          {friendsSearchOpen && (
            <div className="mt-3 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={friendQuery}
                  onChange={(e) => setFriendQuery(e.target.value)}
                  placeholder="Buscar usuários"
                  className="w-full rounded-full border border-border bg-background px-4 py-2 text-[13px]"
                />
              </div>
              {friendSearchLoading ? (
                <p className="text-xs text-muted-foreground">Buscando...</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {suggestedFriends.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum usuário encontrado.
                    </p>
                  ) : (
                    suggestedFriends.map((user) => (
                      <div key={user.id} className="flex items-center gap-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="h-9 w-9 rounded-full object-cover border border-border"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            @{user.username}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {user.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const result = await toggleFollowRequest(user.id);
                              updateUser(result.me);
                              setAllUsers((prev) =>
                                prev.map((item) =>
                                  item.id === result.user.id
                                    ? result.user
                                    : item,
                                ),
                              );
                            } catch {
                              // ignore
                            }
                          }}
                          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                        >
                          Seguir
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {friendsLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : followingUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não segue ninguém.
            </p>
          ) : (
            <div className="space-y-3">
              {followingUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-10 w-10 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-border bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      @{user.username}
                    </p>
                    <p className="text-xs text-muted-foreground">{user.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => (!open ? setSelectedEvent(null) : null)}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {selectedEvent && (
            <EventFullCard
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de detalhes do post */}
      <Dialog
        open={selectedPost !== null}
        onOpenChange={(open) => !open && setSelectedPost(null)}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
          {selectedPost && (
            <>
              {/* Carrossel de imagens */}
              <div className="relative w-full aspect-square bg-black">
                <img
                  src={postImages[currentImageIndex]}
                  alt={selectedPost.event.name}
                  className="w-full h-full object-cover"
                />
                {postImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentImageIndex(
                          (prev) =>
                            (prev - 1 + postImages.length) % postImages.length,
                        )
                      }
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 bg-black/70 backdrop-blur-sm text-white hover:bg-black/90"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentImageIndex(
                          (prev) => (prev + 1) % postImages.length,
                        )
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 bg-black/70 backdrop-blur-sm text-white hover:bg-black/90"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {postImages.map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full transition-all ${
                            idx === currentImageIndex
                              ? "w-6 bg-white"
                              : "w-1.5 bg-white/50"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Conteúdo do post */}
              <div className="p-4 space-y-4">
                {/* Informações do evento + mini card do evento */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">
                      {selectedPost.event.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{selectedPost.event.location}</span>
                      <span>•</span>
                      <span>{selectedPost.event.date}</span>
                    </div>
                  </div>
                  {events &&
                    (() => {
                      const relatedEvent = events.find(
                        (event) =>
                          event.name === selectedPost.event.name &&
                          event.location === selectedPost.event.location,
                      );
                      if (!relatedEvent) return null;
                      return (
                        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                          <img
                            src={relatedEvent.image}
                            alt={relatedEvent.name}
                            className="h-14 w-14 rounded-lg object-cover"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-foreground line-clamp-1">
                              {relatedEvent.name}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {relatedEvent.location} · {relatedEvent.date} às{" "}
                              {relatedEvent.time}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                </div>

                {/* Ações (curtir, comentar, compartilhar) */}
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleLike}
                    className={`flex items-center gap-2 transition-colors ${
                      isLiked
                        ? "text-destructive"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
                  >
                    <Heart
                      className={`w-6 h-6 ${isLiked ? "fill-current" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowComments(!showComments)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <MessageCircle className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Share2 className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Users className="w-5 h-5" />
                    <span className="text-sm font-semibold">
                      {selectedPost.totalAttendees}
                    </span>
                  </button>
                </div>

                {/* Curtidas */}
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{likesCount} curtidas</span>
                </p>

                {/* Descrição */}
                {selectedPost.caption && (
                  <div>
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">
                        {selectedPost.event.name}
                      </span>{" "}
                      {selectedPost.caption}
                    </p>
                  </div>
                )}

                {/* Comentários */}
                {(selectedPost.comments > 0 || comments.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setShowComments(!showComments)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ver todos os {selectedPost.comments + comments.length}{" "}
                    comentários
                  </button>
                )}

                {showComments && (
                  <div className="space-y-2 pt-3 border-t border-border">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex items-start gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {comment.user}:
                        </span>
                        <span className="text-sm text-foreground flex-1">
                          {comment.text}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {comment.time}
                        </span>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleComment();
                          }
                        }}
                        placeholder="Adicione um comentário..."
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={handleComment}
                        disabled={!commentText.trim()}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground uppercase">
                  {selectedPost.timeAgo}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {selectedPost && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Compartilhar post"
          url={shareUrl}
        />
      )}

      {/* Modal de Alteração de Senha */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>
              Digite sua senha atual e a nova senha
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="currentPassword"
                className="text-sm font-medium text-foreground block mb-2"
              >
                Senha atual
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Digite sua senha atual"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="text-sm font-medium text-foreground block mb-2"
              >
                Nova senha
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Digite a nova senha (mínimo 6 caracteres)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-foreground block mb-2"
              >
                Confirmar nova senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Confirme a nova senha"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {passwordError && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3 border border-destructive/30">
                {passwordError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setChangePasswordOpen(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordError("");
                }}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setPasswordError("");

                  if (!currentPassword || !newPassword || !confirmPassword) {
                    setPasswordError("Todos os campos são obrigatórios");
                    return;
                  }

                  if (newPassword.length < 6) {
                    setPasswordError(
                      "A nova senha deve ter no mínimo 6 caracteres",
                    );
                    return;
                  }

                  if (newPassword !== confirmPassword) {
                    setPasswordError("As senhas não coincidem");
                    return;
                  }

                  setPasswordLoading(true);
                  const result = await changePassword(
                    currentPassword,
                    newPassword,
                  );
                  setPasswordLoading(false);

                  if (result.ok) {
                    setChangePasswordOpen(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordError("");
                    alert("Senha alterada com sucesso!");
                  } else {
                    setPasswordError(result.error || "Erro ao alterar senha");
                  }
                }}
                disabled={passwordLoading}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {passwordLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Alterando...</span>
                  </>
                ) : (
                  "Alterar senha"
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Privacidade */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurações de Privacidade</DialogTitle>
            <DialogDescription>
              Controle quem pode ver suas informações
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Perfil público
                </p>
                <p className="text-xs text-muted-foreground">
                  Permitir que outros usuários vejam seu perfil
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newSettings = {
                    ...privacySettings,
                    profilePublic: !privacySettings.profilePublic,
                  };
                  setPrivacySettings(newSettings);
                  updatePrivacySettingsRequest(newSettings).catch(() => {
                    setPrivacySettings(privacySettings);
                  });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.profilePublic ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    privacySettings.profilePublic
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Mostrar email
                </p>
                <p className="text-xs text-muted-foreground">
                  Exibir seu email no perfil
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newSettings = {
                    ...privacySettings,
                    showEmail: !privacySettings.showEmail,
                  };
                  setPrivacySettings(newSettings);
                  updatePrivacySettingsRequest(newSettings).catch(() => {
                    setPrivacySettings(privacySettings);
                  });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.showEmail ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    privacySettings.showEmail
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Mostrar data de nascimento
                </p>
                <p className="text-xs text-muted-foreground">
                  Exibir sua data de nascimento
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newSettings = {
                    ...privacySettings,
                    showBirthDate: !privacySettings.showBirthDate,
                  };
                  setPrivacySettings(newSettings);
                  updatePrivacySettingsRequest(newSettings).catch(() => {
                    setPrivacySettings(privacySettings);
                  });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.showBirthDate ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    privacySettings.showBirthDate
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Mostrar seguidores
                </p>
                <p className="text-xs text-muted-foreground">
                  Exibir lista de seguidores e seguindo
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newSettings = {
                    ...privacySettings,
                    showFollowers: !privacySettings.showFollowers,
                  };
                  setPrivacySettings(newSettings);
                  updatePrivacySettingsRequest(newSettings).catch(() => {
                    setPrivacySettings(privacySettings);
                  });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.showFollowers ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    privacySettings.showFollowers
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
