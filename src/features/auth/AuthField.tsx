import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Pressable, Text } from '@/components/ui';
import { colors } from '@/lib/theme';

interface AuthFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  secure?: boolean;
}

/**
 * A labelled text field for the auth forms.
 *
 * The error sits under the field and is announced as a live region — a form
 * that only colours the border red tells a screen-reader user nothing about
 * what went wrong.
 */
export function AuthField({ label, error, secure = false, ...rest }: AuthFieldProps) {
  const [hidden, setHidden] = useState(secure);

  return (
    <View className="gap-1.5">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Glass
        elevation="low"
        className={
          error
            ? 'flex-row items-center rounded-lg border border-danger px-4'
            : 'flex-row items-center rounded-lg px-4'
        }
      >
        <TextInput
          secureTextEntry={hidden}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={label}
          // TextInput's colour, height and font have no NativeWind equivalent
          // that behaves consistently across both platforms.
          style={{
            flex: 1,
            height: 52,
            color: colors.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 16,
          }}
          {...rest}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            haptic={false}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            className="pl-2"
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={19}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </Glass>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
