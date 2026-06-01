export enum WaitlistDeviceType {
  Ios = 'ios',
  Android = 'android',
  Both = 'both',
}

export enum WaitlistUserRole {
  Student = 'student',
  WhiteCollar = 'white_collar',
  FitnessUser = 'fitness_user',
  Coach = 'coach',
  Merchant = 'merchant',
  Developer = 'developer',
  Other = 'other',
}

export enum WaitlistQualityLevel {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum WaitlistStatus {
  Pending = 'pending',
  Invited = 'invited',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Exported = 'exported',
}
