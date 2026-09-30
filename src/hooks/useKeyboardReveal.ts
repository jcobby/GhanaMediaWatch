import { useCallback, useRef, type RefObject } from 'react';
import { Keyboard, type ScrollView, type TextInput, type View } from 'react-native';

/**
 * Scroll a field into view when the keyboard comes up over it.
 *
 * **`KeyboardAvoidingView` is not enough, and this is the gap it leaves.** That
 * component resizes or pads the scroll area so the content *can* be reached —
 * it does not move anything. A field already sitting under where the keyboard
 * lands stays exactly where it was, now behind it, and React Native has not
 * scrolled a focused input into view automatically for several versions. So on
 * the review screen a reporter tapped "What happened", the keyboard covered the
 * box, and they typed into something they could not see. The field was on the
 * screen and reachable by scrolling, which is why it looked like it worked.
 *
 * `measureLayout` against the scroll view's own inner view rather than an
 * `onLayout` offset: `onLayout` reports a position relative to the immediate
 * parent, and every field here is nested several views deep inside a step, so
 * those numbers are not offsets into the scrollable content and adding them up
 * is a sum that breaks the moment anything is re-wrapped.
 */

/**
 * How much of the screen to leave above the field once it has been revealed.
 *
 * Not zero: a field flush against the top edge of the visible area reads as cut
 * off, and on this screen the label sits above the box, so scrolling the *box*
 * to the top hides the question it answers.
 */
const HEADROOM = 120;

export function useKeyboardReveal(scroll: RefObject<ScrollView | null>) {
  /**
   * The last field asked for, so a keyboard that resizes — a language switch, a
   * predictive bar appearing — re-reveals whatever is focused rather than
   * leaving it half covered.
   */
  const pending = useRef<View | TextInput | null>(null);

  const scrollTo = useCallback(
    (target: View | TextInput | null) => {
      const view = scroll.current;
      // `getInnerViewNode` is the scrollable content, which is what a field's
      // position has to be measured against — not the ScrollView itself.
      const inner = view?.getInnerViewNode?.();
      if (!view || !target || inner == null) return;

      (target as unknown as View).measureLayout?.(
        inner,
        (_x: number, y: number) => {
          view.scrollTo({ y: Math.max(0, y - HEADROOM), animated: true });
        },
        // Measuring can fail if the field unmounted between focus and this
        // callback. Nothing to do, and nothing worth telling anyone about.
        () => {},
      );
    },
    [scroll],
  );

  /**
   * Call from a field's `onFocus`, passing that field's ref.
   *
   * Waits for the keyboard rather than scrolling straight away. At the moment
   * focus fires the keyboard has not appeared, so the scroll view still has its
   * full height and any position computed now is the one that leaves the field
   * covered — the exact bug. `keyboardDidShow` is the point at which the
   * visible area is final; a short timer backs it up, because on a screen where
   * the keyboard is *already* up and focus moves between two fields, no further
   * show event fires.
   */
  return useCallback(
    (target: View | TextInput | null) => {
      pending.current = target;

      const shown = Keyboard.addListener('keyboardDidShow', () => {
        shown.remove();
        scrollTo(pending.current);
      });

      const timer = setTimeout(() => {
        shown.remove();
        scrollTo(pending.current);
      }, 350);

      return () => {
        shown.remove();
        clearTimeout(timer);
      };
    },
    [scrollTo],
  );
}
