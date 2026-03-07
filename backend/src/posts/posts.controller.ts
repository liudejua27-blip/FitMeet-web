import {
  Controller, Get, Post as HttpPost, Param, Query, Body,
  UseGuards, Request, ParseIntPipe,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller('feed')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.postsService.findAll(category ?? '', page ?? 1, limit ?? 10);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.postsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(@Request() req, @Body() dto: CreatePostDto) {
    return this.postsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/like')
  toggleLike(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.postsService.toggleLike(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/save')
  toggleSave(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.postsService.toggleSave(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('interactions')
  getUserInteractions(@Request() req) {
    return this.postsService.getUserLikesAndSaves(req.user.id);
  }
}
