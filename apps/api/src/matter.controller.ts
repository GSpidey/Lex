import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, CurrentUser, Roles, type AuthUser } from "./auth.guard.js";
import { MatterService } from "./matter.service.js";

@ApiTags("matters")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class MatterController {
  constructor(private readonly matters: MatterService) {}
  @Get("matters") list(@CurrentUser() user: AuthUser) { return this.matters.list(user); }
  @Get("matters/:id") get(@CurrentUser() user: AuthUser, @Param("id") id: string) { return this.matters.get(user, id); }
  @Post("matters/:id/messages") message(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) { return this.matters.message(user, id, body); }
  @Post("matters/:id/reassignment") @Roles("CLIENT") reassign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { reason?: string }) { return this.matters.requestReassignment(user.id, id, body.reason ?? "client_request"); }
  @Post("matters/:id/routing-challenge") @Roles("CLIENT") challenge(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { reason?: string }) { return this.matters.challengeRouting(user.id, id, body.reason ?? "client_disagrees"); }
  @Get("privacy/export") @Roles("CLIENT") export(@CurrentUser() user: AuthUser) { return this.matters.exportUserData(user.id); }
  @Post("privacy/deletion-request") @Roles("CLIENT") deletion(@CurrentUser() user: AuthUser, @Body() body: { reason?: string }) { return this.matters.requestDeletion(user.id, body.reason ?? "client_request"); }
}
