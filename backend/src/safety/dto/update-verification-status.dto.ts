import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVerificationStatusDto {
  @IsIn(['pending', 'approved', 'rejected'])
  status!: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
