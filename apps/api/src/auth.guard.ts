import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export interface AuthUser { id: string; role: "CLIENT" | "LAWYER" | "ADMIN" | "SUPER_ADMIN"; sessionId: string }
export interface AuthenticatedRequest extends Request { authUser: AuthUser }

export const ROLES_KEY = "lex.roles";
export const Roles = (...roles: AuthUser["role"][]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest<AuthenticatedRequest>().authUser);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/u)?.[1];
    if (!token) throw new UnauthorizedException("Bearer token required");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: AuthUser["role"]; sid: string; scope: string }>(token);
      if (payload.scope !== "access") throw new UnauthorizedException("Access token required");
      request.authUser = { id: payload.sub, role: payload.role, sessionId: payload.sid };
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
    const required = this.reflector.getAllAndOverride<AuthUser["role"][]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length && !required.includes(request.authUser.role)) throw new ForbiddenException("Role is not authorized");
    return true;
  }
}
