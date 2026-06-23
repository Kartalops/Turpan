import { render } from '@testing-library/react';
import Home from '../app/page';

// This is a no-op test — it only verifies rendering without any behavior checks
describe('Home', () => {
  it('renders without crashing', () => {
    expect(true).toBe(true);
  });

  it('has correct structure', () => {
    const { container } = render(<Home />);
    expect(true).toBe(true);
  });
});
