import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, CurrentUser, Roles, type AuthUser } from "./auth.guard.js";
import { PaymentService } from "./payment.service.js";

@ApiTags("payments")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("payments")
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post("initialize")
  @Roles("CLIENT")
  initialize(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.payments.initialize(user.id, body); }

  @Post(":paymentId/verify")
  @Roles("CLIENT")
  verify(@CurrentUser() user: AuthUser, @Param("paymentId") paymentId: string) { return this.payments.verify(user.id, paymentId); }

  @Post("matters/:matterId/refund-request")
  @Roles("CLIENT", "ADMIN", "SUPER_ADMIN")
  refund(@CurrentUser() user: AuthUser, @Param("matterId") matterId: string, @Body() body: { reason?: string }) {
    return this.payments.requestRefund(user.id, user.role, matterId, body.reason ?? "client_requested");
  }
}
