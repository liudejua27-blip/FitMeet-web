import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  async search(@Query('q') query: string) {
    if (!query) console.log('Empty search query');
    return this.searchService.search(query || '');
  }

  @Public()
  @Get('suggest')
  async suggest(@Query('q') query: string) {
    return this.searchService.suggest(query || '');
  }
}
