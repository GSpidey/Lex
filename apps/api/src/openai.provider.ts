import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { structuredIntakeSchema, type AIIntakeRequest, type AIProvider, type StructuredIntake, type SupportedLanguage, type TranscriptionProvider, type TranscriptionResult } from "@lex/contracts";

@Injectable()
export class OpenAIProviderService implements AIProvider, TranscriptionProvider {
  private readonly client: OpenAI | null;
  private readonly intakeModel: string;
  private readonly transcriptionModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.intakeModel = this.config.get<string>("OPENAI_INTAKE_MODEL") ?? "gpt-5.6-terra";
    this.transcriptionModel = this.config.get<string>("OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-4o-transcribe";
  }

  async summarizeIntake(request: AIIntakeRequest): Promise<StructuredIntake> {
    if (!this.client) return this.localSummary(request);
    const response = await this.client.responses.create({
      model: this.intakeModel,
      store: false,
      safety_identifier: request.safetyIdentifier,
      reasoning: { effort: "low" },
      instructions: [
        "You are Lex's legal-intake structuring component, not a lawyer.",
        "Extract only facts the client supplied. Do not give legal advice, conclusions, or outcome predictions.",
        "Mark urgent or conflicting situations for human review. English is the authoritative record.",
        "The safeClientConfirmation must be plain language and must say a lawyer has not reviewed it yet.",
      ].join(" "),
      input: JSON.stringify(request),
      text: {
        format: {
          type: "json_schema",
          name: "lex_structured_intake",
          strict: true,
          schema: z.toJSONSchema(structuredIntakeSchema),
        },
      },
    });
    return structuredIntakeSchema.parse(JSON.parse(response.output_text));
  }

  async translateClientConfirmation(input: { text: string; targetLanguage: SupportedLanguage; safetyIdentifier: string }): Promise<string> {
    if (input.targetLanguage === "en" || !this.client) return input.text;
    const response = await this.client.responses.create({
      model: this.intakeModel,
      store: false,
      safety_identifier: input.safetyIdentifier,
      reasoning: { effort: "low" },
      instructions: `Translate the supplied intake confirmation into ${input.targetLanguage}. Preserve uncertainty, disclaimers, names, amounts, and dates. Do not add legal advice.`,
      input: input.text,
    });
    return response.output_text;
  }

  async draftAssessment(input: { matterId: string; confirmedFacts: StructuredIntake; lawyerInstructions: string }): Promise<{ draft: string; model: string }> {
    if (!this.client) return { draft: `DRAFT FOR LAWYER REVIEW\n\nConfirmed client summary:\n${input.confirmedFacts.summary}\n\nLawyer instructions:\n${input.lawyerInstructions}`, model: "local-deterministic" };
    const response = await this.client.responses.create({
      model: this.intakeModel,
      store: false,
      safety_identifier: createHash("sha256").update(input.matterId).digest("hex"),
      reasoning: { effort: "medium" },
      instructions: "Draft a structured lawyer work product using only confirmed facts and lawyer instructions. Label it DRAFT FOR LAWYER REVIEW. Do not claim it has been reviewed or delivered.",
      input: JSON.stringify(input),
    });
    return { draft: response.output_text, model: this.intakeModel };
  }

  async transcribe(input: { bytes: Uint8Array; fileName: string; language?: SupportedLanguage }): Promise<TranscriptionResult> {
    if (!this.client) return { text: "[Voice transcription requires an OpenAI test API key.]", detectedLanguage: input.language ?? null, confidence: null, model: "unconfigured" };
    const result = await this.client.audio.transcriptions.create({
      file: await toFile(input.bytes, input.fileName),
      model: this.transcriptionModel,
      response_format: "json",
    });
    return { text: result.text, detectedLanguage: input.language ?? null, confidence: null, model: this.transcriptionModel };
  }

  get configured() { return Boolean(this.client); }
  get models() { return { intake: this.intakeModel, transcription: this.transcriptionModel }; }

  private localSummary(request: AIIntakeRequest): StructuredIntake {
    const urgentKeys = ["locked_out", "utilities_cut", "threats_or_violence", "possession_urgent", "self_help_action"];
    const urgentReasons = urgentKeys.filter((key) => request.answers[key] === true).map((key) => key.replaceAll("_", " "));
    const critical = request.answers["threats_or_violence"] === true;
    return {
      authoritativeLanguage: "en",
      originalLanguage: request.originalLanguage,
      summary: `The client identifies as the ${request.tenancyRole} in a tenancy matter in ${request.jurisdiction.stateCode}. The client reports: ${request.narrative}`,
      facts: Object.entries(request.answers).filter(([, value]) => value !== "" && value !== null && value !== undefined).map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).slice(0, 50),
      parties: [],
      timeline: [],
      issueTags: [],
      missingInformation: request.narrative.length < 40 ? ["Provide more detail about what happened and when."] : [],
      urgency: critical ? "critical_human_review" : urgentReasons.length ? "urgent" : "standard",
      urgencyReasons: urgentReasons,
      confidence: 0.5,
      requiresHumanReview: true,
      safeClientConfirmation: "Please confirm this factual summary. It was organized automatically and has not yet been reviewed by a lawyer.",
    };
  }
}
