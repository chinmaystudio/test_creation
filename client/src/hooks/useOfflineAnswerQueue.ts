import { useCallback, useEffect, useRef, useState } from "react";

export type QueuedAnswer = {
  attemptId: string;
  questionId: number;
  answer: string;
  markedForReview: boolean;
};

function storageKey(attemptId: string) { return `neuroclass:answer-queue:${attemptId}`; }

export function useOfflineAnswerQueue(
  attemptId: string | undefined,
  send: (answer: QueuedAnswer) => Promise<unknown>
) {
  const [queuedCount, setQueuedCount] = useState(0);
  const sending = useRef(false);

  const getQueue = useCallback((): QueuedAnswer[] => {
    if (!attemptId || typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(storageKey(attemptId)) ?? "[]") as QueuedAnswer[]; } catch { return []; }
  }, [attemptId]);

  const setQueue = useCallback((entries: QueuedAnswer[]) => {
    if (!attemptId || typeof window === "undefined") return;
    localStorage.setItem(storageKey(attemptId), JSON.stringify(entries));
    setQueuedCount(entries.length);
  }, [attemptId]);

  const enqueue = useCallback((answer: QueuedAnswer) => {
    const existing = getQueue().filter(item => item.questionId !== answer.questionId);
    setQueue([...existing, answer]);
  }, [getQueue, setQueue]);

  const acknowledge = useCallback((questionId: number) => {
    setQueue(getQueue().filter(item => item.questionId !== questionId));
  }, [getQueue, setQueue]);

  const flush = useCallback(async () => {
    if (!attemptId || sending.current || !navigator.onLine) return;
    sending.current = true;
    const queued = getQueue();
    const unsent: QueuedAnswer[] = [];
    for (const entry of queued) {
      try { await send(entry); } catch { unsent.push(entry); }
    }
    setQueue(unsent);
    sending.current = false;
  }, [attemptId, getQueue, send, setQueue]);

  useEffect(() => { setQueuedCount(getQueue().length); }, [getQueue]);
  useEffect(() => { window.addEventListener("online", flush); return () => window.removeEventListener("online", flush); }, [flush]);
  return { queuedCount, enqueue, acknowledge, flush };
}
