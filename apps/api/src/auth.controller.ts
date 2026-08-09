import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { AuthGuard, CurrentUser, type AuthUser } from "./auth.guard.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request") requestOtp(@Body() body: unknown) { return this.auth.requestOtp(body); }
  @Post("otp/verify") verifyOtp(@Body() body: unknown) { return this.auth.verifyOtp(body); }
  @Post("refresh") refresh(@Body() body: unknown) { return this.auth.refresh(body); }

  @Post("email/request")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  requestEmail(@CurrentUser() user: AuthUser, @Body() body: { email?: string }) { return this.auth.requestLinkedEmail(user.id, body.email ?? ""); }

  @Post("email/verify")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  verifyEmail(@CurrentUser() user: AuthUser, @Body() body: { challengeId?: string; code?: string }) { return this.auth.verifyLinkedEmail(user.id, body.challengeId ?? "", body.code ?? ""); }

  @Post("mfa/setup")
  setupMfa(@Headers("authorization") authorization: string | undefined) {
    return this.auth.setupMfa(authorization?.replace(/^Bearer /u, "") ?? "");
  }

  @Post("mfa/verify")
  verifyMfa(@Headers("authorization") authorization: string | undefined, @Body() body: { code?: string; deviceName?: string }) {
    return this.auth.verifyMfa(authorization?.replace(/^Bearer /u, "") ?? "", body.code ?? "", body.deviceName);
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  logout(@CurrentUser() user: AuthUser) { return this.auth.logout(user.sessionId, user.id); }
}
