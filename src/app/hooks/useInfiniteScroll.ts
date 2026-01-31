import { useEffect, useRef } from 'react';

interface InfiniteScrollOptions {
  enabled: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}

export function useInfiniteScroll({ enabled, onLoadMore, rootMargin = '200px' }: InfiniteScrollOptions) {
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const node = targetRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onLoadMore, rootMargin]);

  return targetRef;
}

