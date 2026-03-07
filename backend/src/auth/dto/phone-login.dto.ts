import { IsString, Matches, Length } from 'class-validator';

export class PhoneLoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的中国手机号' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: '验证码为6位数字' })
  code: string;
}
