import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Glass, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { hapticSelect } from '@/lib/haptics';
import { toast } from '@/stores/toastStore';
import type { CommentMedia, DraftComment } from '@/types/comments';

const MAX_LENGTH = 500;

/**
 * Writing a comment, with optional footage attached.
 *
 * Attaching is offered as prominently as typing, because the most useful thing
 * someone can add to a report is usually another angle on it rather than a
 * sentence about it.
 *
 * What this does *not* do is file a report. Footage attached here carries no
 * GPS lock and no vetting, so it cannot earn commission or be licensed — that
 * path runs through the capture gate. Conflating the two would let anyone
 * bypass the provenance rules the whole product rests on, so the composer says
 * plainly which one is happening.
 */
export function CommentComposer({
  onSubmit,
  canPostAnonymously = true,
}: {
  onSubmit: (draft: DraftComment) => void;
  canPostAnonymously?: boolean;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<CommentMedia | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSend = (body.trim().length > 0 || media !== null) && !busy;

  const attach = async () => {
    hapticSelect();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.warning(t('comments.permissionTitle'), t('comments.permissionBody'));
      return;
    }

    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      setMedia({
        kind: isVideo ? 'video' : 'photo',
        posterUrl: asset.uri,
        playbackUrl: isVideo ? asset.uri : null,
        durationMs: asset.duration ?? null,
      });
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    if (!canSend) return;
    onSubmit({ body: body.trim(), media, postAnonymously: anonymous });
    setBody('');
    setMedia(null);
    setAnonymous(false);
  };

  return (
    <Glass elevation="low" className="gap-2.5 rounded-lg p-3">
      {media ? (
        <View className="flex-row items-center gap-2.5 rounded-sm bg-canvas-raise p-2">
          <View className="overflow-hidden rounded-xs">
            <Image
              source={{ uri: media.posterUrl }}
              style={{ width: 42, height: 52 }}
              contentFit="cover"
            />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="body-sm" className="font-sans-medium">
              {media.kind === 'video' ? t('comments.videoAttached') : t('comments.photoAttached')}
            </Text>
            {/* Said here rather than after posting, when it is too late to
                choose the other path. */}
            <Text variant="caption" tone="muted">
              {t('comments.notAReport')}
            </Text>
          </View>
          <Pressable
            onPress={() => setMedia(null)}
            accessibilityLabel={t('comments.removeAttachment')}
            className="h-8 w-8 items-center justify-center rounded-pill"
          >
            <Ionicons name="close" size={16} color={c.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={t('comments.placeholder')}
        placeholderTextColor={c.textFaint}
        multiline
        maxLength={MAX_LENGTH}
        accessibilityLabel={t('comments.placeholder')}
        style={{
          minHeight: 40,
          maxHeight: 120,
          color: c.textPrimary,
          fontFamily: 'Inter_400Regular',
          fontSize: 15,
          textAlignVertical: 'top',
          paddingHorizontal: 2,
        }}
      />

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => void attach()}
          disabled={busy}
          accessibilityLabel={t('comments.attach')}
          className="h-9 flex-row items-center gap-1.5 rounded-pill bg-canvas-raise px-3"
        >
          <Ionicons name="videocam-outline" size={16} color={c.accent} />
          <Text variant="caption" tone="accent" className="font-sans-semibold">
            {t('comments.attach')}
          </Text>
        </Pressable>

        {canPostAnonymously ? (
          <Pressable
            onPress={() => {
              hapticSelect();
              setAnonymous((prev) => !prev);
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: anonymous }}
            accessibilityLabel={t('comments.anonymously')}
            className={
              anonymous
                ? 'h-9 flex-row items-center gap-1.5 rounded-pill bg-accent-wash px-3'
                : 'h-9 flex-row items-center gap-1.5 rounded-pill bg-canvas-raise px-3'
            }
          >
            <Ionicons
              name={anonymous ? 'eye-off' : 'eye-off-outline'}
              size={16}
              color={anonymous ? c.accent : c.textMuted}
            />
            <Text
              variant="caption"
              tone={anonymous ? 'accent' : 'muted'}
              className="font-sans-semibold"
            >
              {t('comments.anonymously')}
            </Text>
          </Pressable>
        ) : null}

        <View className="flex-1" />

        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityLabel={t('comments.post')}
          className={
            canSend
              ? 'h-9 w-9 items-center justify-center rounded-pill bg-accent'
              : 'h-9 w-9 items-center justify-center rounded-pill bg-canvas-raise'
          }
        >
          <Ionicons name="arrow-up" size={17} color={canSend ? c.textOnDark : c.textFaint} />
        </Pressable>
      </View>
    </Glass>
  );
}
