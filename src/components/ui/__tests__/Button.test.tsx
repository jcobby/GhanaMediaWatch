import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';

// RNTL v14 made render/fireEvent async — every interaction must be awaited or
// the query runs before React has committed.
describe('Button', () => {
  it('exposes its label to the accessibility tree', async () => {
    await render(<Button label="Report an incident" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Report an incident')).toBeOnTheScreen();
  });

  it('does not fire onPress while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Submit" loading onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Submit'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks itself busy for screen readers while loading', async () => {
    await render(<Button label="Submit" loading onPress={jest.fn()} />);
    expect(screen.getByLabelText('Submit')).toBeBusy();
    expect(screen.getByLabelText('Submit')).toBeDisabled();
  });

  it('writes the primary label in white, on the blue fill', async () => {
    /*
     * This shipped black, twice over.
     *
     * First by design — the label was `textPrimary` on a violet gradient at
     * 3.19:1. Then by accident: the fix used `text-text-on-dark`, a token no
     * file in this project had ever used, and NativeWind builds the stylesheet
     * from the class names present in `src` when Metro boots. The class
     * compiled to nothing, the label took no colour at all, and fell back to
     * the platform default — black, on the blue button.
     *
     * Asserted on the rendered colour rather than on the class name, because
     * the class name is exactly what was wrong the second time.
     */
    await render(<Button label="Create account" onPress={jest.fn()} />);
    const label = screen.getByText('Create account');
    const flat = StyleSheet.flatten(label.props.style) as { color?: string };
    expect(String(flat.color).toLowerCase()).toBe('#ffffff');
  });
});

/**
 * The gradient fills the button.
 *
 * `SIZE` used to carry horizontal padding, and it is applied to the same
 * element that clips the gradient — so the fill was inset by the padding and
 * stopped short of the edges. The page showed through as a white gutter, and
 * the primary action rendered as a purple rectangle floating inside a white
 * pill, on every screen that has one.
 *
 * Padding on a clipping container insets its child. That is the whole bug, and
 * it is invisible in the source unless you already know to look for it.
 */
describe('the primary fill reaches the edges', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../Button.tsx'), 'utf8');

  test('the clipping container carries no horizontal padding', () => {
    const size = /const SIZE: Record<ButtonSize, string> = \{([\s\S]*?)\}/.exec(src)![1]!;
    expect(size).not.toMatch(/\bpx-\d/);
  });

  test('every size still sets its own height and shape', () => {
    /*
     * Checked per entry, not across the block. An earlier version matched the
     * whole map, so emptying a single size still passed on the strength of its
     * siblings — a button with no height at all, and a green test.
     */
    const size = /const SIZE: Record<ButtonSize, string> = \{([\s\S]*?)\}/.exec(src)![1]!;
    const entries = [...size.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1]!, m[2]!] as const);

    expect(entries.map(([name]) => name).sort()).toEqual(['lg', 'md', 'sm']);
    for (const [name, classes] of entries) {
      expect([name, /h-\d+/.test(classes)]).toEqual([name, true]);
      expect([name, classes.includes('rounded-pill')]).toEqual([name, true]);
    }
  });

  test('the padding moved to the content rather than vanishing', () => {
    // A label flush against a pill's curve is the other half of getting this
    // wrong, and it looks almost as bad.
    expect(src).toMatch(/const PADDING: Record<ButtonSize, string>/);
    expect(src).toMatch(/PADDING\[size\]/);
  });
});
