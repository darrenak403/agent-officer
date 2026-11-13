import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { OfficeService } from './office.service';
import { OfficeGateway } from './office.gateway';

function tokenMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('api/ingest')
export class IngestController {
  constructor(private readonly office: OfficeService, private readonly gateway: OfficeGateway) {}

  @Post()
  @HttpCode(202)
  async ingest(@Headers('x-office-token') token: string | undefined, @Body() body: unknown) {
    if (!tokenMatches(token, process.env.OFFICE_INGEST_TOKEN!)) throw new ForbiddenException();
    const result = await this.office.ingest(body);
    if (!result.duplicate) this.gateway.publish(result.runtime, result.sequence);
    return result;
  }
}
