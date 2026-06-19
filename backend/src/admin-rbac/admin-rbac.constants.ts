export const ADMIN_PERMISSIONS = [
  {
    key: 'agent:l5:read',
    description: 'Read Agent L5 runtime dashboards and diagnostics.',
  },
  {
    key: 'agent:l5:write',
    description: 'Operate Agent L5 runtime controls and worker jobs.',
  },
  {
    key: 'self_improve:approve',
    description: 'Approve, publish, roll back, or reconcile Agent patches.',
  },
  {
    key: 'rbac:manage',
    description: 'Manage admin roles, assignments, and audit logs.',
  },
  {
    key: 'life_graph:safety_review',
    description: 'Review sensitive Life Graph security workflows.',
  },
  {
    key: 'life_graph:compliance:read',
    description: 'Read Life Graph access audits and retention policy.',
  },
  {
    key: 'life_graph:compliance:write',
    description: 'Run Life Graph retention and compliance operations.',
  },
  {
    key: 'observability:read',
    description: 'Read production observability and alert snapshots.',
  },
  {
    key: 'observability:alert:manage',
    description: 'Trigger or reconcile production alert delivery.',
  },
] as const;

export const ADMIN_ROLES = [
  {
    key: 'owner_admin',
    name: 'Owner Admin',
    description: 'Full administrative access for bootstrap owners.',
  },
  {
    key: 'agent_admin',
    name: 'Agent Admin',
    description: 'Operate Agent L5 and self-improve workflows.',
  },
  {
    key: 'support_readonly',
    name: 'Support Readonly',
    description: 'Read-only support access for diagnostics.',
  },
] as const;

export const ADMIN_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner_admin: ADMIN_PERMISSIONS.map((permission) => permission.key),
  agent_admin: [
    'agent:l5:read',
    'agent:l5:write',
    'self_improve:approve',
    'life_graph:safety_review',
    'life_graph:compliance:read',
    'observability:read',
    'observability:alert:manage',
  ],
  support_readonly: ['agent:l5:read', 'observability:read'],
};

export type AdminPermissionKey = (typeof ADMIN_PERMISSIONS)[number]['key'];
