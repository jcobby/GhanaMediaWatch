import { useRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';

interface AuthFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  secure?: boolean;
  /**
   * Bring this field above the keyboard when it takes focus.
   *
   * From `useKeyboardReveal`, and passed in rather than called here because the
   * hook needs the screen's `ScrollView` — this component does not know which
   * list it is in, and should not.
   *
   * Optional, so a field outside a scroll view is unaffected. Every field on
   * both auth forms passes it: the sign-up form is four fields plus a checkbox
   * and a button, so on a small phone the password and confirm boxes are
   * exactly where the keyboard lands.
   */
  reveal?: (target: TextInput | null) => void;
}

/**
 * A labelled text field for the auth forms.
 *
 * The error sits under the field and is announced as a live region — a form
 * that only colours the border red tells a screen-reader user nothing about
 * what went wrong.
 */
export function AuthField({ label, error, secure = false, reveal, ...rest }: AuthFieldProps) {
  const c = useColors();
  const [hidden, setHidden] = useState(secure);
  const field = useRef<TextInput>(null);

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
          ref={field}
          secureTextEntry={hidden}
          placeholderTextColor={c.textFaint}
          accessibilityLabel={label}
          // TextInput's colour, height and font have no NativeWind equivalent
          // that behaves consistently across both platforms.
          style={{
            flex: 1,
            height: 52,
            color: c.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 16,
          }}
          {...rest}
          onFocus={(event) => {
            reveal?.(field.current);
            rest.onFocus?.(event);
          }}
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
              color={c.textMuted}
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
