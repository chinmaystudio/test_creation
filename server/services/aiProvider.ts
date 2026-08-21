import { invokeLLM, listLLMModels } from "../_core/llm";
import type { CandidateQuestion, QuestionType } from "../../shared/assessment";

export type GenerateQuestionsInput = {
  subject: string;
  topic: string;
  gradeLevel: string;
  difficulty: "easy" | "medium" | "hard";
  count: number;
  questionTypes: QuestionType[];
  marksPerQuestion: number;
  learningObjective: string;
  referenceMaterial?: string;
};

export interface AIProvider {
  generateQuestions(input: GenerateQuestionsInput): Promise<CandidateQuestion[]>;
}

const generatedQuestionSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionText: { type: "string" },
          type: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                isCorrect: { type: "boolean" },
              },
              required: ["text", "isCorrect"],
              additionalProperties: false,
            },
          },
          correctAnswer: { type: "string" },
          explanation: { type: "string" },
          marks: { type: "number" },
          difficulty: { type: "string" },
          topic: { type: "string" },
          learningObjective: { type: "string" },
          qualityWarnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "questionText",
          "type",
          "options",
          "correctAnswer",
          "explanation",
          "marks",
          "difficulty",
          "topic",
          "learningObjective",
          "qualityWarnings",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function contentAsText(content: string | unknown[]): string {
  return typeof content === "string" ? content : "";
}

export class BuiltInAIProvider implements AIProvider {
  async generateQuestions(input: GenerateQuestionsInput): Promise<CandidateQuestion[]> {
    const catalog = await listLLMModels();
    const model =
      catalog.data.find(item => item.id === "gpt-5-mini")?.id ??
      catalog.data.find(item => item.id.startsWith("gpt-5"))?.id ??
      catalog.data[0]?.id;

    const response = await invokeLLM({
      model,
      maxTokens: 6000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assessment_question_candidates",
          strict: true,
          schema: generatedQuestionSchema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You generate assessment question candidates for teachers. Return academically accurate questions only. Include clear answer keys and explanations. Flag possible ambiguity, answer-key uncertainty, topic mismatch, or missing context in qualityWarnings. Candidates are subject to teacher review.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const payload = JSON.parse(contentAsText(response.choices[0]?.message.content ?? "")) as {
      questions: CandidateQuestion[];
    };

    return payload.questions.map(question => ({
      ...question,
      type: input.questionTypes.includes(question.type) ? question.type : input.questionTypes[0],
      marks: Math.max(0, question.marks || input.marksPerQuestion),
      qualityWarnings: question.qualityWarnings ?? [],
    }));
  }
}

export const aiProvider: AIProvider = new BuiltInAIProvider();
