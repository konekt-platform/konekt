import { Bell, X } from 'lucide-react';
import { useGetNotifications } from '../../hooks/useGetNotifications';
import { NotificationItem } from './NotificationItem';

interface NotificationPanelProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, isCollapsed, onClose }: NotificationPanelProps) {
  const { data: notifications } = useGetNotifications();
  const unreadCount = notifications?.filter((n) => n.unread).length || 0;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-[1150] lg:hidden" onClick={onClose} />}

      {/* Panel */}
      <div
        className={`
        fixed inset-0 z-[1200] flex items-start justify-center px-4 pt-24 pb-6
        ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}
      `}
      >
        <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border flex flex-col max-h-[75vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-6 border-b border-border bg-gradient-to-br from-background to-card">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-6 h-6 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-primary">Notificações</h2>
              <p className="text-xs text-muted-foreground">{unreadCount} novas</p>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-accent rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {notifications?.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted">
          <button className="w-full text-center text-sm text-primary hover:opacity-90 py-2">
            Ver todas as notificações
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
