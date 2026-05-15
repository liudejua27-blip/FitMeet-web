export type Gateway = {
  id: 'human' | 'pet' | 'ai';
  index: string;
  eyebrow: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  cta: string;
  href: string;
  accent: string;
};

export const GATEWAYS: Gateway[] = [
  {
    id: 'human',
    index: '01',
    eyebrow: 'Human Wellness',
    title: '人类',
    titleEn: 'Human',
    description: '面向人的训练、健康、社交、成长。',
    descriptionEn: 'Train, recover, connect, and grow through intelligent human-centered wellness.',
    cta: 'Explore Human',
    href: '/human',
    accent: '#8C8A6E',
  },
  {
    id: 'pet',
    index: '02',
    eyebrow: 'Pet & Animal Care',
    title: '宠物与动物',
    titleEn: 'Pet & Animal',
    description: '面向宠物与动物的健康、陪伴、管理。',
    descriptionEn: 'Care, bond, monitor, and understand the lives that move with us.',
    cta: 'Explore Pet & Animal',
    href: '/pet',
    accent: '#6B7A5A',
  },
  {
    id: 'ai',
    index: '03',
    eyebrow: 'AI / Robotics Companion',
    title: '智能体',
    titleEn: 'AI & Robotics',
    description: '面向机器人与虚拟 AI 的智能陪伴服务。',
    descriptionEn: 'Assist, guide, personalize, and enhance everyday wellness.',
    cta: 'Explore AI & Robotics',
    href: '/ai',
    accent: '#B8B5AC',
  },
];
