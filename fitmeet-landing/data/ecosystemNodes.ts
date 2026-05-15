export type EcosystemNode = {
  id: 'human' | 'pets' | 'animals' | 'robotics' | 'ai';
  label: string;
  caption: string;
  angle: number; // degrees on the orbit
};

export const ECOSYSTEM_NODES: EcosystemNode[] = [
  { id: 'human', label: 'Human', caption: 'Train, recover, connect.', angle: -90 },
  { id: 'pets', label: 'Pets', caption: 'Care, bond, monitor.', angle: -18 },
  { id: 'animals', label: 'Animals', caption: 'Observe, protect, understand.', angle: 54 },
  { id: 'robotics', label: 'Robotics', caption: 'Assist, accompany, enhance.', angle: 126 },
  { id: 'ai', label: 'Virtual AI', caption: 'Guide, analyze, personalize.', angle: 198 },
];
