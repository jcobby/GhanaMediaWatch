import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

export interface SurfaceProps extends ViewProps {
  className?: string;
  /** Adds a hairline border. Cards on a matching background need it; on media they don't. */
  bordered?: boolean;
}

/** Elevated container — cards, sheets, inline panels. */
export function Surface({ className, bordered = true, ...rest }: SurfaceProps) {
  return (
    <View
      className={cn(
        'rounded-md bg-canvas-raise p-4',
        bordered && 'border border-hairline/[0.14]',
        className,
      )}
      {...rest}
    />
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn('h-px w-full bg-hairline/[0.14]', className)} />;
}
