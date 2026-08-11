import { DurableObject } from "cloudflare:workers";

type SocketAttachment = {
  consultationId: string;
  userId: string;
  participantRole: string;
  token: string;
};

type ClientMessage =
  { type: "message"; clientMessageId: string; body: string } | { type: "ping" };

export class ConsultationRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS message_cache (
          id TEXT PRIMARY KEY, client_message_id TEXT NOT NULL UNIQUE, sender_user_id TEXT NOT NULL,
          body TEXT NOT NULL, created_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO _sql_schema_migrations (id,applied_at) VALUES (1,datetime('now'));
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return Response.json(
        { message: "WebSocket upgrade required" },
        { status: 426 },
      );
    const url = new URL(request.url);
    const consultationId = url.pathname.split("/").filter(Boolean).at(-1);
    const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
      .split(",")
      .map((value) => value.trim());
    const tokenProtocol = protocols.find((value) =>
      value.startsWith("bearer."),
    );
    const token = tokenProtocol?.slice("bearer.".length);
    if (!consultationId || !token)
      return Response.json(
        { message: "Realtime authorization is required" },
        { status: 401 },
      );

    const authorization = await this.env.API.fetch(
      "https://lex.internal/v1/internal/realtime/authorize",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    if (!authorization.ok)
      return Response.json(
        { message: "Realtime authorization failed" },
        { status: 401 },
      );
    const result = await authorization.json<{
      authorized: boolean;
      consultation_id: string;
      user_id: string;
      participant_role: string;
    }>();
    if (!result.authorized || result.consultation_id !== consultationId)
      return Response.json(
        { message: "Realtime room does not match the consultation" },
        { status: 403 },
      );

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({
      consultationId,
      userId: result.user_id,
      participantRole: result.participant_role,
      token,
    } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [result.user_id]);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": "lex.realtime.v1" },
    });
  }

  async webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || typeof raw !== "string") {
      socket.close(1008, "Invalid session or payload");
      return;
    }
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      socket.send(JSON.stringify({ type: "error", code: "invalid_json" }));
      return;
    }
    if (message.type === "ping") {
      socket.send(
        JSON.stringify({ type: "pong", at: new Date().toISOString() }),
      );
      return;
    }
    if (
      message.type !== "message" ||
      message.body.trim().length < 1 ||
      message.body.length > 10_000 ||
      message.clientMessageId.length < 8
    ) {
      socket.send(JSON.stringify({ type: "error", code: "invalid_message" }));
      return;
    }

    const response = await this.env.API.fetch(
      "https://lex.internal/v1/internal/realtime/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: attachment.token,
          clientMessageId: message.clientMessageId,
          body: message.body.trim(),
        }),
      },
    );
    if (!response.ok) {
      socket.send(JSON.stringify({ type: "error", code: "message_rejected" }));
      return;
    }
    const saved = await response.json<{ id: string; createdAt: string }>();
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO message_cache (id,client_message_id,sender_user_id,body,created_at) VALUES (?,?,?,?,?)",
      saved.id,
      message.clientMessageId,
      attachment.userId,
      message.body.trim(),
      saved.createdAt,
    );
    const event = JSON.stringify({
      type: "message",
      id: saved.id,
      clientMessageId: message.clientMessageId,
      senderUserId: attachment.userId,
      body: message.body.trim(),
      createdAt: saved.createdAt,
    });
    for (const peer of this.ctx.getWebSockets()) peer.send(event);
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    socket.close(code, reason);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/v1/health")
      return Response.json({
        status: "ok",
        service: "lex-staging-realtime",
        environment: env.APP_ENV,
      });
    const match = /^\/v1\/consultations\/([0-9a-f-]{36})$/u.exec(url.pathname);
    if (!match)
      return Response.json({ message: "Route not found" }, { status: 404 });
    return env.CONSULTATION_ROOM.getByName(match[1]!).fetch(request);
  },
} satisfies ExportedHandler<Env>;
