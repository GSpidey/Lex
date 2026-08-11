import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ContentStatus,
  JurisdictionStatus,
  Language,
  MatterState,
  MessageChannel,
  Prisma,
  TenancyRole,
  UrgencyLevel,
} from "@lex/database";
import {
  confirmIntakeSchema,
  createIntakeSchema,
  structuredIntakeSchema,
  updateIntakeSchema,
  type SupportedLanguage,
} from "@lex/contracts";
import { calculateUrgency } from "@lex/jurisdictions";
import { PrismaService } from "./prisma.service.js";
import { OpenAIProviderService } from "./openai.provider.js";
import { AuditService } from "./audit.service.js";
import { MatchingService } from "./matching.service.js";
import { S3ObjectStorageProvider } from "./storage.provider.js";
import { QueueService } from "./queue.service.js";

const languageMap: Record<SupportedLanguage, Language> = {
  en: Language.EN,
  pcm: Language.PCM,
  ha: Language.HA,
  yo: Language.YO,
  ig: Language.IG,
};
const languageReverse: Record<Language, SupportedLanguage> = {
  EN: "en",
  PCM: "pcm",
  HA: "ha",
  YO: "yo",
  IG: "ig",
};

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: OpenAIProviderService,
    private readonly audit: AuditService,
    private readonly matching: MatchingService,
    private readonly storage: S3ObjectStorageProvider,
    private readonly queues: QueueService,
  ) {}

  async create(clientUserId: string, raw: unknown) {
    const input = createIntakeSchema.parse(raw);
    const jurisdiction = await this.prisma.jurisdiction.findUnique({
      where: {
        countryCode_stateCode: {
          countryCode: "NG",
          stateCode: input.stateCode.toUpperCase(),
        },
      },
    });
    if (!jurisdiction || jurisdiction.status === JurisdictionStatus.SUSPENDED)
      throw new BadRequestException(
        "This Nigerian state is not available for intake",
      );
    const tenancyRole =
      input.tenancyRole === "tenant"
        ? TenancyRole.TENANT
        : TenancyRole.LANDLORD;
    const service = await this.prisma.serviceDefinition.findFirst({
      where: {
        tenancyRole,
        status: ContentStatus.PUBLISHED,
        jurisdictionVersion: {
          jurisdiction: { countryCode: "NG", stateCode: "LA" },
        },
      },
      include: {
        workflows: {
          where: { status: ContentStatus.PUBLISHED },
          orderBy: { version: "desc" },
          take: 1,
        },
        jurisdictionVersion: true,
      },
    });
    const workflow = service?.workflows[0];
    if (!service || !workflow)
      throw new NotFoundException(
        "The tenancy intake workflow is not configured",
      );
    const reference = `LEX-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const intake = await tx.intakeSession.create({
        data: {
          clientUserId,
          serviceDefinitionId: service.id,
          workflowVersionId: workflow.id,
          sourceChannel: input.sourceChannel.toUpperCase() as MessageChannel,
          language: languageMap[input.language],
          tenancyRole,
          countryCode: "NG",
          stateCode: jurisdiction.stateCode,
          localGovernmentArea: input.localGovernmentArea,
        },
      });
      const matter = await tx.matter.create({
        data: {
          reference,
          clientUserId,
          intakeSessionId: intake.id,
          jurisdictionId: jurisdiction.id,
          serviceDefinitionId: service.id,
          workflowVersionId: workflow.id,
          state: MatterState.INTAKE_DRAFT,
          urgencyReasons: [],
        },
      });
      return { intake, matter, service, workflow, jurisdiction };
    });
    await this.audit.record({
      actorUserId: clientUserId,
      matterId: result.matter.id,
      action: "intake.created",
      entityType: "IntakeSession",
      entityId: result.intake.id,
      metadata: {
        stateCode: jurisdiction.stateCode,
        tenancyRole: input.tenancyRole,
        sourceChannel: input.sourceChannel,
      },
    });
    return this.publicIntake(result.intake.id, clientUserId);
  }

  async update(clientUserId: string, intakeId: string, raw: unknown) {
    const input = updateIntakeSchema.parse(raw);
    const intake = await this.owned(intakeId, clientUserId);
    if (intake.summaryConfirmedAt || intake.submittedAt)
      throw new BadRequestException(
        "Confirmed intake cannot be edited; submit a correction instead",
      );
    const answers = { ...(intake.answers as Record<string, unknown>) };
    for (const answer of input.answers ?? [])
      answers[answer.questionKey] = answer.value;
    await this.prisma.intakeSession.update({
      where: { id: intakeId },
      data: {
        narrative: input.narrative,
        desiredOutcome: input.desiredOutcome,
        answers: answers as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      actorUserId: clientUserId,
      matterId: intake.matter?.id,
      action: "intake.updated",
      entityType: "IntakeSession",
      entityId: intakeId,
      metadata: { answerCount: Object.keys(answers).length },
    });
    return this.publicIntake(intakeId, clientUserId);
  }

  async summarize(clientUserId: string, intakeId: string) {
    const intake = await this.owned(intakeId, clientUserId);
    if (!intake.narrative || intake.narrative.trim().length < 10)
      throw new BadRequestException(
        "A narrative of at least 10 characters is required",
      );
    const language = languageReverse[intake.language];
    const safetyIdentifier = createHash("sha256")
      .update(clientUserId)
      .digest("hex");
    const aiRun = await this.prisma.aIRun.create({
      data: {
        intakeSessionId: intake.id,
        matterId: intake.matter?.id,
        purpose: "structured_intake",
        provider: this.ai.configured ? "openai" : "local-deterministic",
        model: this.ai.models.intake,
        promptVersion: "intake-v1",
        schemaVersion: "structured-intake-v1",
        safetyIdentifierHash: safetyIdentifier,
        inputReferences: { intakeId },
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    const started = Date.now();
    try {
      const summary = await this.ai.summarizeIntake({
        intakeId: intake.id,
        originalLanguage: language,
        clientType: "adult_individual",
        practiceAreaCode: "tenancy",
        serviceCode: "ng-tenancy-consult-assess",
        issueRole:
          intake.tenancyRole === TenancyRole.TENANT ? "tenant" : "landlord",
        jurisdiction: {
          countryCode: intake.countryCode,
          stateCode: intake.stateCode,
          status:
            intake.matter?.jurisdiction.status.toLowerCase() ?? "intake_only",
        },
        narrative: intake.narrative,
        answers: intake.answers as Record<string, unknown>,
        safetyIdentifier,
      });
      await this.prisma.$transaction([
        this.prisma.intakeSession.update({
          where: { id: intake.id },
          data: { structuredSummary: summary },
        }),
        this.prisma.matter.update({
          where: { id: intake.matter!.id },
          data: {
            state: MatterState.AWAITING_CONFIRMATION,
            urgency: summary.urgency.toUpperCase() as UrgencyLevel,
            urgencyReasons: summary.urgencyReasons,
          },
        }),
        this.prisma.aIRun.update({
          where: { id: aiRun.id },
          data: {
            status: summary.requiresHumanReview
              ? "HUMAN_REVIEW_REQUIRED"
              : "SUCCEEDED",
            completedAt: new Date(),
            latencyMs: Date.now() - started,
            confidence: summary.confidence,
          },
        }),
        this.prisma.aIOutput.create({
          data: {
            aiRunId: aiRun.id,
            outputType: "structured_intake",
            content: summary,
            contentHash: createHash("sha256")
              .update(JSON.stringify(summary))
              .digest("hex"),
          },
        }),
      ]);
      if (summary.requiresHumanReview || summary.urgency !== "standard")
        await this.prisma.humanReview.create({
          data: {
            matterId: intake.matter!.id,
            aiRunId: aiRun.id,
            reason:
              summary.urgency !== "standard"
                ? "urgent_intake"
                : "low_confidence_or_local_summary",
          },
        });
      return summary;
    } catch (error) {
      await this.prisma.aIRun.update({
        where: { id: aiRun.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          latencyMs: Date.now() - started,
          errorCode: error instanceof Error ? error.name : "unknown",
        },
      });
      throw error;
    }
  }

  async confirm(clientUserId: string, intakeId: string, raw: unknown) {
    const input = confirmIntakeSchema.parse(raw);
    const intake = await this.owned(intakeId, clientUserId);
    if (!intake.structuredSummary || !intake.matter)
      throw new BadRequestException(
        "Generate the structured summary before confirmation",
      );
    const structured = structuredIntakeSchema.parse(intake.structuredSummary);
    const answers = intake.answers as Record<string, unknown>;
    const role =
      intake.tenancyRole === TenancyRole.TENANT ? "tenant" : "landlord";
    const urgency = calculateUrgency(role, answers);
    const targetState =
      intake.matter.jurisdiction.status === JurisdictionStatus.ACTIVE
        ? MatterState.MATCHING
        : MatterState.INTAKE_ONLY;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.intakeSession.update({
        where: { id: intake.id },
        data: {
          summaryConfirmedAt: now,
          submittedAt: now,
          structuredSummary: {
            ...structured,
            clientCorrections: input.corrections ?? null,
          },
        },
      });
      await tx.consentRecord.create({
        data: {
          userId: clientUserId,
          matterId: intake.matter!.id,
          consentType: "legal_intake_and_ai_processing",
          version: input.consentVersion,
          language: intake.language,
          accepted: true,
          evidence: {
            summaryConfirmed: true,
            corrections: input.corrections ?? null,
          },
        },
      });
      await tx.matter.update({
        where: { id: intake.matter!.id },
        data: {
          state: targetState,
          urgency: urgency.toUpperCase() as UrgencyLevel,
          urgencyReasons: structured.urgencyReasons,
          informationCompleteAt: now,
        },
      });
      await tx.urgencyAssessment.upsert({
        where: { matterId: intake.matter!.id },
        update: {
          level: urgency.toUpperCase() as UrgencyLevel,
          reasons: structured.urgencyReasons,
          requiresHumanReview: urgency !== "standard",
        },
        create: {
          matterId: intake.matter!.id,
          level: urgency.toUpperCase() as UrgencyLevel,
          reasons: structured.urgencyReasons,
          source: "workflow_and_ai",
          requiresHumanReview: urgency !== "standard",
        },
      });
      await tx.party.deleteMany({ where: { intakeSessionId: intake.id } });
      for (const party of structured.parties)
        await tx.party.create({
          data: {
            intakeSessionId: intake.id,
            role: party.role,
            name: party.name,
            normalizedName: party.name.toLocaleLowerCase("en-NG"),
            organization: party.organization,
          },
        });
    });
    if (targetState === MatterState.MATCHING)
      await this.matching.generate(intake.matter.id);
    await this.audit.record({
      actorUserId: clientUserId,
      matterId: intake.matter.id,
      action: "intake.confirmed",
      entityType: "Matter",
      entityId: intake.matter.id,
      metadata: { targetState, urgency },
    });
    return this.publicIntake(intakeId, clientUserId);
  }

  async createEvidenceUpload(
    clientUserId: string,
    intakeId: string,
    raw: { fileName?: string; contentType?: string; sizeBytes?: number },
  ) {
    const intake = await this.owned(intakeId, clientUserId);
    const fileName = raw.fileName?.trim();
    const contentType = raw.contentType;
    const sizeBytes = raw.sizeBytes;
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/webm",
    ];
    if (
      !fileName ||
      !contentType ||
      !sizeBytes ||
      sizeBytes < 1 ||
      sizeBytes > 20 * 1024 * 1024 ||
      !allowed.includes(contentType)
    )
      throw new BadRequestException("Unsupported file type or size");
    const objectKey = `quarantine/${clientUserId}/${intakeId}/${randomBytes(16).toString("hex")}`;
    const evidence = await this.prisma.evidenceItem.create({
      data: {
        intakeSessionId: intakeId,
        uploadedById: clientUserId,
        objectKey,
        originalName: fileName,
        contentType,
        sizeBytes,
      },
    });
    return {
      evidenceId: evidence.id,
      ...(await this.storage.createUpload({
        objectKey,
        contentType,
        sizeBytes,
      })),
    };
  }

  async completeEvidenceUpload(
    clientUserId: string,
    intakeId: string,
    evidenceId: string,
    sha256: string,
  ) {
    await this.owned(intakeId, clientUserId);
    const evidence = await this.prisma.evidenceItem.findFirst({
      where: {
        id: evidenceId,
        intakeSessionId: intakeId,
        uploadedById: clientUserId,
      },
    });
    if (!evidence) throw new NotFoundException("Evidence item not found");
    const updated = await this.prisma.evidenceItem.update({
      where: { id: evidence.id },
      data: { sha256, status: "SCANNING" },
    });
    await this.queues.add(
      "lex-evidence",
      "scan",
      { evidenceId: evidence.id },
      `evidence:${evidence.id}`,
    );
    return updated;
  }

  async transcribeEvidence(
    clientUserId: string,
    intakeId: string,
    evidenceId: string,
  ) {
    const intake = await this.owned(intakeId, clientUserId);
    const evidence = await this.prisma.evidenceItem.findFirst({
      where: {
        id: evidenceId,
        intakeSessionId: intakeId,
        uploadedById: clientUserId,
        contentType: { startsWith: "audio/" },
      },
    });
    if (!evidence) throw new NotFoundException("Audio evidence not found");
    if (evidence.status !== "AVAILABLE")
      throw new BadRequestException(
        "Audio must pass file validation before transcription",
      );
    const run = await this.prisma.aIRun.create({
      data: {
        intakeSessionId: intakeId,
        matterId: intake.matter?.id,
        evidenceItemId: evidence.id,
        purpose: "voice_transcription",
        provider: this.ai.configured ? "openai" : "local-unconfigured",
        model: this.ai.models.transcription,
        promptVersion: "transcription-v1",
        schemaVersion: "transcript-v1",
        safetyIdentifierHash: createHash("sha256")
          .update(clientUserId)
          .digest("hex"),
        inputReferences: { evidenceId },
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    const started = Date.now();
    try {
      const result = await this.ai.transcribe({
        bytes: await this.storage.read(evidence.objectKey),
        fileName: evidence.originalName,
        language: languageReverse[intake.language],
      });
      const output = await this.prisma.aIOutput.create({
        data: {
          aiRunId: run.id,
          outputType: "voice_transcript",
          content: result as unknown as Prisma.InputJsonValue,
          contentHash: createHash("sha256").update(result.text).digest("hex"),
        },
      });
      await this.prisma.aIRun.update({
        where: { id: run.id },
        data: {
          status:
            result.model === "unconfigured"
              ? "HUMAN_REVIEW_REQUIRED"
              : "SUCCEEDED",
          completedAt: new Date(),
          latencyMs: Date.now() - started,
        },
      });
      return { outputId: output.id, ...result, confirmationRequired: true };
    } catch (error) {
      await this.prisma.aIRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: error instanceof Error ? error.name : "unknown",
        },
      });
      throw error;
    }
  }

  async confirmTranscript(
    clientUserId: string,
    intakeId: string,
    outputId: string,
    transcript: string,
  ) {
    const intake = await this.owned(intakeId, clientUserId);
    if (transcript.trim().length < 5)
      throw new BadRequestException("Confirmed transcript is required");
    const output = await this.prisma.aIOutput.findFirst({
      where: {
        id: outputId,
        outputType: "voice_transcript",
        aiRun: { intakeSessionId: intakeId },
      },
    });
    if (!output) throw new NotFoundException("Transcript not found");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.aIOutput.update({
        where: { id: outputId },
        data: {
          content: { transcript: transcript.trim(), clientCorrected: true },
          clientConfirmedAt: now,
        },
      }),
      this.prisma.intakeSession.update({
        where: { id: intakeId },
        data: { narrative: transcript.trim() },
      }),
    ]);
    await this.audit.record({
      actorUserId: clientUserId,
      matterId: intake.matter?.id,
      action: "transcript.client_confirmed",
      entityType: "AIOutput",
      entityId: outputId,
    });
    return { confirmed: true, transcript: transcript.trim() };
  }

  async publicIntake(intakeId: string, userId: string) {
    const intake = await this.prisma.intakeSession.findUnique({
      where: { id: intakeId },
      include: {
        workflowVersion: true,
        evidence: true,
        matter: {
          include: {
            jurisdiction: true,
            matches: { include: { lawyer: true }, orderBy: { rank: "asc" } },
          },
        },
      },
    });
    if (!intake || intake.clientUserId !== userId)
      throw new NotFoundException("Intake not found");
    return intake;
  }

  private async owned(intakeId: string, clientUserId: string) {
    const intake = await this.prisma.intakeSession.findUnique({
      where: { id: intakeId },
      include: { matter: { include: { jurisdiction: true } } },
    });
    if (!intake) throw new NotFoundException("Intake not found");
    if (intake.clientUserId !== clientUserId)
      throw new ForbiddenException("Intake belongs to another client");
    return intake;
  }
}
