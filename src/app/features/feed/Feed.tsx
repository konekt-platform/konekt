import { useGetPosts } from '../../hooks/useGetPosts';
import { useGetEvents } from '../../hooks/useGetEvents';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PostCard } from './PostCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { Search, UserPlus, X } from 'lucide-react';
import { searchUsersRequest, toggleFollowRequest } from '../../services/api/users';
import { User } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { hasEventEnded } from '../map/utils/eventSchedule';
import { getEventMediaRequest } from '../../services/api/events';

export function Feed() {
  const { data: posts, isLoading, error } = useGetPosts();
  const { data: events } = useGetEvents();
  const { user: authUser, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'events' | 'friends' | 'foryou'>('events');
  const PAGE_SIZE = 6;
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [eventMediaMap, setEventMediaMap] = useState<Record<number, string[]>>({});
  const [visibleCounts, setVisibleCounts] = useState({
    events: PAGE_SIZE,
    friends: PAGE_SIZE,
    foryou: PAGE_SIZE,
  });

  const allPosts = posts ?? [];

  // Posts oficiais de eventos (sem autor ou com isEventPost = true)
  const eventPosts = allPosts.filter(
    (post) => !post.author || post.isEventPost === true,
  );
  const pastEventPosts = eventPosts.filter((post) => {
    const matchingEvent = events?.find(
      (event) =>
        event.name === post.event.name &&
        event.location === post.event.location,
    );
    if (!matchingEvent) return true;
    return hasEventEnded(matchingEvent);
  });

  // Posts de amigos / do próprio usuário (com autor e não é post oficial)
  const followingIds = authUser?.followingIds ?? [];
  const friendsPosts = allPosts.filter((post) => {
    if (!post.author || post.isEventPost === true) return false;
    if (post.author.id === authUser?.id) return true;
    return followingIds.includes(post.author.id);
  });

  // Para você: posts de usuários que você ainda não segue
  const forYouPosts = allPosts.filter((post) => {
    if (!post.author) return false;
    if (post.author.id === authUser?.id) return false;
    return !followingIds.includes(post.author.id);
  });

  const totalByTab = useMemo(
    () => ({
      events: pastEventPosts.length,
      friends: friendsPosts.length,
      foryou: forYouPosts.length,
    }),
    [pastEventPosts.length, friendsPosts.length, forYouPosts.length],
  );

  const handleLoadMore = useCallback(() => {
    setVisibleCounts((prev) => {
      const limit = totalByTab[activeTab];
      if (prev[activeTab] >= limit) return prev;
      return {
        ...prev,
        [activeTab]: Math.min(prev[activeTab] + PAGE_SIZE, limit),
      };
    });
  }, [activeTab, totalByTab]);

  const canLoadMore = visibleCounts[activeTab] < totalByTab[activeTab];
  const loadMoreRef = useInfiniteScroll({ enabled: canLoadMore, onLoadMore: handleLoadMore });

  const visibleEventPosts = pastEventPosts.slice(0, visibleCounts.events);
  const visibleFriendsPosts = friendsPosts.slice(0, visibleCounts.friends);
  const visibleForYouPosts = forYouPosts.slice(0, visibleCounts.foryou);
  const publicEvents = useMemo(
    () => (events ?? []).filter((event) => event.visibility === 'public'),
    [events],
  );
  const forYouUsers = useMemo(() => {
    const baseUsers = allUsers.filter((user) => user.id !== authUser?.id);
    const followingSet = new Set(authUser?.followingIds ?? []);
    const newUsers = baseUsers.filter((user) => !followingSet.has(user.id));
    const city = authUser?.city?.trim().toLowerCase();
    const sameCity = city
      ? newUsers.filter((user) => (user.city ?? '').trim().toLowerCase() === city)
      : newUsers;
    const pool = city && sameCity.length > 0 ? sameCity : newUsers;
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [allUsers, authUser?.id, authUser?.followingIds, authUser?.city, shuffleSeed]);

  useEffect(() => {
    const query = userQuery.trim();
    if (query.length < 2) {
      setUserResults([]);
      setIsSearching(false);
      return;
    }
    const handle = setTimeout(async () => {
      setIsSearching(true);
      try {
        const users = await searchUsersRequest(query);
        setUserResults(users);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [userQuery]);

  useEffect(() => {
    const loadUsers = async () => {
      const users = await searchUsersRequest('');
      setAllUsers(users);
    };
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab !== 'foryou') return;
    setShuffleSeed(Date.now());
  }, [activeTab, allUsers.length]);

  useEffect(() => {
    if (!events?.length || pastEventPosts.length === 0) return;
    const neededIds = pastEventPosts
      .map((post) => events.find(
        (event) =>
          event.name === post.event.name &&
          event.location === post.event.location,
      )?.id)
      .filter((id): id is number => typeof id === 'number');

    const missing = Array.from(new Set(neededIds)).filter((id) => !eventMediaMap[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (eventId) => {
        try {
          const media = await getEventMediaRequest(eventId);
          return { eventId, urls: media.map((item) => item.photoUrl).filter(Boolean) };
        } catch {
          return { eventId, urls: [] };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setEventMediaMap((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          next[result.eventId] = result.urls;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [events, pastEventPosts, eventMediaMap]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-destructive">Erro ao carregar posts.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Tabs de feed: eventos, amigos, para você */}
      <Tabs
        defaultValue="events"
        className="w-full"
        onValueChange={(value) => setActiveTab(value as 'events' | 'friends' | 'foryou')}
      >
        {/* Barra de seleção fixa no topo durante o scroll */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pt-3 pb-2">
          <TabsList className="mx-auto w-full max-w-md px-3">
            <TabsTrigger value="events" className="flex-1">
              Publicações de eventos
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex-1">
              Posts de amigos
            </TabsTrigger>
            <TabsTrigger value="foryou" className="flex-1">
              Para você
            </TabsTrigger>
          </TabsList>
          <div className="mx-auto mt-3 max-w-md px-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Pesquisar usuário pelo username"
              className="w-full pl-9 pr-9 py-2 rounded-full border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {userQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setUserQuery('');
                  setUserResults([]);
                  setIsSearching(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {userQuery.trim().length > 0 && (
          <div className="mx-auto mt-3 max-w-md rounded-2xl border border-border bg-card p-3">
            {isSearching ? (
              <p className="text-xs text-muted-foreground">Procurando usuários...</p>
            ) : userResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : (
              <div className="space-y-2">
                {userResults.map((user) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-8 w-8 rounded-full object-cover border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">@{user.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('konekt:navigate-to-profile', { detail: user.id }));
                      }}
                      className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-1 flex-shrink-0"
                    >
                      <UserPlus className="h-3 w-3" />
                      Ver perfil
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Publicações oficiais de eventos */}
        <TabsContent value="events">
          <div className="pb-20">
            {pastEventPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Ainda não há publicações de eventos.
              </p>
            ) : (
              <div className="mx-auto max-w-md">
                {visibleEventPosts.map((post) => {
                  const matchingEvent = events?.find(
                    (event) =>
                      event.name === post.event.name &&
                      event.location === post.event.location,
                  );
                  const description = matchingEvent?.description ?? post.caption;
                  const eventMedia = matchingEvent ? eventMediaMap[matchingEvent.id] ?? [] : [];
                  const combined = [
                    ...(post.images ?? []),
                    post.image,
                    matchingEvent?.image,
                    ...eventMedia,
                  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
                  const images = Array.from(new Set(combined));
                  const postWithImages = images.length > 0 ? { ...post, images } : post;
                  return <PostCard key={post.id} post={postWithImages} description={description} />;
                })}
              </div>
            )}
            {activeTab === 'events' && canLoadMore && (
              <div ref={loadMoreRef} className="h-8" />
            )}
          </div>
        </TabsContent>

        {/* Posts de amigos / usuário */}
        <TabsContent value="friends">
          <div className="pb-20">
            {friendsPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Ainda não há posts seus ou de amigos.
              </p>
            ) : (
              <div className="w-full">
                {visibleFriendsPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    description={post.caption}
                    onUserClick={(userId) => {
                      const user = userResults.find((u) => u.id === userId) || post.author || null;
                      setSelectedUser(user);
                    }}
                  />
                ))}
              </div>
            )}
            {activeTab === 'friends' && canLoadMore && (
              <div ref={loadMoreRef} className="h-8" />
            )}
          </div>
        </TabsContent>

        {/* Para você (espaço para ads e recomendações) */}
        <TabsContent value="foryou">
          <div className="pb-20">
            <div className="mx-auto mt-2 mb-4 max-w-md rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Usuários para você</p>
                <button
                  type="button"
                  onClick={() => setShuffleSeed(Date.now())}
                  className="text-xs text-primary hover:opacity-80"
                >
                  Ver novos
                </button>
              </div>
              <div className="space-y-2">
                {forYouUsers.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-8 w-8 rounded-full object-cover border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('konekt:navigate-to-profile', { detail: user.id }));
                      }}
                      className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors flex-shrink-0"
                    >
                      Ver perfil
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {forYouPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nada por aqui ainda. Em breve recomendações para você.
              </p>
            ) : (
              <>
                <div className="mx-auto max-w-md">
                  {visibleForYouPosts.map((post, index) => {
                    // Determina a descrição baseado no tipo de post
                    const isUserPost = post.author && !post.isEventPost;
                    const matchingEvent = events?.find(
                      (event) =>
                        event.name === post.event.name &&
                        event.location === post.event.location,
                    );
                    const description = isUserPost
                      ? post.caption
                      : matchingEvent?.description ?? post.caption;

                    return (
                      <div key={post.id}>
                        <PostCard
                          post={post}
                          description={description}
                          onUserClick={(userId) => {
                            const user = userResults.find((u) => u.id === userId) || post.author || null;
                            setSelectedUser(user);
                          }}
                        />
                        {/* Espaço para anúncios / recomendações patrocinadas a cada 3 posts */}
                        {(index + 1) % 3 === 0 && (
                          <div className="my-4 rounded-2xl border border-dashed border-border bg-muted/60 p-4 text-xs text-muted-foreground text-center">
                            Espaço reservado para anúncios e recomendações personalizadas.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {activeTab === 'foryou' && canLoadMore && (
              <div ref={loadMoreRef} className="h-8" />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {selectedUser && (
            <>
              <DialogHeader>
                <DialogTitle>Perfil de @{selectedUser.username}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedUser.avatar}
                    alt={selectedUser.name}
                    className="h-12 w-12 rounded-full object-cover border border-border"
                  />
                  <div className="flex-1">
                    <p className="text-base font-semibold text-foreground">{selectedUser.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Seguindo: {selectedUser.following ?? 0} · Seguidores: {selectedUser.followers ?? 0}
                    </p>
                  </div>
                  {authUser && authUser.id !== selectedUser.id && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (followLoading) return;
                        setFollowLoading(true);
                        try {
                          const result = await toggleFollowRequest(selectedUser.id);
                          setSelectedUser(result.user);
                          setAllUsers((prev) =>
                            prev.map((user) => (user.id === result.user.id ? result.user : user)),
                          );
                          setUserResults((prev) =>
                            prev.map((user) => (user.id === result.user.id ? result.user : user)),
                          );
                          updateUser(result.me);
                        } finally {
                          setFollowLoading(false);
                        }
                      }}
                      className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold disabled:opacity-60"
                      disabled={followLoading}
                    >
                      {authUser.followingIds?.includes(selectedUser.id) ? 'Seguindo' : 'Seguir'}
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Seguindo</p>
                  {selectedUser.followingIds?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {allUsers
                        .filter((user) => selectedUser.followingIds?.includes(user.id))
                        .map((user) => (
                          <span
                            key={user.id}
                            className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
                          >
                            @{user.username}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem seguindo no momento.</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">
                    Eventos públicos
                  </p>
                  {publicEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem eventos públicos.</p>
                  ) : (
                    <div className="space-y-2">
                      {publicEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-card p-2"
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
                              {event.location} · {event.date} {event.time}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
