import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Runtime } from '@office/contracts';
import { OfficeService } from './office.service';

@Controller('api')
export class OfficeController {
  constructor(private readonly office: OfficeService) {}

  @Get('health') health() { return { ok: true, service: 'visual-agent-office' }; }

  @Get('office/snapshot') snapshot(@Query('runtime') raw: string) {
    const runtime = Runtime.safeParse(raw);
    if (!runtime.success) throw new BadRequestException('runtime must be claude_code or codex');
    return this.office.snapshot(runtime.data);
  }

  @Get('office/events') events(@Query('runtime') raw: string, @Query('after') after?: string, @Query('sessionId') sessionId?: string) {
    const runtime = Runtime.safeParse(raw);
    if (!runtime.success) throw new BadRequestException('runtime must be claude_code or codex');
    if (after && !/^\d+$/.test(after)) throw new BadRequestException('invalid cursor');
    if (sessionId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) throw new BadRequestException('invalid session');
    return this.office.events(runtime.data, after ? BigInt(after) : null, sessionId);
  }
}
