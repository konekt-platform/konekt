import { useQuery } from "@tanstack/react-query";
import { getEventsRequest } from "../services/api/events";
import { Event } from "../types";

export const useGetEvents = () => {
  return useQuery<Event[]>({
    queryKey: ["events"],
    queryFn: getEventsRequest,
    refetchInterval: (query) => {
      // Pausar polling quando a aba está inativa
      if (typeof document !== "undefined" && document.hidden) {
        return false;
      }
      return 5000; // Polling a cada 1 segundo quando ativo
    },
    refetchIntervalInBackground: false, // Não fazer polling em background
    refetchOnWindowFocus: true, // Atualiza quando a janela ganha foco
    refetchOnReconnect: true, // Atualiza quando reconecta
    staleTime: 2000, // Considera os dados stale após 500ms para permitir atualizações locais
    gcTime: 5 * 60 * 1000, // Mantém cache por 5 minutos
    retry: (failureCount, error) => {
      // Retry com backoff exponencial
      if (failureCount < 3) {
        return true;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff: 1s, 2s, 4s, até 30s
  });
};
