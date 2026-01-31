import { User, PrivacySettings } from '../../types';
import { apiFetch } from './client';

// Usuários mockados para popular o feed
export const mockUsers: User[] = [
  {
    id: 1,
    username: 'fabiano_silva',
    name: 'Fabiano Silva',
    avatar: 'https://i.pravatar.cc/150?img=50',
    bio: 'Desenvolvedor e entusiasta de eventos',
    followers: 234,
    following: 189,
  },
  {
    id: 2,
    username: 'ana_tech',
    name: 'Ana Silva',
    avatar: 'https://i.pravatar.cc/150?img=1',
    bio: 'Tech enthusiast | AI & Web3',
    followers: 567,
    following: 312,
  },
  {
    id: 3,
    username: 'carlos_dev',
    name: 'Carlos Oliveira',
    avatar: 'https://i.pravatar.cc/150?img=3',
    bio: 'Full Stack Developer',
    followers: 445,
    following: 278,
  },
  {
    id: 4,
    username: 'beatriz_santos',
    name: 'Beatriz Santos',
    avatar: 'https://i.pravatar.cc/150?img=5',
    bio: 'Designer & Creative',
    followers: 892,
    following: 456,
  },
  {
    id: 5,
    username: 'rafael_costa',
    name: 'Rafael Costa',
    avatar: 'https://i.pravatar.cc/150?img=7',
    bio: 'Cyclist & Adventure seeker',
    followers: 678,
    following: 423,
  },
  {
    id: 6,
    username: 'mariana_lima',
    name: 'Mariana Lima',
    avatar: 'https://i.pravatar.cc/150?img=9',
    bio: 'Fitness & Wellness',
    followers: 1234,
    following: 567,
  },
  {
    id: 7,
    username: 'joao_pedro',
    name: 'João Pedro',
    avatar: 'https://i.pravatar.cc/150?img=12',
    bio: 'Music lover 🎵',
    followers: 789,
    following: 345,
  },
  {
    id: 8,
    username: 'fernanda_rocha',
    name: 'Fernanda Rocha',
    avatar: 'https://i.pravatar.cc/150?img=23',
    bio: 'Yoga instructor & Mindfulness',
    followers: 1567,
    following: 678,
  },
  {
    id: 9,
    username: 'lucas_almeida',
    name: 'Lucas Almeida',
    avatar: 'https://i.pravatar.cc/150?img=14',
    bio: 'Foodie & Chef',
    followers: 2345,
    following: 890,
  },
  {
    id: 10,
    username: 'camila_torres',
    name: 'Camila Torres',
    avatar: 'https://i.pravatar.cc/150?img=16',
    bio: 'Fitness coach 💪',
    followers: 3456,
    following: 1234,
  },
  {
    id: 11,
    username: 'pedro_henrique',
    name: 'Pedro Henrique',
    avatar: 'https://i.pravatar.cc/150?img=18',
    bio: 'Runner & Marathoner',
    followers: 987,
    following: 456,
  },
  {
    id: 12,
    username: 'julia_martins',
    name: 'Julia Martins',
    avatar: 'https://i.pravatar.cc/150?img=20',
    bio: 'Swimmer & Water sports',
    followers: 1123,
    following: 567,
  },
  {
    id: 13,
    username: 'diego_silva',
    name: 'Diego Silva',
    avatar: 'https://i.pravatar.cc/150?img=33',
    bio: 'Crossfit athlete',
    followers: 1456,
    following: 678,
  },
  {
    id: 14,
    username: 'thiago_santos',
    name: 'Thiago Santos',
    avatar: 'https://i.pravatar.cc/150?img=52',
    bio: 'Developer & Coffee addict ☕',
    followers: 234,
    following: 189,
  },
  {
    id: 15,
    username: 'amanda_costa',
    name: 'Amanda Costa',
    avatar: 'https://i.pravatar.cc/150?img=45',
    bio: 'Meditation & Wellness',
    followers: 1789,
    following: 789,
  },
];

export const getMockUsers = (): User[] => mockUsers;

export const getUserById = (id: number): User | undefined => {
  return mockUsers.find((user) => user.id === id);
};

