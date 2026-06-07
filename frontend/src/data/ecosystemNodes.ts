export type EcosystemNode = {
  id: 'human' | 'pets' | 'animals' | 'robotics' | 'ai';
  label: string;
  caption: string;
  angle: number;
  accent: string;
};

export const ecosystemNodes: EcosystemNode[] = [
  {
    id: 'human',
    label: 'Human',
    caption: 'Train, recover, connect.',
    angle: -90,
    accent: '#f4efe6',
  },
  {
    id: 'pets',
    label: 'Pets',
    caption: 'Care, bond, monitor.',
    angle: -18,
    accent: '#b8b5ac',
  },
  {
    id: 'animals',
    label: 'Animals',
    caption: 'Observe, protect, understand.',
    angle: 54,
    accent: '#8c8a6e',
  },
  {
    id: 'robotics',
    label: 'Robotics',
    caption: 'Assist, accompany, enhance.',
    angle: 126,
    accent: '#c9c5bb',
  },
  {
    id: 'ai',
    label: 'Virtual AI',
    caption: 'Guide, analyze, personalize.',
    angle: 198,
    accent: '#6b7a5a',
  },
];
