import { useEffect, useState, useRef, useCallback } from 'react';
import { Check, Loader2, Share2, X, Star, MessageCircle, Users, Edit, Camera, Image as ImageIcon, User as UserIcon, Trash2, MapPin } from 'lucide-react';
import { Event, User } from '../../../types';
import { EventChips } from './EventChips';
import { getVisibilityLabel, getVisibilityColor, getVisibilityGlow } from '../utils/eventLabels';
import { formatEventTimeRange, hasEventEnded, isEventActive } from '../utils/eventSchedule';
import { ShareDialog } from '../../../components/ShareDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '../../../components/ui/avatar';
import {
  requestJoinEventRequest,
  getEventChatRequest,
  getEventMediaRequest,
  postEventChatRequest,
  createEventRequest,
  updateEventRequest,
  deleteEventRequest,
  checkInEventRequest,
  getEventRequest,
  getEventExpensesRequest,
  addEventExpenseRequest,
  deleteEventExpenseRequest,
  updateExpenseParticipantStatusRequest,
} from '../../../services/api/events';
import { useAuth } from '../../../contexts/AuthContext';
import { getFavoritesRequest, searchUsersRequest, updateFavoritesRequest } from '../../../services/api/users';
import { useQueryClient, useMutation } from '@tanstack/react-query';

type ExpenseParticipant = {
  id: number;
  name: string;
  paymentStatus: 'pending' | 'approved' | 'none'; // Legacy compatibility
  status: 'pending' | 'paid_waiting_confirmation' | 'paid'; // New detailed status
  paid?: boolean; // Legacy
};
type ExpenseItem = {
  id: number;
  title: string;
  amount: number;
  participants: ExpenseParticipant[];
  creatorId: number; // ID do usuário que criou o gasto
  createdAt: string;
  pixKey?: string;
};
type ChatMessage = {
  id: number;
  author: string;
  text?: string;
  photoUrl?: string;
  createdAt: string;
  authorId?: number; // ID do autor para rastrear check-ins
};
type ParticipantWithStatus = {
  id: number;
  name: string;
  avatar: string;
  status: 'presente' | 'pendente';
  isCreator: boolean;
  checkInPhoto?: string;
};

interface EventFullCardProps {
  event: Event;
  onClose?: () => void;
  userPosition?: [number, number] | null;
}

// Função para calcular distância entre duas coordenadas (em metros)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
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

import { useGetEvent } from '../../../hooks/useGetEvent';

// ... imports

