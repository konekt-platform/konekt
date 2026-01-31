import { Event } from '../../../types';

export const getVisibilityLabel = (visibility: Event['visibility']) => {
  switch (visibility) {
    case 'public':
      return 'Público';
    case 'friends':
      return 'Amigos';
    case 'invite-only':
      return 'Somente convite';
  }
};

export const getVisibilityColor = (visibility: Event['visibility']) => {
  // Cor principal usada para bordas de cards/markers
  switch (visibility) {
    case 'public':
      // Verde com mais destaque
      return '#22c55e';
    case 'friends':
      // Azul para visibilidade de amigos
      return '#3b82f6';
    case 'invite-only':
    default:
      // Cinza para eventos privados / somente convite
      return '#9ca3af';
  }
};

export const getVisibilityGlow = (visibility: Event['visibility'], isUserAtLocation = false) => {
  // Se o usuário estiver no local do evento, aplica glow laranja forte
  if (isUserAtLocation) {
    return '0 0 30px rgba(234, 88, 12, 0.8), 0 0 50px rgba(234, 88, 12, 0.5), 0 4px 12px rgba(0, 0, 0, 0.15)';
  }
  
  // Box-shadow (glow) baseado na visibilidade
  switch (visibility) {
    case 'public':
      // Verde com glow forte para público
      return '0 0 20px rgba(34, 197, 94, 0.4), 0 4px 12px rgba(0, 0, 0, 0.15)';
    case 'friends':
      // Azul com glow para amigos
      return '0 0 16px rgba(59, 130, 246, 0.3), 0 4px 12px rgba(0, 0, 0, 0.15)';
    case 'invite-only':
    default:
      // Cinza com glow discreto para privado
      return '0 0 8px rgba(156, 163, 175, 0.2), 0 4px 12px rgba(0, 0, 0, 0.15)';
  }
};

export const getGenderFocusLabel = (genderFocus: Event['genderFocus']) => {
  switch (genderFocus) {
    case 'women':
      return 'Para mulheres';
    case 'men':
      return 'Para homens';
    case 'lgbt':
      return 'LGBTQIA+';
    case 'all':
      return 'Para todos';
  }
};

