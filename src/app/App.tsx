import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Login } from './features/auth/Login';
import { Feed } from './features/feed/Feed';
import { EventMap } from './features/map/EventMap';
import { ProfileView } from './features/profile/ProfileView';
import { SearchView } from './features/search/SearchView';
import { BottomNav } from './components/layout/BottomNav';
import { View } from './types';
import { useGetNotifications } from './hooks/useGetNotifications';

const queryClient = new QueryClient();

function Main() {
  const { isAuthenticated } = useAuth();
  const [currentView, setCurrentView] = useState<View>('map');
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);
  const { data: notifications } = useGetNotifications();
  const unreadCount = notifications?.filter((n) => n.unread).length || 0;

  // Listener para navegar para perfil de outro usuário
  useEffect(() => {
    const handleNavigateToProfile = (e: CustomEvent<number>) => {
      setViewingUserId(e.detail);
      setCurrentView('profile');
    };

    window.addEventListener('konekt:navigate-to-profile', handleNavigateToProfile as EventListener);
    return () => {
      window.removeEventListener('konekt:navigate-to-profile', handleNavigateToProfile as EventListener);
    };
  }, []);

  // Se não estiver autenticado, mostra a tela de login
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden">
        {currentView === 'feed' && <Feed />}
        {currentView === 'map' && (
          <EventMap
            unreadCount={unreadCount}
            initialNotificationsOpen={false}
          />
        )}
        {currentView === 'profile' && <ProfileView viewingUserId={viewingUserId} onBack={() => { setViewingUserId(null); }} />}
        {currentView === 'search' && (
          <SearchView
            onBack={() => setCurrentView('map')}
            onNavigateToProfile={(userId) => {
              setViewingUserId(userId);
              setCurrentView('profile');
            }}
            onNavigateToEvent={(eventId) => {
              // Navegar para o evento no mapa
              setCurrentView('map');
              // Disparar evento customizado para focar no evento
              window.dispatchEvent(new CustomEvent('konekt:focus-event', { detail: eventId }));
            }}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav currentView={currentView} onViewChange={setCurrentView} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
      <Main />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
