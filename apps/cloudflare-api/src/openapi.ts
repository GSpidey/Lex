export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Lex nationwide legal-access API",
    version: "2.0.0",
    description:
      "Managed legal-access pilot API. Automated output is not legal advice.",
  },
  servers: [{ url: "/v1" }],
  tags: [
    "auth",
    "intakes",
    "matters",
    "evidence",
    "matching",
    "lawyer",
    "payments",
    "privacy",
    "admin",
    "webhooks",
    "catalog",
    "consultations",
    "representation",
    "safeguarding",
    "professional",
    "owner",
    "ai",
    "legal",
  ].map((name) => ({ name })),
  paths: {
    "/health": {
      get: {
        operationId: "health",
        responses: { "200": { description: "Worker and D1 health" } },
      },
    },
    "/capabilities": {
      get: {
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Provider and release capability status" },
        },
      },
    },
    "/catalog/practice-areas": {
      get: {
        tags: ["catalog"],
        responses: {
          "200": { description: "Searchable nationwide legal catalogue" },
        },
      },
    },
    "/catalog/services": {
      get: {
        tags: ["catalog"],
        responses: { "200": { description: "Versioned service catalogue" } },
      },
    },
    "/consultations": {
      post: {
        tags: ["consultations"],
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Live-text consultation scheduled" },
        },
      },
    },
    "/consultations/{id}/realtime-token": {
      post: {
        tags: ["consultations"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Short-lived room token" } },
      },
    },
    "/engagements": {
      get: {
        tags: ["representation"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role-scoped representation engagements" },
        },
      },
    },
    "/auth/otp/request": {
      post: {
        tags: ["auth"],
        operationId: "requestOtp",
        responses: {
          "201": { description: "OTP queued" },
          "503": { description: "Provider unavailable" },
        },
      },
    },
    "/auth/otp/verify": {
      post: {
        tags: ["auth"],
        operationId: "verifyOtp",
        responses: { "200": { description: "Session created" } },
      },
    },
    "/auth/sessions": {
      get: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Active sessions" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Assigned roles and active role" } },
      },
    },
    "/auth/active-role": {
      post: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role changed with rotated session tokens" },
        },
      },
    },
    "/professional-applications/me": {
      put: {
        tags: ["professional"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Professional application saved" } },
      },
    },
    "/ai/intake-sessions": {
      post: {
        tags: ["ai"],
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Disclosed AI-assisted intake created" },
        },
      },
    },
    "/ai/intake-sessions/{id}/messages": {
      post: {
        tags: ["ai"],
        security: [{ bearerAuth: [] }],
        responses: {
          "202": { description: "Idempotent guided-intake turn queued" },
        },
      },
    },
    "/legal/documents": {
      get: {
        tags: ["legal"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role-appropriate versioned legal documents" },
        },
      },
    },
    "/owner/providers": {
      get: {
        tags: ["owner"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Provider implementation and verification status",
          },
        },
      },
    },
    "/workflows/{role}": {
      get: {
        tags: ["intakes"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "role",
            in: "path",
            required: true,
            schema: { enum: ["tenant", "landlord"] },
          },
        ],
        responses: { "200": { description: "Versioned questionnaire" } },
      },
    },
    "/intakes": {
      post: {
        tags: ["intakes"],
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Intake created" } },
      },
    },
    "/intakes/{id}/evidence": {
      put: {
        tags: ["evidence"],
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Private evidence uploaded into quarantine" },
        },
      },
    },
    "/matters": {
      get: {
        tags: ["matters"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Role-scoped matters" } },
      },
    },
    "/matters/{id}/messages": {
      post: {
        tags: ["matters"],
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Message created" } },
      },
    },
    "/payments/initialize": {
      post: {
        tags: ["payments"],
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Sandbox checkout initialized" } },
      },
    },
    "/privacy/requests": {
      post: {
        tags: ["privacy"],
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Contestable privacy request created" },
        },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
  },
};
