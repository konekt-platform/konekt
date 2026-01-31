# Konekt Project Guidelines

These guidelines are designed to ensure consistency, maintainability, and high quality across the Konekt codebase.

## 🛠 Tech Stack
- **Framework**: React 18+ (Vite)
- **Language**: TypeScript (Strict mode)
- **Styling**: Tailwind CSS v4
- **UI Components**: Shadcn UI (Radix Primitives)
- **State Management**: TanStack Query (Server state), Context/Zustand (Client state as needed)
- **Maps**: React Leaflet
- **Icons**: Lucide React

## 📂 Project Structure

Follow a **feature-based** architecture. Group code by domain feature rather than by technical type (e.g., components/hooks/utils).

```text
src/
├── app/
│   ├── components/      # Shared UI components (generic)
│   ├── features/        # Feature-specific code
│   │   ├── map/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── types.ts
│   │   └── auth/
│   └── layouts/
├── assets/
├── hooks/               # Global shared hooks
├── lib/                 # Utility libraries configuration (utils.ts, axios.ts)
├── services/            # API definitions
├── styles/              # Global styles
└── types/               # Global type definitions
```

## 📝 Coding Standards

### TypeScript
- **NO `any`**: Explicitly define types. Use `unknown` if the type is truly uncertain and narrow it down.
- **Interfaces vs Types**: Use `type` for unions/intersections and `interface` for object shapes that might be extended.
- **Props**: Define component props as `Props` or `[ComponentName]Props`.

### Components
- **Functional Components**: Always use functional components.
- **Named Exports**: Use named exports (`export function Component()`) instead of default exports to ensure consistent renaming.
- **Hook Extraction**: Extract logic into custom hooks (`useFeatureName`) to keep components focused on UI.

### Styling (Tailwind CSS)
- **Utility First**: Use Tailwind utility classes for styling.
- **Mobile First**: Write default styles for mobile, then use `sm:`, `md:`, `lg:` for larger screens.
- **Class Merging**: ALWAYS use the `cn()` utility when merging classes, especially for reusable components that accept `className` props.

```tsx
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow", className)}>{children}</div>;
}
```

### Async Data
- Use **TanStack Query** regarding server data.
- Avoid `useEffect` for data fetching.
- Handle `isLoading` and `isError` states explicitly in the UI.

## 🚨 Best Practices

1.  **Imports**: Use absolute imports with `@/` (configured in `vite.config.ts`).
    - ✅ `import { Button } from '@/components/ui/button';`
    - ❌ `import { Button } from '../../components/ui/button';`

2.  **Performance**:
    - Memoize expensive calculations with `useMemo`.
    - Memoize function props with `useCallback` when passing them to memoized children.

3.  **Accessibility**:
    - Use semantic HTML (`<button>`, `<nav>`, `<main>`).
    - Maintain keyboard navigation support for custom interactive elements.

4.  **Linting**: Run `npm run lint` before committing to catch errors early.
