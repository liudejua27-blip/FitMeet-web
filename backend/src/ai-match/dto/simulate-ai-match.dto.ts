import { IsInt, Min } from 'class-validator';

export class SimulateAiMatchDto {
  @IsInt()
  @Min(1)
  targetUserId: number;
}