export function EventFullCard({ event, onClose = () => { }, userPosition }: EventFullCardProps) {
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();

  // Use independent polling for this specific event to guarantee fresh data
  const { data: remoteEvent, isError: isEventError } = useGetEvent(event.id, event);
  const currentEvent = remoteEvent || event;

  // ... rest of component using currentEvent


  // Guard against missing theme
  const theme = currentEvent.theme || { icon: '📅', label: 'Evento', color: '#808080' };
  const { icon, label } = theme;
  const timeRange = formatEventTimeRange(currentEvent);
  const isActive = isEventActive(currentEvent);
  const ended = hasEventEnded(currentEvent);
  const isPastNonRecurring = ended && !currentEvent.isRecurring;
  const [participateLoading, setParticipateLoading] = useState(false);
  const [participateSuccess, setParticipateSuccess] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [isParticipating, setIsParticipating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePixKey, setExpensePixKey] = useState(''); // Estado para chave PIX
  const [includeMe, setIncludeMe] = useState(true); // "Incluir-me na divisão"
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isStoredParticipant, setIsStoredParticipant] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [mediaItems, setMediaItems] = useState<ChatMessage[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [hasEnsuredBackend, setHasEnsuredBackend] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [hasCheckedIn, setHasCheckedIn] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const checkInInputRef = useRef<HTMLInputElement>(null);
  const checkInCapaInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [participantsWithStatus, setParticipantsWithStatus] = useState<ParticipantWithStatus[]>([]);
  const [bannedUserIds, setBannedUserIds] = useState<Set<number>>(new Set());
  // Estados para edição de evento
  const [editImage, setEditImage] = useState<string>(currentEvent.image);
  const [editDate, setEditDate] = useState<string>(() => {
    const startDate = new Date(currentEvent.startsAt);
    return startDate.toISOString().slice(0, 16); // Formato datetime-local
  });
  const [editEndDate, setEditEndDate] = useState<string>(() => {
    const endDate = new Date(currentEvent.endsAt);
    return endDate.toISOString().slice(0, 16);
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const bannedKey = authUser ? `konekt_event_banned_${authUser.id}_${currentEvent.id}` : `konekt_event_banned_${currentEvent.id}`;

  // Verifica se o usuário é o criador do evento
  const eventWithCreator = currentEvent as Event & {
    creatorId?: number;
    attendeesList?: Array<{ id: number; name: string; avatar: string }>;
    attendeeIds?: number[];
  };
  const isEventCreator = authUser && eventWithCreator.creatorId === authUser.id;
  const attendeesList = eventWithCreator.attendeesList || [];
  const attendeeIds = eventWithCreator.attendeeIds || [];

  const participationKey = authUser ? `konekt_event_participation_${authUser.id}` : 'konekt_event_participation';
  const expensesKey = authUser ? `konekt_event_expenses_${authUser.id}_${currentEvent.id}` : `konekt_event_expenses_${currentEvent.id}`;
  const chatKey = authUser ? `konekt_event_chat_${authUser.id}_${currentEvent.id}` : `konekt_event_chat_${currentEvent.id}`;
  const mediaKey = authUser ? `konekt_event_media_${authUser.id}_${currentEvent.id}` : `konekt_event_media_${currentEvent.id}`;
  const favoriteKey = authUser ? `konekt_favorite_events_${authUser.id}` : `konekt_favorite_events`;
  const completedEventsKey = authUser ? `konekt_completed_events_${authUser.id}` : `konekt_completed_events`;

  const canManageExpenses = isParticipating || isStoredParticipant || isEventCreator;
  const canShowGroup = !currentEvent.requiresApproval || canManageExpenses || requestSent;

  // Atualiza estados de edição quando evento muda
  useEffect(() => {
    setEditImage(currentEvent.image);
    const startDate = new Date(currentEvent.startsAt);
    if (!Number.isNaN(startDate.getTime())) {
      setEditDate(startDate.toISOString().slice(0, 16));
    }
    const endDate = new Date(currentEvent.endsAt);
    if (!Number.isNaN(endDate.getTime())) {
      setEditEndDate(endDate.toISOString().slice(0, 16));
    }
  }, [currentEvent]);



  useEffect(() => {
    if (!authUser) return;
    try {
      const raw = localStorage.getItem(participationKey);
      const ids = raw ? (JSON.parse(raw) as number[]) : [];
      setIsStoredParticipant(ids.includes(currentEvent.id));
    } catch {
      setIsStoredParticipant(false);
    }
  }, [authUser, currentEvent.id, participationKey]);

  // Verificar se usuário já fez check-in
  useEffect(() => {
    if (!authUser || !isParticipating) {
      setHasCheckedIn(false);
      return;
    }

    // Verificar na mídia do evento se há foto de check-in do usuário
    const checkInKey = `konekt_checkin_${authUser.id}_${currentEvent.id}`;
    try {
      const hasCheckedInLocal = localStorage.getItem(checkInKey) === 'true';
      if (hasCheckedInLocal) {
        setHasCheckedIn(true);
        return;
      }
    } catch {
      // ignore
    }

    // Verificar no backend (opcional - pode fazer requisição para /users/me/participations)
    setHasCheckedIn(false);
  }, [authUser, currentEvent.id, isParticipating]);

  // Carrega lista de usuários bloqueados
  useEffect(() => {
    if (!isEventCreator) return;
    try {
      const raw = localStorage.getItem(bannedKey);
      const ids = raw ? (JSON.parse(raw) as number[]) : [];
      setBannedUserIds(new Set(ids));
    } catch {
      setBannedUserIds(new Set());
    }
  }, [isEventCreator, bannedKey]);

  // Salva lista de usuários bloqueados
  useEffect(() => {
    if (!isEventCreator || bannedUserIds.size === 0) return;
    try {
      localStorage.setItem(bannedKey, JSON.stringify(Array.from(bannedUserIds)));
    } catch {
      // ignore storage errors
    }
  }, [bannedUserIds, isEventCreator, bannedKey]);

  const loadExpenses = async () => {
    if (isEventError && !authUser) return;
    try {
      const expenses = await getEventExpensesRequest(currentEvent.id);

      // Mapeia para o formato esperado pelo componente, se necessário
      // O backend retorna: { id, eventId, creatorId, title, amount, participants, createdAt }
      // O frontend espera: ExpenseItem[]

      const mappedExpenses: ExpenseItem[] = expenses.map((expense: any) => {
        // Backend: { id, title, amount, participants: [{ userId, paid, status, user: { name } }], creatorId, createdAt, pixKey }

        const participants: ExpenseParticipant[] = (expense.participants || []).map((p: any) => ({
          id: p.userId,
          name: p.user?.name || 'Participante', // TODO: Backend should provide name
          paymentStatus: p.status === 'paid' ? 'approved' : 'pending', // Legacy fallback
          status: p.status || (p.paid ? 'paid' : 'pending'), // Use stored status or fallback to legacy paid boolean
          paid: p.status === 'paid' || p.paid // Legacy
        }));

        return {
          id: expense.id,
          title: expense.title,
          amount: expense.amount,
          participants,
          creatorId: expense.creatorId,
          createdAt: expense.createdAt,
          pixKey: expense.pixKey,
        };
      });

      setExpenses(mappedExpenses);
    } catch (error) {
      console.error('Failed to load expenses', error);
      setExpenses([]); // Clear expenses on error
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [currentEvent.id, authUser?.id]);

  const handleDeleteExpense = async (id: number) => {
    try {
      await deleteEventExpenseRequest(currentEvent.id, id);
      loadExpenses();
    } catch (error) {
      console.error('Failed to delete expense', error);
    }
  };

  useEffect(() => {
    loadExpenses();

    // Atualiza gastos periodicamente (a cada 1 segundo) para garantir sincronização
    const interval = setInterval(loadExpenses, 1000);
    return () => clearInterval(interval);
  }, [expensesKey, authUser?.id, currentEvent.id]); // Added currentEvent.id to dependencies

  useEffect(() => {
    try {
      localStorage.setItem(expensesKey, JSON.stringify(expenses));
    } catch {
      // ignore storage errors
    }
  }, [expenses, expensesKey]);

  const ensureBackendEvent = async () => {
    if (!authUser || hasEnsuredBackend) return;
    try {
      await createEventRequest(currentEvent);
      setHasEnsuredBackend(true);
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const loadChat = async () => {
      if (!authUser) return;
      if (isEventError && !hasEnsuredBackend) return;
      try {
        const chat = await getEventChatRequest(currentEvent.id);
        setChatMessages(chat);
        // Força recálculo de participantes quando chat é atualizado
        // Isso garante que status de check-in seja atualizado
      } catch {
        await ensureBackendEvent();
        try {
          const chat = await getEventChatRequest(currentEvent.id);
          setChatMessages(chat);
        } catch {
          try {
            const raw = localStorage.getItem(chatKey);
            setChatMessages(raw ? (JSON.parse(raw) as ChatMessage[]) : []);
          } catch {
            setChatMessages([]);
          }
        }
      }
    };

    // Carrega imediatamente
    loadChat();

    // Atualiza periodicamente (a cada 1 segundo) para garantir sincronização
    const interval = setInterval(loadChat, 1000);
    return () => clearInterval(interval);
  }, [authUser, chatKey, currentEvent.id]);

  useEffect(() => {
    try {
      localStorage.setItem(chatKey, JSON.stringify(chatMessages));
    } catch {
      // ignore storage errors
    }
  }, [chatMessages, chatKey]);

  useEffect(() => {
    const loadMedia = async () => {
      if (!authUser) return;
      if (isEventError && !hasEnsuredBackend) return;
      try {
        const media = await getEventMediaRequest(currentEvent.id);
        setMediaItems(media as ChatMessage[]);
      } catch {
        await ensureBackendEvent();
        try {
          const media = await getEventMediaRequest(currentEvent.id);
          setMediaItems(media as ChatMessage[]);
        } catch {
          try {
            const raw = localStorage.getItem(mediaKey);
            setMediaItems(raw ? (JSON.parse(raw) as ChatMessage[]) : []);
          } catch {
            setMediaItems([]);
          }
        }
      }
    };

    // Carrega imediatamente
    loadMedia();

    // Atualiza periodicamente (a cada 1 segundo) para garantir sincronização
    const interval = setInterval(loadMedia, 1000);
    return () => clearInterval(interval);
  }, [authUser, currentEvent.id, mediaKey]);

  useEffect(() => {
    try {
      localStorage.setItem(mediaKey, JSON.stringify(mediaItems));
    } catch {
      // ignore storage errors
    }
  }, [mediaItems, mediaKey]);

  useEffect(() => {
    const loadFavorites = async () => {
      if (!authUser) return;
      try {
        const result = await getFavoritesRequest();
        setFavoriteIds(result.eventIds);
        setIsFavorite(result.eventIds.includes(currentEvent.id));
      } catch {
        try {
          const raw = localStorage.getItem(favoriteKey);
          const ids = raw ? (JSON.parse(raw) as number[]) : [];
          setFavoriteIds(ids);
          setIsFavorite(ids.includes(currentEvent.id));
        } catch {
          setFavoriteIds([]);
          setIsFavorite(false);
        }
      }
    };
    loadFavorites();
  }, [authUser, currentEvent.id, favoriteKey]);

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const users = await searchUsersRequest('');
        setAllUsers(users);
      } finally {
        setUsersLoading(false);
      }
    };
    loadUsers();
  }, []);

  // Função para calcular participantes com status de check-in
  const calculateParticipants = useCallback(() => {
    if (!authUser || !allUsers.length) return;

    // IDs de usuários que fizeram check-in
    const checkedInUserIds = new Set<number>();

    // 1. Verifica mídias marcadas explicitamente como check-in
    mediaItems.forEach((item) => {
      if ((item as any).isCheckIn && item.authorId) {
        checkedInUserIds.add(item.authorId);
      }
    });

    // 2. Adiciona o próprio usuário se tiver feito check-in localmente (backup)
    if (authUser && hasCheckedIn) {
      checkedInUserIds.add(authUser.id);
    }

    // Monta lista de participantes (excluindo usuários bloqueados)
    const participants: ParticipantWithStatus[] = [];
    const participantsMap = new Map<number, ParticipantWithStatus>();

    // Determina status do participante baseado em check-in e se evento acabou
    const getParticipantStatus = (userId: number): 'presente' | 'pendente' => {
      const hasCheckedIn = checkedInUserIds.has(userId);
      // Se fez check-in, sempre presente
      if (hasCheckedIn) return 'presente';
      // Se evento já acabou, considera como presente mesmo sem check-in
      if (ended) return 'presente';
      // Se não fez check-in e evento não acabou, está pendente
      return 'pendente';
    };

    // Adiciona criador como presente por padrão
    if (isEventCreator && authUser) {
      // Busca foto de check-in do criador se houver
      const creatorCheckInMsg = chatMessages.find(m => m.photoUrl && m.authorId === authUser.id);

      participantsMap.set(authUser.id, {
        id: authUser.id,
        name: authUser.name || authUser.username,
        avatar: authUser.avatar || '',
        status: 'presente',
        isCreator: true,
        checkInPhoto: creatorCheckInMsg?.photoUrl,
      });
    }

    // Primeiro, adiciona participantes da lista de attendees (tem informações completas)
    attendeesList.forEach((attendee) => {
      if (attendee.id === authUser?.id && isEventCreator) return; // Já adicionado como criador
      if (bannedUserIds.has(attendee.id)) return; // Exclui usuários bloqueados

      // Busca foto de check-in
      const checkInMsg = chatMessages.find(m => m.photoUrl && m.authorId === attendee.id);
      const hasCheckedInLocally = attendee.id === authUser?.id && hasCheckedIn;

      participantsMap.set(attendee.id, {
        id: attendee.id,
        name: attendee.name,
        avatar: attendee.avatar,
        status: getParticipantStatus(attendee.id) === 'presente' || hasCheckedInLocally ? 'presente' : 'pendente',
        isCreator: false,
        checkInPhoto: checkInMsg?.photoUrl,
      });
    });

    // Depois, adiciona participantes de attendeeIds que não estão na lista (busca info em allUsers)
    attendeeIds.forEach((userId) => {
      if (participantsMap.has(userId)) return; // Já está na lista
      if (bannedUserIds.has(userId)) return; // Exclui usuários bloqueados

      const user = allUsers.find((u) => u.id === userId);
      if (user) {
        // Busca foto de check-in
        const checkInMsg = chatMessages.find(m => m.photoUrl && m.authorId === userId);
        const hasCheckedInLocally = userId === authUser?.id && hasCheckedIn;

        participantsMap.set(userId, {
          id: userId,
          name: user.name || user.username,
          avatar: user.avatar || '',
          status: getParticipantStatus(userId) === 'presente' || hasCheckedInLocally ? 'presente' : 'pendente',
          isCreator: userId === eventWithCreator.creatorId,
          checkInPhoto: checkInMsg?.photoUrl,
        });
      }
    });

    // Se o usuário atual participa mas não está na lista, adiciona (se não estiver bloqueado)
    if (canManageExpenses && authUser && !participantsMap.has(authUser.id) && !bannedUserIds.has(authUser.id)) {
      // Busca foto de check-in
      const checkInMsg = chatMessages.find(m => m.photoUrl && m.authorId === authUser.id);

      participantsMap.set(authUser.id, {
        id: authUser.id,
        name: authUser.name || authUser.username,
        avatar: authUser.avatar || '',
        status: (getParticipantStatus(authUser.id) === 'presente' || hasCheckedIn) ? 'presente' : 'pendente',
        isCreator: !!isEventCreator,
        checkInPhoto: checkInMsg?.photoUrl,
      });
    }

    // Adiciona usuários que enviaram mensagens no chat mas não estão na lista de participantes
    chatMessages.forEach((msg) => {
      if (!msg.authorId) {
        // Se não tem authorId, tenta encontrar pelo nome
        const user = allUsers.find((u) => u.name === msg.author || u.username === msg.author);
        if (user && !participantsMap.has(user.id) && !bannedUserIds.has(user.id)) {
          // Busca foto de check-in (pode ser a própria msg atual ou outra)
          const checkInMsg = chatMessages.find(m => m.photoUrl && (m.authorId === user.id || m.author === user.name));

          participantsMap.set(user.id, {
            id: user.id,
            name: user.name || user.username,
            avatar: user.avatar || '',
            status: getParticipantStatus(user.id),
            isCreator: user.id === eventWithCreator.creatorId,
            checkInPhoto: checkInMsg?.photoUrl,
          });
        }
      } else {
        // Se tem authorId, adiciona diretamente
        if (!participantsMap.has(msg.authorId) && !bannedUserIds.has(msg.authorId)) {
          const user = allUsers.find((u) => u.id === msg.authorId);
          if (user) {
            // Busca foto de check-in
            const checkInMsg = chatMessages.find(m => m.photoUrl && m.authorId === msg.authorId);

            participantsMap.set(msg.authorId, {
              id: msg.authorId,
              name: user.name || user.username,
              avatar: user.avatar || '',
              status: getParticipantStatus(msg.authorId),
              isCreator: msg.authorId === eventWithCreator.creatorId,
              checkInPhoto: checkInMsg?.photoUrl,
            });
          }
        }
      }
    });

    setParticipantsWithStatus(Array.from(participantsMap.values()));

    // O contador de participantes agora é calculado pelo backend
    // Não precisamos mais calcular localmente - confiamos no valor do backend
    // O backend já inclui usuários do chat na contagem via sanitizeEvent
  }, [authUser, allUsers, chatMessages, attendeesList, attendeeIds, canManageExpenses, isEventCreator, bannedUserIds, eventWithCreator.creatorId, ended, currentEvent.attendees, currentEvent.id, queryClient, hasCheckedIn, mediaItems]); // Added mediaItems to dependencies

  // Calcula participantes com status de check-in
  useEffect(() => {
    calculateParticipants();
  }, [calculateParticipants]);

  // Atualiza participantes periodicamente (a cada 1 segundo) para ver mudanças de status
  // Funciona sempre que o evento não acabou, não apenas quando está ativo
  useEffect(() => {
    if (!authUser || !allUsers.length || ended) return;

    const interval = setInterval(() => {
      calculateParticipants();
    }, 1000);

    return () => clearInterval(interval);
  }, [authUser, allUsers.length, ended, calculateParticipants]);

  // Salva evento no perfil quando termina (apenas para quem fez check-in)
  useEffect(() => {
    if (!authUser || !ended || isPastNonRecurring) return;

    // Verifica se o usuário fez check-in
    const userCheckedIn = chatMessages.some(
      (msg) => msg.photoUrl && (msg.authorId === authUser.id || msg.author === (authUser.name || authUser.username))
    );

    if (userCheckedIn) {
      try {
        const raw = localStorage.getItem(completedEventsKey);
        const completedEvents = raw ? (JSON.parse(raw) as number[]) : [];
        if (!completedEvents.includes(currentEvent.id)) {
          localStorage.setItem(completedEventsKey, JSON.stringify([...completedEvents, currentEvent.id]));
          // Dispara evento para atualizar o perfil
          window.dispatchEvent(new CustomEvent('konekt:event-completed', { detail: currentEvent.id }));
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [ended, isPastNonRecurring, chatMessages, authUser, currentEvent.id, completedEventsKey]);

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/event/${currentEvent.id}` : `event/${currentEvent.id}`;

  const handleParticipate = async () => {
    if (canManageExpenses) {
      setIsParticipating(true);
      return;
    }
    if (isPastNonRecurring) {
      return;
    }
    if (!authUser) {
      alert('Você precisa estar logado para participar.');
      return;
    }
    // Verifica se o usuário está bloqueado
    if (authUser && bannedUserIds.has(authUser.id)) {
      alert('Você foi removido deste evento e não pode mais participar.');
      return;
    }
    setParticipateLoading(true);
    setParticipateSuccess(false);

    try {
      // Participação no evento (com backend)
      const result = await requestJoinEventRequest(currentEvent.id);

      setParticipateLoading(false);
      setParticipateSuccess(true);
      if (result.status === 'pending') {
        setRequestSent(true);
      } else {
        // Para eventos públicos sem aprovação, o usuário recebe acesso imediato
        setIsParticipating(true);
        // Se o backend retornou o evento atualizado, usa ele
        if (result.event) {
          // setCurrentEvent(result.event as Event); // Removed: derived from query
          queryClient.setQueryData(['event', currentEvent.id], result.event);
        } else {
          // Fallback: atualiza localmente e invalida query
          queryClient.setQueryData(['event', currentEvent.id], (prev: Event | undefined) =>
            prev ? {
              ...prev,
              userStatus: undefined,
              pendingRequestIds: (prev.pendingRequestIds || []).filter((id) => id !== authUser.id)
            } : prev
          ); try {
            const raw = localStorage.getItem(participationKey);
            const ids = raw ? (JSON.parse(raw) as number[]) : [];
            if (!ids.includes(currentEvent.id)) {
              localStorage.setItem(participationKey, JSON.stringify([...ids, currentEvent.id]));
            }
            setIsStoredParticipant(true);
          } catch {
            // ignore storage errors
          }
        }
      }
      // Invalida eventos para atualizar contagem de participantes para todos
      queryClient.invalidateQueries({ queryKey: ['events'] });
      // Força atualização imediata do evento atual
      setTimeout(() => {
        const events = queryClient.getQueryData<Event[]>(['events']);
        if (events) {
          const updatedEvent = events.find((e) => e.id === currentEvent.id);
          if (updatedEvent) {
            // setCurrentEvent(updatedEvent); // Removed
          }
        }
      }, 500);
      setTimeout(() => setParticipateSuccess(false), 2000);
    } catch {
      if (authUser) {
        await ensureBackendEvent();
        try {
          const retry = await requestJoinEventRequest(currentEvent.id);
          setParticipateLoading(false);
          setParticipateSuccess(true);
          if (retry.status === 'pending') {
            setRequestSent(true);
          } else {
            setIsParticipating(true);
            // Atualiza o contador de participantes localmente
            queryClient.setQueryData(['event', currentEvent.id], (prev: Event | undefined) =>
              prev ? {
                ...prev,
                userStatus: 'attending',
                attendeeIds: [...(prev.attendeeIds || []), authUser.id],
                attendees: (prev.attendees || 0) + 1
              } : prev
            );
            try {
              const raw = localStorage.getItem(participationKey);
              const ids = raw ? (JSON.parse(raw) as number[]) : [];
              if (!ids.includes(currentEvent.id)) {
                localStorage.setItem(participationKey, JSON.stringify([...ids, currentEvent.id]));
              }
              setIsStoredParticipant(true);
            } catch {
              // ignore storage errors
            }
          }
          setTimeout(() => setParticipateSuccess(false), 2000);
          return;
        } catch {
          // ignore retry error
        }
      }
      setParticipateLoading(false);
      // Fallback local (eventos mock / offline)
      // Verifica bloqueio novamente no fallback
      if (authUser && bannedUserIds.has(authUser.id)) {
        alert('Você foi removido deste evento e não pode mais participar.');
        return;
      }
      // Para eventos públicos sem aprovação, o usuário recebe acesso imediato
      if (currentEvent.requiresApproval) {
        setRequestSent(true);
      } else {
        // Evento público: acesso imediato como participante
        setIsParticipating(true);
        // Atualiza o contador de participantes localmente
        queryClient.setQueryData(['event', currentEvent.id], (prev: Event | undefined) =>
          prev ? {
            ...prev,
            userStatus: 'attending',
            attendeeIds: [...(prev.attendeeIds || []), authUser.id],
            attendees: (prev.attendees || 0) + 1
          } : prev
        );
        if (authUser) {
          try {
            const raw = localStorage.getItem(participationKey);
            const ids = raw ? (JSON.parse(raw) as number[]) : [];
            if (!ids.includes(currentEvent.id)) {
              localStorage.setItem(participationKey, JSON.stringify([...ids, currentEvent.id]));
            }
            setIsStoredParticipant(true);
          } catch {
            // ignore storage errors
          }
        }
        // Invalida eventos para atualizar contagem de participantes para todos
        queryClient.invalidateQueries({ queryKey: ['events'] });
        // Força atualização imediata do evento atual
        setTimeout(() => {
          const events = queryClient.getQueryData<Event[]>(['events']);
          if (events) {
            const updatedEvent = events.find((e) => e.id === currentEvent.id);
            if (updatedEvent) {
              queryClient.invalidateQueries({ queryKey: ['event', currentEvent.id] });
            }
          }
        }, 500);
        setParticipateSuccess(true);
        setTimeout(() => setParticipateSuccess(false), 2000);
      }
    }
  };

  const visibilityColor = getVisibilityColor(currentEvent.visibility);

  // Verifica se o usuário está no local do evento (dentro de 100 metros)
  const isUserAtLocation = userPosition
    ? calculateDistance(
      userPosition[0],
      userPosition[1],
      currentEvent.position[0],
      currentEvent.position[1]
    ) <= 100
    : false;

  const visibilityGlow = getVisibilityGlow(currentEvent.visibility, isUserAtLocation);
  const participantLabel = authUser?.name || authUser?.username || 'Você';

  const handleAddExpense = async () => {
    if (!expenseTitle.trim() || !expenseAmount || selectedUserIds.size === 0 || !authUser) return;

    try {
      const participantsToShare = participantsWithStatus
        .filter((participant) => selectedUserIds.has(participant.id))
        .map((participant) => ({
          userId: participant.id,
          status: 'pending' as const,
        }));

      if (includeMe) {
        participantsToShare.push({
          userId: authUser.id,
          status: 'pending' as const,
        });
      }

      await addEventExpenseRequest(currentEvent.id, {
        title: expenseTitle.trim(),
        amount: parseFloat(expenseAmount),
        pixKey: expensePixKey.trim(),
        participants: participantsToShare,
      });

      setExpenseTitle('');
      setExpenseAmount('');
      setExpensePixKey('');
      setSelectedUserIds(new Set());
      setExpensesOpen(false);
      loadExpenses(); // Recarrega lista de gastos
      queryClient.invalidateQueries({ queryKey: ['events'] }); // Invalida eventos para atualizar para todos os usuários
    } catch (error) {
      console.error('Failed to add expense', error);
      alert('Erro ao adicionar gasto. Tente novamente.');
    }
  };

  return (
    <div
      className="w-full max-w-[420px] mx-auto bg-background rounded-3xl shadow-2xl relative flex flex-col h-[90vh] max-h-[90vh] overflow-hidden"
      style={{ border: `2px solid ${visibilityColor}`, boxShadow: visibilityGlow }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md border border-border"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar evento</span>
      </button>
      <div className="w-full h-[120px] relative overflow-hidden flex-shrink-0">
        <img
          src={currentEvent.image}
          alt={currentEvent.name}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute top-3 left-3 text-white px-3 py-1.5 rounded-2xl text-[12px] font-semibold flex items-center gap-1.5"
          style={{ background: visibilityColor }}
        >
          <span>{icon}</span>
          <span>{label}</span>
        </div>
        <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-2xl text-[12px] font-semibold">
          👥 {participantsWithStatus.length > 0 ? participantsWithStatus.length : (currentEvent.attendees || 0)}
        </div>
        {canManageExpenses && isActive && (() => {
          // Verifica se o usuário já fez check-in
          const hasCheckedIn = chatMessages.some(
            (msg) => msg.photoUrl && (msg.authorId === authUser?.id || msg.author === participantLabel)
          );

          if (hasCheckedIn) {
            // Se já fez check-in, mostra badge indicando
            return (
              <div className="absolute bottom-3 left-3">
                <div className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-lg flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Check-in realizado</span>
                </div>
              </div>
            );
          }

          // Se não fez check-in, mostra botão para fazer
          return (
            <div className="absolute bottom-3 left-3">
              <label className="cursor-pointer rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors flex items-center gap-2">
                <span>📸</span>
                <span>Check-in</span>
                <input
                  ref={checkInCapaInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    checkInEventRequest(currentEvent.id, file)
                      .then((result) => {
                        setChatMessages((prev) => {
                          const newMessage: ChatMessage = {
                            id: Date.now(),
                            authorId: authUser?.id || 0,
                            author: authUser?.name || authUser?.username || 'Você',
                            photoUrl: result.photoUrl,
                            createdAt: new Date().toISOString(),
                            text: 'Check-in realizado 📸',
                            isCheckIn: true,
                          } as ChatMessage;
                          return [...prev, newMessage];
                        });
                        setMediaItems((prev) => {
                          const newMedia: ChatMessage = {
                            id: Date.now(),
                            authorId: authUser?.id || 0,
                            author: authUser?.name || authUser?.username || 'Você',
                            photoUrl: result.photoUrl,
                            createdAt: new Date().toISOString(),
                            isCheckIn: true,
                          } as ChatMessage;
                          return [...prev, newMedia];
                        });
                        setHasCheckedIn(true);
                        // Salva localmente
                        try {
                          const key = `konekt_checkin_${authUser?.id}_${currentEvent.id}`;
                          localStorage.setItem(key, 'true');
                        } catch { }

                        queryClient.invalidateQueries({ queryKey: ['events'] });
                      })
                      .catch((error) => {
                        console.error('Erro ao fazer check-in:', error);
                        alert('Erro ao fazer check-in. Tente novamente.');
                      });
                  }}
                />
              </label>
            </div>
          );
        })()}
      </div>

      <div className="p-4 pb-5 flex-1 overflow-y-auto flex flex-col">
        <h2 className="m-0 mb-2 text-base font-bold text-foreground leading-tight">
          {currentEvent.name}
        </h2>
        <p className="m-0 mb-3 text-sm text-muted-foreground leading-relaxed">
          {currentEvent.description}
        </p>

        <div className="mb-4">
          <EventChips event={currentEvent} variant="popup" />
        </div>

        <Tabs defaultValue="detalhes" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="detalhes" className="flex-1">
              Detalhes
            </TabsTrigger>
            <TabsTrigger value="conversa" className="flex-1">
              <MessageCircle className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="participantes" className="flex-1">
              <Users className="w-4 h-4" />
            </TabsTrigger>
            {isEventCreator && (
              <TabsTrigger value="editar" className="flex-1">
                <Edit className="w-4 h-4" />
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="detalhes" className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-4 text-[13px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="text-base">📍</span>
                <span>{currentEvent.location}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base">📅</span>
                <span>
                  {currentEvent.date} às {timeRange || currentEvent.time}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base">🔒</span>
                <span>{getVisibilityLabel(currentEvent.visibility)}</span>
                {currentEvent.requiresApproval && <span>· requer aprovação</span>}
              </div>
            </div>

            {canManageExpenses && (
              <div className="mb-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Controle de gastos</p>
                    <p className="text-xs text-muted-foreground">
                      Divida valores e marque quem já pagou.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpensesOpen(true)}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Novo gasto
                  </button>
                </div>

                {/* Lista de gastos */}
                {(() => {
                  const myExpenses = expenses.filter((e) => e.creatorId === authUser?.id);
                  const sharedExpenses = expenses.filter((e) => e.creatorId !== authUser?.id);
                  const allExpensesToList = [...myExpenses, ...sharedExpenses];

                  if (allExpensesToList.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-4 rounded-lg text-center mt-4">
                        Nenhum gasto registrado.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-3 mt-4">
                      {allExpensesToList.map((expense) => {
                        const isCreator = expense.creatorId === authUser?.id;
                        const splitCount = (expense.participants || []).length;
                        const amountPerPerson = splitCount > 0 ? expense.amount / splitCount : 0;

                        return (
                          <div key={expense.id} className="rounded-lg border border-border p-3 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-semibold">{expense.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Total: R$ {expense.amount.toFixed(2)}
                                  {splitCount > 0 && ` • R$ ${amountPerPerson.toFixed(2)} por pessoa`}
                                </p>
                              </div>
                              {isCreator && (
                                <button
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {/* Lista de Participantes e Status */}
                            <div className="space-y-1 pt-2 border-t border-border/50">
                              {expense.participants.map((participant) => {
                                const isCurrentUser = participant.id === authUser?.id;
                                const status = participant.status || participant.paymentStatus;

                                // Correct mapping for new status system
                                // pending: User owes money (show "Mark as paid")
                                // paid_waiting_confirmation: User clicked "Mark as paid" (show "Waiting")
                                // paid: Creator confirmed (show "Paid")

                                const isPending = (status as string) === 'pending' || (status as string) === 'none';
                                const isWaiting = (status as string) === 'paid_waiting_confirmation';
                                const isPaid = (status as string) === 'paid' || (status as string) === 'approved';

                                return (
                                  <div key={participant.id} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className={isCurrentUser ? "font-semibold" : ""}>
                                        {participant.name} {isCurrentUser && '(você)'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {/* Status display */}
                                      {isPending && <span className="text-muted-foreground">Pendente</span>}
                                      {isWaiting && <span className="text-yellow-600 font-medium">Aguardando confirmação</span>}
                                      {isPaid && <span className="text-green-600 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Pago</span>}

                                      {/* Actions */}
                                      {isCurrentUser && isPending && (
                                        <button
                                          onClick={async () => {
                                            try {
                                              await updateExpenseParticipantStatusRequest(currentEvent.id, expense.id, participant.id, 'pending'); // Changed to 'pending'
                                              loadExpenses();
                                            } catch (err) {
                                              console.error('Erro ao marcar como pago', err);
                                            }
                                          }}
                                          className="px-2 py-1 bg-primary text-primary-foreground rounded text-[10px] font-semibold hover:bg-primary/90 transition-colors"
                                        >
                                          Marcar como pago
                                        </button>
                                      )}

                                      {isCreator && isWaiting && (
                                        <button
                                          onClick={async () => {
                                            try {
                                              await updateExpenseParticipantStatusRequest(currentEvent.id, expense.id, participant.id, 'paid');
                                              loadExpenses();
                                            } catch (err) {
                                              console.error('Erro ao confirmar pagamento', err);
                                            }
                                          }}
                                          className="p-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors"
                                          title="Confirmar pagamento"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {expense.pixKey && (
                              <div className="flex items-center gap-2 mt-2 bg-muted/30 p-2 rounded text-xs">
                                <span className="text-muted-foreground">PIX:</span>
                                <code className="bg-background px-1 rounded border border-border">{expense.pixKey}</code>
                                <button
                                  onClick={() => navigator.clipboard.writeText(expense.pixKey || '')}
                                  className="text-primary hover:underline ml-auto"
                                >
                                  Copiar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Botão de participar/sair - não aparece para o criador */}
            {!isEventCreator && (
              <button
                onClick={canManageExpenses ? () => {
                  // Sair do evento
                  setIsParticipating(false);
                  setIsStoredParticipant(false);
                  if (authUser) {
                    try {
                      const raw = localStorage.getItem(participationKey);
                      const ids = raw ? (JSON.parse(raw) as number[]) : [];
                      localStorage.setItem(participationKey, JSON.stringify(ids.filter((id) => id !== currentEvent.id)));
                    } catch {
                      // ignore storage errors
                    }
                  }
                  queryClient.invalidateQueries({ queryKey: ['events'] });
                } : handleParticipate}
                disabled={participateLoading || requestSent || isPastNonRecurring}
                className={`w-full text-white py-3 rounded-xl border-none cursor-pointer font-semibold text-[14px] transition-all hover:scale-[1.02] active:scale-100 disabled:opacity-70 flex items-center justify-center gap-2 mt-4 ${participateSuccess ? 'bg-green-500' : ''
                  }`}
                style={participateSuccess ? {} : canManageExpenses ? { background: '#ef4444' } : { background: visibilityColor }}
                type="button"
              >
                {participateLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{currentEvent.requiresApproval ? 'Enviando convite...' : 'Participando...'}</span>
                  </>
                ) : canManageExpenses ? (
                  <>
                    <X className="w-4 h-4" />
                    <span>Sair evento</span>
                  </>
                ) : isPastNonRecurring ? (
                  'Evento encerrado'
                ) : requestSent ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Convite enviado</span>
                  </>
                ) : participateSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Participando!</span>
                  </>
                ) : (
                  currentEvent.requiresApproval ? 'Solicitar convite' : 'Participar'
                )}
              </button>
            )}

            {/* Botão de Check-in - aparece apenas se evento está ativo e usuário está participando */}
            {isActive && isParticipating && (
              <button
                type="button"
                onClick={() => {
                  if (photoInputRef.current) {
                    photoInputRef.current.click();
                  }
                }}
                disabled={checkInLoading || hasCheckedIn}
                className={`mt-3 w-full rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${hasCheckedIn ? 'bg-green-100 text-green-700 opacity-80' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
              >
                <Camera className="w-4 h-4" />
                {hasCheckedIn ? (
                  <>
                    <Check className="w-4 h-4 ml-1" />
                    Check-in realizado
                  </>
                ) : (
                  checkInLoading ? 'Enviando...' : 'Fazer Check-in'
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const next = favoriteIds.includes(currentEvent.id)
                  ? favoriteIds.filter((id) => id !== currentEvent.id)
                  : [...favoriteIds, currentEvent.id];
                updateFavoritesRequest(next)
                  .then((result) => {
                    setFavoriteIds(result.eventIds);
                    setIsFavorite(result.eventIds.includes(currentEvent.id));
                    window.dispatchEvent(new CustomEvent('konekt:favorites-updated', { detail: result.eventIds }));
                  })
                  .catch(() => {
                    try {
                      localStorage.setItem(favoriteKey, JSON.stringify(next));
                      setFavoriteIds(next);
                      setIsFavorite(next.includes(currentEvent.id));
                      window.dispatchEvent(new CustomEvent('konekt:favorites-updated', { detail: next }));
                    } catch {
                      setIsFavorite((prev) => !prev);
                    }
                  });
              }}
              className={`mt-3 w-full rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${isFavorite ? 'bg-yellow-400 text-black' : 'bg-background text-foreground hover:bg-accent'
                }`}
            >
              <Star className="w-4 h-4" />
              {isFavorite ? 'Favoritado' : 'Favoritar'}
            </button>

            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar evento
            </button>
          </TabsContent>

          <TabsContent value="conversa" className="flex-1 overflow-y-auto flex flex-col">
            {canShowGroup ? (
              <>
                {!canManageExpenses ? (
                  <div className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
                    Entre no evento para acessar o grupo e conversar com os participantes.
                  </div>
                ) : (
                  <>
                    <div className="flex-1 mb-3 overflow-y-auto space-y-4 px-1">
                      {chatMessages.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isCheckIn = !!msg.photoUrl;
                          const isCurrentUser = msg.authorId === authUser?.id || msg.author === participantLabel;
                          const userAvatar = allUsers.find((u) => u.id === msg.authorId || u.name === msg.author)?.avatar || authUser?.avatar || '';

                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-2 ${isCurrentUser ? 'flex-row-reverse' : ''}`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (msg.authorId) {
                                    onClose();
                                    // Dispara evento para navegar para o perfil
                                    window.dispatchEvent(new CustomEvent('konekt:navigate-to-profile', { detail: msg.authorId }));
                                  }
                                }}
                                className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={userAvatar} alt={msg.author} />
                                  <AvatarFallback className="bg-muted text-muted-foreground">
                                    <UserIcon className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                              </button>
                              <div className={`flex flex-col gap-1 ${isCurrentUser ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground">{msg.author}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                {msg.text && (
                                  <div className={`rounded-2xl px-3 py-2 text-sm ${isCurrentUser
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-foreground'
                                    }`}>
                                    {msg.text}
                                  </div>
                                )}
                                {isCheckIn && (
                                  <div className="relative">
                                    <img
                                      src={msg.photoUrl}
                                      alt="Check-in"
                                      className="rounded-2xl object-cover max-w-full"
                                      style={{
                                        border: '3px solid #ea580c',
                                        boxShadow: '0 0 8px rgba(234, 88, 12, 0.4)',
                                      }}
                                    />
                                    <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                                      📸
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="flex items-end gap-2 border-t border-border pt-2">
                      <label className="cursor-pointer p-2 rounded-full hover:bg-muted transition-colors">
                        <ImageIcon className="h-5 w-5 text-foreground" />
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result !== 'string') return;
                              const photoUrl = reader.result;
                              if (photoInputRef.current) {
                                photoInputRef.current.value = '';
                              }
                              postEventChatRequest(currentEvent.id, { photoUrl, authorId: authUser?.id })
                                .then((result) => {
                                  setChatMessages(result.chat as ChatMessage[]);
                                  if (result.media) {
                                    setMediaItems(result.media as ChatMessage[]);
                                  }
                                  queryClient.invalidateQueries({ queryKey: ['events'] });
                                })
                                .catch(() => {
                                  const newMessage = {
                                    id: Date.now(),
                                    author: participantLabel,
                                    photoUrl,
                                    authorId: authUser?.id,
                                    createdAt: new Date().toISOString(),
                                  };
                                  setChatMessages((prev) => [...prev, newMessage]);
                                  setMediaItems((prev) => [...prev, newMessage]);
                                });
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Digite uma mensagem..."
                        className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && chatInput.trim() && !chatSending) {
                            e.preventDefault();
                            const text = chatInput.trim();
                            setChatSending(true);
                            setChatInput('');
                            postEventChatRequest(currentEvent.id, { text })
                              .then((result) => {
                                setChatMessages(result.chat as ChatMessage[]);
                                if (result.media) {
                                  setMediaItems(result.media as ChatMessage[]);
                                }
                                setChatSending(false);
                                queryClient.invalidateQueries({ queryKey: ['events'] });
                              })
                              .catch(() => {
                                setChatMessages((prev) => [
                                  ...prev,
                                  {
                                    id: Date.now(),
                                    author: participantLabel,
                                    text,
                                    createdAt: new Date().toISOString(),
                                  },
                                ]);
                                setChatSending(false);
                              });
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!chatInput.trim() || chatSending) return;
                          const text = chatInput.trim();
                          setChatSending(true);
                          setChatInput('');
                          postEventChatRequest(currentEvent.id, { text })
                            .then((result) => {
                              setChatMessages(result.chat as ChatMessage[]);
                              if (result.media) {
                                setMediaItems(result.media as ChatMessage[]);
                              }
                              setChatSending(false);
                              queryClient.invalidateQueries({ queryKey: ['events'] });
                            })
                            .catch(() => {
                              setChatMessages((prev) => [
                                ...prev,
                                {
                                  id: Date.now(),
                                  author: participantLabel,
                                  text,
                                  createdAt: new Date().toISOString(),
                                },
                              ]);
                              setChatSending(false);
                            });
                        }}
                        disabled={chatSending || !chatInput.trim()}
                        className="rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                      >
                        {chatSending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <MessageCircle className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
                Entre no evento para acessar o grupo e conversar com os participantes.
              </div>
            )}
          </TabsContent>

          <TabsContent value="participantes" className="flex-1 overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {participantsWithStatus.length} {participantsWithStatus.length === 1 ? 'participante' : 'participantes'}
                </p>
                {currentEvent.maxAttendees && (
                  <p className="text-xs text-muted-foreground">
                    Máximo: {currentEvent.maxAttendees}
                  </p>
                )}
              </div>
              {participantsWithStatus.length > 0 ? (
                <div className="space-y-2">
                  {participantsWithStatus.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          // Dispara evento para navegar para o perfil
                          window.dispatchEvent(new CustomEvent('konekt:navigate-to-profile', { detail: participant.id }));
                        }}
                        className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={participant.avatar} alt={participant.name} />
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            <UserIcon className="h-6 w-6" />
                          </AvatarFallback>
                        </Avatar>
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{participant.name}</p>
                          {participant.isCreator && (
                            <span className="text-[10px] text-primary font-semibold">(Criador)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {participant.status === 'presente' ? (
                            <span className="text-xs text-green-600 font-semibold">✓ Presente</span>
                          ) : (
                            <span className="text-xs text-yellow-600 font-semibold">⏳ Pendente</span>
                          )}
                        </div>
                      </div>
                      {participant.checkInPhoto && (
                        <div className="relative h-10 w-10 shrink-0">
                          <img
                            src={participant.checkInPhoto}
                            alt="Check-in"
                            className="h-full w-full rounded-lg object-cover"
                            style={{ border: '2px solid #ea580c' }}
                          />
                          <div className="absolute -bottom-1 -right-1 rounded-full bg-orange-500 p-0.5">
                            <span className="text-[8px]">📸</span>
                          </div>
                        </div>
                      )}
                      {isEventCreator && !participant.isCreator && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Tem certeza que deseja remover ${participant.name} do evento? Ele não poderá mais participar.`)) {
                              setBannedUserIds((prev) => {
                                const next = new Set(prev);
                                next.add(participant.id);
                                return next;
                              });
                              // Remove da lista de participantes
                              setParticipantsWithStatus((prev) => prev.filter((p) => p.id !== participant.id));
                              // Atualiza contador de participantes
                              queryClient.setQueryData(['event', currentEvent.id], (prev: Event | undefined) =>
                                prev ? { ...prev, attendees: Math.max(0, (prev.attendees || 0) - 1) } : prev
                              );
                              queryClient.invalidateQueries({ queryKey: ['events'] });
                            }
                          }}
                          className="flex-shrink-0 p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remover participante"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lista de participantes não disponível.
                </p>
              )}
            </div>
            {/* Galeria de Mídias do Evento */}
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Galeria do Evento
              </h3>
              {mediaItems.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
                  Nenhuma mídia compartilhada ainda.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mediaItems.map((item) =>
                    item.photoUrl ? (
                      <div key={item.id} className="relative aspect-square group cursor-pointer overflow-hidden rounded-lg bg-muted">
                        <img
                          src={item.photoUrl}
                          alt="Mídia do evento"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {isEventCreator && (
            <TabsContent value="editar" className="flex-1 overflow-y-auto">
              <div className="space-y-4">
                <p className="text-sm font-semibold text-foreground">Editar evento</p>

                {/* Trocar capa - sempre disponível */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Capa do evento</label>
                  <div className="relative">
                    <img
                      src={editImage}
                      alt="Capa do evento"
                      className="w-full h-32 object-cover rounded-lg border border-border"
                    />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-lg cursor-pointer transition-colors">
                      <div className="text-center text-white">
                        <Camera className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-xs">Trocar capa</span>
                      </div>
                      <input
                        ref={editImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                setEditImage(reader.result);
                                setEditImageFile(file);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Trocar data e hora - só antes do evento começar */}
                {!isActive && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Data e hora de início</label>
                      <input
                        type="datetime-local"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Data e hora de término</label>
                      <input
                        type="datetime-local"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}

                {isActive && (
                  <p className="text-xs text-muted-foreground">
                    Não é possível alterar data e hora após o evento ter começado.
                  </p>
                )}

                {/* Botão salvar */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!authUser) return;
                    setEditLoading(true);
                    try {
                      // Upload da imagem se houver nova
                      let imageUrl = editImage;
                      if (editImageFile) {
                        const formData = new FormData();
                        formData.append('file', editImageFile);
                        try {
                          const uploadRes = await fetch('/api/media/upload', {
                            method: 'POST',
                            headers: {
                              Authorization: `Bearer ${localStorage.getItem('token')}`,
                            },
                            body: formData,
                          });
                          if (uploadRes.ok) {
                            const uploadData = await uploadRes.json();
                            imageUrl = uploadData.url || editImage;
                          }
                        } catch {
                          // Se falhar upload, usa a imagem base64 temporária
                        }
                      }

                      // Ensure queryClient is available (it is declared above)
                      const updatedEvent = await updateEventRequest(currentEvent.id, {
                        image: imageUrl,
                        startsAt: new Date(editDate).toISOString(),
                        endsAt: new Date(editEndDate).toISOString(),
                      });

                      queryClient.setQueryData(['event', currentEvent.id], updatedEvent);
                      queryClient.invalidateQueries({ queryKey: ['events'] });
                      setEditImageFile(null);
                    } catch (error) {
                      console.error('Erro ao salvar edições:', error);
                    } finally {
                      setEditLoading(false);
                    }
                  }}
                  disabled={editLoading}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 inline-block animate-spin mr-2" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar alterações'
                  )}
                </button>

                {/* Botão excluir evento */}
                <div className="pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.')) {
                        return;
                      }
                      setDeleteLoading(true);
                      try {
                        await deleteEventRequest(currentEvent.id);
                        queryClient.setQueryData(['event', currentEvent.id], (prev: Event | undefined) =>
                          prev ? { ...prev, userStatus: 'pending', pendingRequestIds: [...(prev.pendingRequestIds || []), authUser.id] } : prev
                        ); queryClient.invalidateQueries({ queryKey: ['events'] });
                        onClose();
                      } catch (error) {
                        console.error('Erro ao excluir evento:', error);
                      } finally {
                        setDeleteLoading(false);
                      }
                    }}
                    disabled={deleteLoading}
                    className="w-full rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 inline-block animate-spin mr-2" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 inline-block mr-2" />
                        Excluir evento
                      </>
                    )}
                  </button>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Compartilhar evento"
        url={shareUrl}
      />

      {
        expensesOpen && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-2xl bg-background p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Novo gasto</h3>
                <button
                  type="button"
                  onClick={() => setExpensesOpen(false)}
                  className="text-xs text-muted-foreground"
                >
                  Fechar
                </button>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Descrição</label>
                  <input
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Ex: Bebidas"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor</label>
                  <input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Chave PIX (opcional)</label>
                  <input
                    value={expensePixKey}
                    onChange={(e) => setExpensePixKey(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="CPF, Email, ou Aleatória"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-muted-foreground">Dividir com</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedUserIds.size === participantsWithStatus.length) {
                          setSelectedUserIds(new Set());
                        } else {
                          setSelectedUserIds(new Set(participantsWithStatus.map((p) => p.id)));
                        }
                      }}
                      className="text-xs text-primary font-semibold"
                    >
                      {selectedUserIds.size === participantsWithStatus.length ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <div className="max-h-[150px] overflow-y-auto space-y-2 rounded-lg border border-border p-2">
                    {participantsWithStatus.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Nenhum participante para dividir.
                      </p>
                    ) : (
                      participantsWithStatus.map((participant) => (
                        <label
                          key={participant.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(participant.id)}
                            onChange={() => {
                              setSelectedUserIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(participant.id)) {
                                  next.delete(participant.id);
                                } else {
                                  next.add(participant.id);
                                }
                                return next;
                              });
                            }}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={participant.avatar} />
                            <AvatarFallback className="text-[10px]">
                              {participant.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm flex-1 truncate">{participant.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pb-2">
                  <input
                    id="include-me"
                    type="checkbox"
                    checked={includeMe}
                    onChange={(e) => setIncludeMe(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="include-me" className="text-sm cursor-pointer select-none text-foreground">
                    Incluir-me na divisão
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleAddExpense}
                  disabled={!expenseTitle || !expenseAmount || selectedUserIds.size === 0}
                  className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Adicionar gasto
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}


