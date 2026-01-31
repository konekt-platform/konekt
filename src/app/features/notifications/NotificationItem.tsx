import { MessageCircle, Users, MapPin, Calendar, X, Check } from 'lucide-react';
import { Notification } from '../../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markAsReadRequest, removeNotificationRequest } from '../../services/api/notifications';
import { acceptFriendRequest, rejectFriendRequest } from '../../services/api/users';
import { useAuth } from '../../contexts/AuthContext';

interface NotificationItemProps {
  notification: Notification;
}

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'comment':
      return <MessageCircle className="w-4 h-4 text-chart-2" />;
    case 'connection':
      return <Users className="w-4 h-4 text-chart-1" />;
    case 'event':
      return <MapPin className="w-4 h-4 text-chart-4" />;
    case 'reminder':
      return <Calendar className="w-4 h-4 text-chart-3" />;
  }
};

export function NotificationItem({ notification }: NotificationItemProps) {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  const markAsReadMutation = useMutation({
    mutationFn: () => markAsReadRequest(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeNotificationRequest(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const acceptFriendMutation = useMutation({
    mutationFn: () => {
      if (!notification.userId) throw new Error('User ID not found');
      return acceptFriendRequest(notification.userId);
    },
    onSuccess: (data) => {
      // Atualiza o usuário autenticado
      if (data.me) {
        updateUser({
          followingIds: data.me.followingIds,
          followerIds: data.me.followerIds,
        });
      }
      // Apenas marca como lida, não remove
      if (notification.unread) {
        markAsReadMutation.mutate();
      }
      // Atualiza notificações e usuário
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const rejectFriendMutation = useMutation({
    mutationFn: () => {
      if (!notification.userId) throw new Error('User ID not found');
      return rejectFriendRequest(notification.userId);
    },
    onSuccess: () => {
      // Apenas marca como lida, não remove
      if (notification.unread) {
        markAsReadMutation.mutate();
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleClick = () => {
    if (notification.unread) {
      markAsReadMutation.mutate();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeMutation.mutate();
  };

  return (
    <div
      onClick={handleClick}
      className={`px-4 py-4 border-b border-border hover:bg-accent transition-colors cursor-pointer relative ${
        notification.unread ? 'bg-accent' : ''
      }`}
    >
      <div className="flex gap-3">
        {/* Avatar or Icon */}
        <div className="flex-shrink-0">
          {notification.avatar ? (
            <img
              src={notification.avatar}
              alt={notification.user}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              {getNotificationIcon(notification.type)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            {notification.user && <span className="text-foreground">{notification.user} </span>}
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>

          {/* Connection Request Actions */}
          {notification.type === 'connection' && notification.unread && notification.userId && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  acceptFriendMutation.mutate();
                }}
                disabled={acceptFriendMutation.isPending || rejectFriendMutation.isPending}
                className="flex-1 bg-primary text-primary-foreground text-xs py-2 px-3 rounded-lg hover:opacity-90 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {acceptFriendMutation.isPending ? (
                  <>
                    <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    <span>Aceitando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Aceitar</span>
                  </>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  rejectFriendMutation.mutate();
                }}
                disabled={acceptFriendMutation.isPending || rejectFriendMutation.isPending}
                className="flex-1 bg-muted text-foreground text-xs py-2 px-3 rounded-lg hover:bg-accent transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rejectFriendMutation.isPending ? 'Recusando...' : 'Recusar'}
              </button>
            </div>
          )}
        </div>

        {/* Unread Indicator */}
        {notification.unread && (
          <div className="flex-shrink-0">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
          </div>
        )}

        {/* Remove Button */}
        <button
          onClick={handleRemove}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          type="button"
          aria-label="Remover notificação"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
