import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReportStatusDto {
  @IsIn(['pending', 'reviewing', 'resolved', 'rejected'])
  status!: 'pending' | 'reviewing' | 'resolved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
