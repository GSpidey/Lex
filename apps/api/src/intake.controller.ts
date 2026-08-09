import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, CurrentUser, Roles, type AuthUser } from "./auth.guard.js";
import { IntakeService } from "./intake.service.js";
import { MatchingService } from "./matching.service.js";

@ApiTags("intakes")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles("CLIENT")
@Controller()
export class IntakeController {
  constructor(private readonly intakes: IntakeService, private readonly matching: MatchingService) {}
  @Post("intakes") create(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.intakes.create(user.id, body); }
  @Get("intakes/:id") get(@CurrentUser() user: AuthUser, @Param("id") id: string) { return this.intakes.publicIntake(id, user.id); }
  @Patch("intakes/:id") update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) { return this.intakes.update(user.id, id, body); }
  @Post("intakes/:id/summarize") summarize(@CurrentUser() user: AuthUser, @Param("id") id: string) { return this.intakes.summarize(user.id, id); }
  @Post("intakes/:id/confirm") confirm(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) { return this.intakes.confirm(user.id, id, body); }
  @Post("intakes/:id/evidence/upload") evidence(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { fileName?: string; contentType?: string; sizeBytes?: number }) { return this.intakes.createEvidenceUpload(user.id, id, body); }
  @Post("intakes/:id/evidence/:evidenceId/complete") completeEvidence(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("evidenceId") evidenceId: string, @Body() body: { sha256?: string }) { return this.intakes.completeEvidenceUpload(user.id, id, evidenceId, body.sha256 ?? ""); }
  @Post("intakes/:id/evidence/:evidenceId/transcribe") transcribe(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("evidenceId") evidenceId: string) { return this.intakes.transcribeEvidence(user.id, id, evidenceId); }
  @Post("intakes/:id/transcriptions/:outputId/confirm") confirmTranscript(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("outputId") outputId: string, @Body() body: { transcript?: string }) { return this.intakes.confirmTranscript(user.id, id, outputId, body.transcript ?? ""); }
  @Get("matters/:matterId/matches") matches(@CurrentUser() user: AuthUser, @Param("matterId") matterId: string) { return this.matching.list(user.id, matterId); }
  @Post("matters/:matterId/matches/:lawyerId/select") select(@CurrentUser() user: AuthUser, @Param("matterId") matterId: string, @Param("lawyerId") lawyerId: string) { return this.matching.select(user.id, matterId, lawyerId); }
}
