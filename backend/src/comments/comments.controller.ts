import {
  Controller, Get, Post, Param, Body,
  UseGuards, Request, ParseIntPipe,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller('feed')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Public()
  @Get(':postId/comments')
  findByPost(@Param('postId', ParseIntPipe) postId: number) {
    return this.commentsService.findByPost(postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':postId/comments')
  create(
    @Param('postId', ParseIntPipe) postId: number,
    @Request() req,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(postId, req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('comments/:commentId/like')
  likeComment(@Param('commentId', ParseIntPipe) commentId: number) {
    return this.commentsService.likeComment(commentId);
  }
}
