import { OnGatewayConnection, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Runtime } from '@office/contracts';
import { WebSocketServer } from '@nestjs/websockets';

@WebSocketGateway({ cors: { origin: ['http://127.0.0.1:3000', 'http://localhost:3000'] } })
export class OfficeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    const origin = client.handshake.headers.origin;
    if (origin && !['http://127.0.0.1:3000', 'http://localhost:3000'].includes(origin)) client.disconnect(true);
  }

  @SubscribeMessage('subscribe')
  subscribe(client: Socket, requested: unknown) {
    const runtime = Runtime.safeParse(requested);
    if (!runtime.success) return { ok: false };
    for (const room of client.rooms) if (room.startsWith('runtime:')) client.leave(room);
    client.join(`runtime:${runtime.data}`);
    return { ok: true };
  }

  publish(runtime: Runtime, sequence: string) {
    this.server.to(`runtime:${runtime}`).emit('office.event', { runtime, sequence });
  }
}
