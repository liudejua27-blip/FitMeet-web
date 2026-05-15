import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class DevLoginDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
