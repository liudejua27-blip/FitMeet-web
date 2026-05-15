export interface AuthenticatedUser {
  id: number;
  userId?: number;
  email?: string;
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

export interface OptionalAuthenticatedRequest {
  user?: AuthenticatedUser;
}
