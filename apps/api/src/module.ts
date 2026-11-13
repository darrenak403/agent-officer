import { Module } from '@nestjs/common';
import { OfficeController } from './office.controller';
import { IngestController } from './ingest.controller';
import { OfficeGateway } from './office.gateway';
import { OfficeService } from './office.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [OfficeController, IngestController],
  providers: [PrismaService, OfficeService, OfficeGateway],
})
export class AppModule {}
