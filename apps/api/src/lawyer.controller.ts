import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, CurrentUser, Roles, type AuthUser } from "./auth.guard.js";
import { LawyerService } from "./lawyer.service.js";

@ApiTags("lawyer")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("lawyer")
export class LawyerController {
  constructor(private readonly lawyers: LawyerService) {}
  @Post("application") apply(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.lawyers.apply(user.id, body); }
  @Get("profile") @Roles("LAWYER") profile(@CurrentUser() user: AuthUser) { return this.lawyers.profile(user.id); }
  @Post("matters/:id/conflict") @Roles("LAWYER") conflict(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) { return this.lawyers.conflict(user.id, id, body); }
  @Post("matters/:id/assessment/draft") @Roles("LAWYER") draft(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { instructions?: string }) { return this.lawyers.aiDraft(user.id, id, body.instructions ?? "Prepare a structured draft from confirmed facts."); }
  @Post("matters/:id/assessment/deliver") @Roles("LAWYER") deliver(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) { return this.lawyers.deliverAssessment(user.id, id, body); }
}
