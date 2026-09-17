import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Glass, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { formatCount, formatRelativeTime } from '@/lib/format';
import type { IncidentComment } from '@/types/comments';

/**
 * Comments under a report.
 *
 * Two kinds live here and they are drawn differently on purpose. Most comments
 * are people talking. Some carry footage of the same event from a different
 * position, and those are evidence — they get a marked frame and a label, so
 * someone scanning for more angles can find them without reading every reply.
 */
export function CommentList({
  comments,
  onOpenMedia,
}: {
  comments: IncidentComment[];
  onOpenMedia: (comment: IncidentComment) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();

  if (comments.length === 0) {
    return (
      <View className="items-center gap-1.5 py-8">
        <Ionicons name="chatbubble-outline" size={22} color={c.textFaint} />
        <Text variant="body-sm" tone="muted">
          {t('comments.emptyTitle')}
        </Text>
        <Text variant="caption" tone="faint" className="text-center">
          {t('comments.emptyBody')}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {comments.map((comment) => (
        <CommentRow key={comment.id} comment={comment} onOpenMedia={onOpenMedia} />
      ))}
    </View>
  );
}

function CommentRow({
  comment,
  onOpenMedia,
}: {
  comment: IncidentComment;
  onOpenMedia: (comment: IncidentComment) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();

  const initials = comment.author.isAnonymous
    ? '?'
    : comment.author.handle
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase();

  return (
    <View className="flex-row gap-2.5">
      <View
        className={
          comment.author.organisationName
            ? 'h-8 w-8 items-center justify-center rounded-pill bg-info-wash'
            : 'h-8 w-8 items-center justify-center rounded-pill bg-canvas-raise'
        }
      >
        <Text
          variant="caption"
          tone={comment.author.organisationName ? 'info' : 'muted'}
          className="font-sans-semibold"
        >
          {initials}
        </Text>
      </View>

      <View className="flex-1 gap-1.5">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="body-sm" className="font-sans-semibold">
            {comment.author.isAnonymous ? t('comments.anonymous') : comment.author.handle}
          </Text>
          {/* An organisation replying in public is accountable for it, so the
              affiliation is stated rather than left to the display name. */}
          {comment.author.organisationName ? (
            <Badge label={t('comments.official')} tone="info" />
          ) : null}
          <Text variant="caption" tone="faint">
            {formatRelativeTime(comment.createdAtIso)}
          </Text>
        </View>

        {comment.body ? (
          <Text variant="body-sm" tone="secondary">
            {comment.body}
          </Text>
        ) : null}

        {comment.media ? (
          <Pressable
            onPress={() => onOpenMedia(comment)}
            accessibilityLabel={t('comments.openAttachment')}
          >
            <Glass elevation="low" className="overflow-hidden rounded-md">
              {comment.isContribution ? (
                <View className="flex-row items-center gap-1.5 px-2.5 py-1.5">
                  <Ionicons name="albums-outline" size={12} color={c.accent} />
                  <Text variant="caption" tone="accent" className="font-sans-semibold">
                    {t('comments.addedFootage')}
                  </Text>
                </View>
              ) : null}
              <View className="relative">
                <Image
                  source={{ uri: comment.media.posterUrl }}
                  style={{ width: '100%', height: 168 }}
                  contentFit="cover"
                  transition={140}
                />
                {comment.media.kind === 'video' ? (
                  <View className="absolute inset-0 items-center justify-center">
                    <View className="h-11 w-11 items-center justify-center rounded-pill bg-black/55">
                      <Ionicons name="play" size={18} color={c.textOnDark} />
                    </View>
                  </View>
                ) : null}
              </View>
            </Glass>
          </Pressable>
        ) : null}

        {/*
          The count, where the service sends one — not a button.

          There was a heart here that toggled a store on the phone. The service
          reacts to reports, not to individual comments, so the tap recorded
          nothing and the heart forgot itself on the next load. A control that
          does nothing is worse than no control.
        */}
        {comment.reactions > 0 ? (
          <View className="flex-row items-center gap-1.5 pt-0.5">
            <Ionicons name="heart-outline" size={14} color={c.textMuted} />
            <Text variant="caption" tone="muted" className="font-sans-medium">
              {formatCount(comment.reactions)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
