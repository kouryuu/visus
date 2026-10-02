import type { Preview } from '@storybook/react-vite';
import { createElement } from 'react';
import '../src/style.css';

const preview: Preview = {
  decorators: [(Story) => createElement('div', { className: 'dark' }, createElement(Story))],
  parameters: {
    backgrounds: { default: 'visus dark', values: [{ name: 'visus dark', value: '#080a0d' }] },
    controls: { expanded: true }
  }
};

export default preview;
