import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui';
import i18n from '@/i18n';

interface Props {
  children: ReactNode;
  /** Shown above the message. Per-screen boundaries pass the screen name. */
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * The one class component in the codebase.
 *
 * React has no hook equivalent of componentDidCatch — error boundaries are
 * still class-only. The brief's "no class components" rule is about avoiding
 * legacy patterns; this is the sanctioned exception, kept minimal.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Crash reporting hooks in here. Never shown to the user.
    console.error(
      '[ErrorBoundary]',
      this.props.label ?? 'root',
      error.message,
      info.componentStack,
    );
  }

  private reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text variant="title-lg" className="text-center">
          {i18n.t('error.boundaryTitle')}
        </Text>
        {/* Deliberately not the error message: raw exception text is never
            shown to users. The message goes to the crash reporter instead. */}
        <Text variant="body" tone="muted" className="text-center">
          {i18n.t('error.boundaryBody')}
        </Text>
        <Button
          label={i18n.t('error.boundaryRetry')}
          variant="glass"
          onPress={this.reset}
          className="mt-2"
        />
      </View>
    );
  }
}
