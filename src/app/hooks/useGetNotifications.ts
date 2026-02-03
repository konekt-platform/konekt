import { useQuery } from "@tanstack/react-query";
import { getNotificationsRequest } from "../services/api/notifications";
import { Notification } from "../types";

export const useGetNotifications = () => {
  return useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: getNotificationsRequest,
    refetchInterval: (query) => {
      // Pausar polling quando a aba está inativa
      if (typeof document !== "undefined" && document.hidden) {
        return false;
      }
      return 5000; // Polling a cada 5 segundos
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
};
