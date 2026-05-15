export type Gateway = {
  id: 'human' | 'pet' | 'ai';
  index: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  cta: string;
  accent: string;
  coordinates: string;
};

export const gateways: Gateway[] = [
  {
    id: 'human',
    index: '01',
    title: 'Human Wellness',
    subtitle: 'Train, recover, connect.',
    description:
      'Movement, recovery, coaching, and local connection designed around the human body.',
    href: '/human',
    cta: 'Explore Human',
    accent: '#8c8a6e',
    coordinates: 'HUMAN / EARTH-01',
  },
  {
    id: 'pet',
    index: '02',
    title: 'Pet & Animal Care',
    subtitle: 'Care, bond, monitor.',
    description:
      'Companion care and animal understanding woven into everyday wellness rituals.',
    href: '/pet',
    cta: 'Explore Pet & Animal',
    accent: '#6b7a5a',
    coordinates: 'COMPANION / EARTH-02',
  },
  {
    id: 'ai',
    index: '03',
    title: 'AI / Robotics Companion',
    subtitle: 'Assist, accompany, enhance.',
    description:
      'Robotics assistance and virtual AI guidance as calm companions for healthier lives.',
    href: '/ai',
    cta: 'Explore AI & Robotics',
    accent: '#b8b5ac',
    coordinates: 'INTELLIGENCE / EARTH-03',
  },
];
