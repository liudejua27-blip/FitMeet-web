import { IsString, MaxLength } from 'class-validator';

export class EmergencyContactDto {
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @MaxLength(30)
  relation!: string;
}
