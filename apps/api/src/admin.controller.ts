import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, CurrentUser, Roles, type AuthUser } from "./auth.guard.js";
import { AdminService, type LawyerReviewInput, type WorkflowDraftInput } from "./admin.service.js";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get("lawyers") lawyers(@Query("status") status?: string) { return this.admin.lawyers(status); }
  @Post("lawyers/:lawyerId/review") reviewLawyer(@CurrentUser() user: AuthUser, @Param("lawyerId") lawyerId: string, @Body() body: LawyerReviewInput) { return this.admin.reviewLawyer(user.id, lawyerId, body); }
  @Get("jurisdictions") jurisdictions() { return this.admin.jurisdictions(); }
  @Post("services/:serviceId/workflows") draft(@CurrentUser() user: AuthUser, @Param("serviceId") serviceId: string, @Body() body: WorkflowDraftInput) { return this.admin.createWorkflowDraft(user.id, serviceId, body); }
  @Post("workflows/:workflowId/publish") publish(@CurrentUser() user: AuthUser, @Param("workflowId") workflowId: string, @Body() body: { approverName?: string; confirmation?: boolean }) { return this.admin.publishWorkflow(user.id, workflowId, body.approverName ?? "", body.confirmation ?? false); }
  @Get("human-reviews") reviews() { return this.admin.reviews(); }
  @Post("human-reviews/:reviewId/resolve") resolve(@CurrentUser() user: AuthUser, @Param("reviewId") reviewId: string, @Body() body: { resolution?: "approved" | "corrected" | "rejected"; correction?: unknown }) { return this.admin.resolveReview(user.id, reviewId, body.resolution ?? "rejected", body.correction); }
  @Post("evidence/:evidenceId/review") evidence(@CurrentUser() user: AuthUser, @Param("evidenceId") evidenceId: string, @Body() body: { accepted?: boolean; reason?: string }) { return this.admin.reviewEvidence(user.id, evidenceId, body.accepted ?? false, body.reason); }
  @Post("refunds/:refundId/process") refund(@CurrentUser() user: AuthUser, @Param("refundId") refundId: string) { return this.admin.processRefund(user.id, refundId); }
  @Get("audit-events") audits() { return this.admin.auditEvents(); }
}
