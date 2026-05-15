import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVerificationDto {
  @IsIn(['real_name', 'coach'])
  type!: 'real_name' | 'coach';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  realName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  idNumberMasked?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  certName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  certImageUrl?: string;
}
