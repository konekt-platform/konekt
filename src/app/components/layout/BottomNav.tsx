import { Home, MapPin, User } from 'lucide-react';
import { View } from '../../types';

interface BottomNavProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export function BottomNav({ currentView, onViewChange }: BottomNavProps) {
  return (
    <nav className="border-t border-border bg-background/95 backdrop-blur-lg lg:pr-80 relative">
      <div className="flex items-center justify-around px-4 py-1">
        <button
          type="button"
          onClick={() => onViewChange('feed')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl transition-all text-[11px] shadow-md hover:shadow-lg ${
            currentView === 'feed'
              ? 'bg-accent text-accent-foreground'
              : 'bg-background text-muted-foreground hover:text-primary'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px]">Feed</span>
        </button>

        {/* Botão de eventos destacado no centro */}
        <div className="relative flex items-center justify-center">
        <button
            type="button"
          onClick={() => onViewChange('map')}
            className={`flex items-center justify-center h-16 w-16 rounded-full transition-all shadow-xl hover:shadow-2xl z-10 -translate-y-4 ${
              currentView === 'map'
                ? 'bg-primary text-primary-foreground scale-110'
                : 'bg-primary text-primary-foreground hover:scale-105'
          }`}
        >
            <MapPin className="w-7 h-7" />
        </button>
        </div>

        <button
          type="button"
          onClick={() => onViewChange('profile')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl transition-all text-[11px] shadow-md hover:shadow-lg ${
            currentView === 'profile'
              ? 'bg-accent text-accent-foreground'
              : 'bg-background text-muted-foreground hover:text-primary'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[11px]">Perfil</span>
        </button>
      </div>
    </nav>
  );
}
