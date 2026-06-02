import { Injectable } from '@nestjs/common';
import { MARKETS } from './markets.registry';

@Injectable()
export class MarketsService {
  findAll() {
    return MARKETS;
  }
}
