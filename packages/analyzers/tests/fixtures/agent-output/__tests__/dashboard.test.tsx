// Test that only renders component without assertion
import { render } from '@testing-library/react';
import Dashboard from '../../app/dashboard/page';

it('renders dashboard', () => {
  render(<Dashboard />);
});
