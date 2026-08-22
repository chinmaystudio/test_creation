import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

export default function ClassroomPortal() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const { isAuthenticated } = useAuth();
  const context = trpc.sharedClassroom.context.useQuery({ classroomId: classroomId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(classroomId && isAuthenticated) });
  const [active, setActive] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const start = trpc.sharedClassroom.startAttempt.useMutation();
  const submit = trpc.sharedClassroom.submit.useMutation();
  const verify = trpc.sharedClassroom.verifyFace.useMutation();
  const create = trpc.sharedClassroom.create.useMutation({ onSuccess: () => { context.refetch(); setNewTitle(""); } });
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("Computer Science");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const tests = context.data?.tests ?? [];
  const activeQuestions = useMemo(() => active?.test?.questions ?? [], [active]);
  const verifyFromCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    await new Promise(resolve => setTimeout(resolve, 500));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach(track => track.stop());
    verify.mutate({ attemptId: active.attemptId, imageDataUrl: canvas.toDataURL("image/jpeg", 0.82) });
  };

  if (!isAuthenticated) return <main className="min-h-screen bg-slate-950 p-8 text-white"><h1 className="text-2xl font-bold">NeuroClass classroom tests</h1><p className="mt-3 text-slate-300">Sign in with your NeuroClass account to continue.</p><button className="mt-6 rounded-lg bg-indigo-500 px-4 py-2 font-semibold" onClick={() => startLogin()}>Sign in</button></main>;
  if (context.isLoading) return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading classroom tests…</main>;
  if (context.error) return <main className="min-h-screen bg-slate-950 p-8 text-white"><h1 className="text-xl font-bold">Classroom access denied</h1><p className="mt-2 text-red-300">{context.error.message}</p></main>;

  if (active) return <main className="min-h-screen bg-slate-950 p-5 text-white sm:p-8"><div className="mx-auto max-w-4xl"><button className="mb-6 text-sm text-indigo-300" onClick={() => setActive(null)}>← Back to classroom tests</button><h1 className="text-2xl font-bold">{active.test.title}</h1><p className="mt-2 text-sm text-slate-400">{active.test.duration_mins} minutes · {active.test.total_marks} marks · Face verification is processed server-side.</p><div className="mt-6 space-y-5">{activeQuestions.map((question: any, index: number) => <section key={index} className="rounded-xl border border-white/10 bg-white/5 p-5"><p className="font-semibold">{index + 1}. {question.questionText}</p>{question.options?.length ? <div className="mt-4 space-y-2">{question.options.map((option: any, optionIndex: number) => <label key={optionIndex} className="flex gap-3 rounded-lg border border-white/10 p-3"><input type="radio" name={`q-${index}`} onChange={() => setAnswers(value => ({ ...value, [String(index)]: option.text }))} />{option.text}</label>)}</div> : <textarea className="mt-4 w-full rounded-lg bg-slate-900 p-3" onChange={event => setAnswers(value => ({ ...value, [String(index)]: event.target.value }))} />}</section>)}</div><div className="mt-6 flex flex-wrap gap-3"><button className="rounded-lg border border-indigo-400 px-4 py-2 text-indigo-200" onClick={() => void verifyFromCamera()}>Verify face</button><button className="rounded-lg bg-indigo-500 px-5 py-2 font-semibold" onClick={() => submit.mutate({ attemptId: active.attemptId, answers }, { onSuccess: result => { window.alert(`Submitted. Score: ${result.score}/${active.test.total_marks}`); setActive(null); } })}>Submit test</button></div>{verify.data && <p className={`mt-4 text-sm ${verify.data.verified ? "text-emerald-300" : "text-amber-300"}`}>{verify.data.verified ? "Face verified." : `Face review: ${verify.data.reason ?? verify.data.state}`}</p>}</div></main>;

  return (
    <main className="min-h-screen bg-[#050B14] p-5 text-white sm:p-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[#7B86E8]">
          NEUROCLASS CLASSROOM
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          {context.data?.classroom?.name ?? "Tests"}
        </h1>
        <p className="mt-3 text-[#8A96A8]">
          {context.data?.role === "student"
            ? "Only tests published for your enrolled classroom are shown."
            : "Create and publish tests for this classroom using the shared NeuroClass database."}
        </p>

        {context.data?.role === "teacher" && (
          <form
            className="mt-8 rounded-2xl bg-[#0F172A] p-6 shadow-sm ring-1 ring-white/5"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({
                classroomId: classroomId!,
                title: newTitle,
                subject: newSubject,
                durationMins: 45,
                totalMarks: 1,
                publish: true,
                proctoringEnabled: true,
                questions: [
                  {
                    type: "short_answer",
                    questionText: newQuestion,
                    options: [],
                    correctAnswer: newAnswer,
                    marks: 1,
                    negativeMarks: 0,
                  },
                ],
              });
            }}
          >
            <h2 className="text-lg font-semibold text-white">Create a classroom test</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <input
                required
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Test title"
                className="rounded-xl bg-[#172136] px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-[#7B86E8]"
              />
              <input
                required
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder="Subject"
                className="rounded-xl bg-[#172136] px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-[#7B86E8]"
              />
              <input
                required
                value={newQuestion}
                onChange={(event) => setNewQuestion(event.target.value)}
                placeholder="Question"
                className="rounded-xl bg-[#172136] px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-[#7B86E8]"
              />
              <input
                required
                value={newAnswer}
                onChange={(event) => setNewAnswer(event.target.value)}
                placeholder="Correct answer"
                className="rounded-xl bg-[#172136] px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-[#7B86E8]"
              />
            </div>
            <button
              disabled={create.isPending}
              className="mt-6 rounded-xl bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-50"
            >
              {create.isPending ? "Publishing…" : "Publish to this classroom"}
            </button>
          </form>
        )}

        <div className="mt-8 space-y-4">
          {tests.map((test: any) => (
            <article
              key={test.id}
              className="rounded-2xl bg-[#0F172A] p-6 shadow-sm ring-1 ring-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">{test.title}</h2>
                  <p className="mt-1 text-sm text-[#8A96A8]">{test.subject}</p>
                </div>
                <span className="rounded-full bg-[#1E1B4B] px-3 py-1 text-xs font-medium text-[#818CF8]">
                  {test.status}
                </span>
              </div>
              <p className="mt-6 text-sm text-[#8A96A8]">
                {test.duration_mins} minutes · {test.total_marks} marks ·{" "}
                {(test.questions ?? []).length} questions
              </p>
              {context.data?.role === "student" && (
                <button
                  className="mt-5 rounded-xl bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-50"
                  disabled={test.status !== "published" && test.status !== "live"}
                  onClick={() =>
                    start.mutate(
                      { classroomId: classroomId!, testId: test.id },
                      { onSuccess: setActive }
                    )
                  }
                >
                  Start test
                </button>
              )}
            </article>
          ))}
          {tests.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-[#8A96A8]">
              No tests are published for this classroom yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
