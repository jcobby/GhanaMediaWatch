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
});
