import {
  Controller,
  Get,
  Post as HttpPost,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';

@Controller('feed')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.postsService.findAll(category ?? '', page, limit, {
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('interactions')
  getUserInteractions(@Request() req: AuthenticatedRequest) {
    return this.postsService.getUserLikesAndSaves(req.user.id);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.postsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreatePostDto) {
    return this.postsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/like')
  toggleLike(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.postsService.toggleLike(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/save')
  toggleSave(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.postsService.toggleSave(id, req.user.id);
  }
}