export const getUserByUsername = (username: string): User | undefined => {
  return mockUsers.find((user) => user.username === username);
};

export const searchUsersRequest = async (query: string): Promise<User[]> => {
  try {
    return await apiFetch<User[]>(`/users?search=${encodeURIComponent(query)}`);
  } catch {
    const q = query.toLowerCase();
    return mockUsers.filter((user) => user.username.toLowerCase().includes(q));
  }
};

export const getUserRequest = async (id: number): Promise<User> => {
  return apiFetch<User>(`/users/${id}`);
};

export const toggleFollowRequest = async (userId: number): Promise<{ me: User; user: User; isFollowing: boolean }> => {
  return apiFetch<{ me: User; user: User; isFollowing: boolean }>(`/users/${userId}/follow`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const getFavoritesRequest = async (): Promise<{ eventIds: number[] }> => {
  return apiFetch<{ eventIds: number[] }>('/users/me/favorites');
};

export const updateFavoritesRequest = async (eventIds: number[]): Promise<{ eventIds: number[] }> => {
  return apiFetch<{ eventIds: number[] }>('/users/me/favorites', {
    method: 'PUT',
    body: JSON.stringify({ eventIds }),
  });
};

export const updateMeRequest = async (updates: Partial<User>): Promise<User> => {
  return apiFetch<User>('/users/me', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

export const changePasswordRequest = async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
  return apiFetch<{ ok: boolean; message?: string; error?: string }>('/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};

export const uploadAvatarRequest = async (file: File): Promise<{ avatar: string; user: User }> => {
  const formData = new FormData();
  formData.append('avatar', file);

  const API_URL = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL || 'http://localhost:3000';
  const token = localStorage.getItem('konekt_token');

  const res = await fetch(`${API_URL}/users/me/avatar`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Falha ao enviar avatar' }));
    throw new Error(errorData.error || 'Falha ao enviar avatar');
  }

  return res.json();
};

export const getPrivacySettingsRequest = async (): Promise<PrivacySettings> => {
  return apiFetch<PrivacySettings>('/users/me/privacy');
};

export const updatePrivacySettingsRequest = async (settings: Partial<PrivacySettings>): Promise<PrivacySettings> => {
  return apiFetch<PrivacySettings>('/users/me/privacy', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
};

export const blockUserRequest = async (userId: number): Promise<{ ok: boolean; message: string }> => {
  return apiFetch<{ ok: boolean; message: string }>(`/users/${userId}/block`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const unblockUserRequest = async (userId: number): Promise<{ ok: boolean; message: string }> => {
  return apiFetch<{ ok: boolean; message: string }>(`/users/${userId}/unblock`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const getFriendsRequest = async (): Promise<User[]> => {
  return apiFetch<User[]>('/users/me/friends');
};

// Aceitar solicitação de amizade
export const acceptFriendRequest = async (userId: number): Promise<{ me: User; user: User }> => {
  try {
    return await apiFetch<{ me: User; user: User }>(`/users/${userId}/accept-friend`, {
      method: 'POST',
    });
  } catch {
    // Fallback para mock
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    // Atualiza localmente
    const raw = localStorage.getItem('konekt_user');
    if (raw) {
      const me = JSON.parse(raw) as User;
      const followingIds = me.followingIds || [];
      const followerIds = me.followerIds || [];

      if (!followingIds.includes(userId)) {
        followingIds.push(userId);
      }
      if (!followerIds.includes(userId)) {
        followerIds.push(userId);
      }

      const updatedMe = { ...me, followingIds, followerIds };
      localStorage.setItem('konekt_user', JSON.stringify(updatedMe));

      return { me: updatedMe, user };
    }

    throw new Error('User not found');
  }
};

// Rejeitar solicitação de amizade
export const rejectFriendRequest = async (userId: number): Promise<void> => {
  try {
    await apiFetch(`/users/${userId}/reject-friend`, {
      method: 'POST',
    });
  } catch {
    // Fallback para mock - apenas remove a notificação
    // A lógica de rejeição pode ser implementada aqui se necessário
  }
};


