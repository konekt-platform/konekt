import { useQuery } from '@tanstack/react-query';
import { getEventRequest } from '../services/api/events';
import { Event } from '../types';

export const useGetEvent = (eventId: number, initialData?: Event) => {
    return useQuery<Event>({
        queryKey: ['event', eventId],
        queryFn: () => getEventRequest(eventId),
        initialData,
        refetchInterval: (query) => {
            if (query.state.status === 'error') return false;
            return 1000;
        },
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1, // Limit retries on failure
    });
};
