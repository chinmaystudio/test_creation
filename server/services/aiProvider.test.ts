import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterAIProvider } from "./aiProvider";

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const originalOpenRouterModel = process.env.OPENROUTER_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
});

describe("OpenRouterAIProvider", () => {
  it("uses the server-side key and preserves the ordered question contract", async () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
      expect(body.stream).toBe(false);
      expect(body.response_format).toBeUndefined();
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("JSON");
      expect(body.messages[1].content).toContain("Generate exactly 3 questions in this order: 1. 2 mcq; 2. 1 true_false");
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  questionText: "One?",
                  type: "mcq",
                  options: [{ text: "A", isCorrect: true }],
                  correctAnswer: "A",
                  explanation: "Because.",
                  marks: 1,
                  difficulty: "medium",
                  topic: "Topic",
                  learningObjective: "Objective",
                  qualityWarnings: [],
                },
                {
                  questionText: "Two?",
                  type: "mcq",
                  options: [],
                  correctAnswer: "B",
                  explanation: "Because.",
                  marks: 1,
                  difficulty: "medium",
                  topic: "Topic",
                  learningObjective: "Objective",
                  qualityWarnings: [],
                },
                {
                  questionText: "Three?",
                  type: "true_false",
                  options: [],
                  correctAnswer: "True",
                  explanation: "Because.",
                  marks: 1,
                  difficulty: "medium",
                  topic: "Topic",
                  learningObjective: "Objective",
                  qualityWarnings: [],
                },
              ],
            }),
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const questions = await new OpenRouterAIProvider().generateQuestions({
      subject: "Science",
      topic: "Plants",
      gradeLevel: "8",
      difficulty: "medium",
      count: 3,
      questionTypes: ["mcq", "true_false"],
      marksPerQuestion: 1,
      learningObjective: "Understand photosynthesis",
      generationMode: "knowledge_base",
      formatPlan: "2 MCQ then 1 true false",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer test-openrouter-key",
      "Content-Type": "application/json",
    });
    expect(questions).toHaveLength(3);
    expect(questions[0].type).toBe("mcq");
    expect(questions[2].type).toBe("true_false");
    expect(questions[2].options).toEqual([
      { text: "True", isCorrect: true },
      { text: "False", isCorrect: false },
    ]);
  });

  it("fails clearly when the server key is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(new OpenRouterAIProvider().generateQuestions({
      subject: "Science",
      topic: "Plants",
      gradeLevel: "8",
      difficulty: "medium",
      count: 1,
      questionTypes: ["mcq"],
      marksPerQuestion: 1,
      learningObjective: "Understand photosynthesis",
    })).rejects.toThrow("OPENROUTER_API_KEY");
  });
});
