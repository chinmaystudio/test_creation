import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Activity, Archive, CalendarClock, CheckCircle2, ClipboardList, FileEdit } from "lucide-react";
import type { ReactNode } from "react";

const statusStyle = {
  draft: "border-white/10 bg-white/6 text-white/65",
  scheduled: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  live: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  completed: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  archived: "border-amber-400/20 bg-amber-400/10 text-amber-300",
} as const;

export function StatusBadge({ status }: { status: keyof typeof statusStyle }) {
  return <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.11em]", statusStyle[status])}>{status}</Badge>;
}

const icons = [ClipboardList, FileEdit, CalendarClock, Activity, CheckCircle2];
export function StatCard({ label, value, index, detail }: { label: string; value: number | string; index: number; detail: string }) {
  const Icon = icons[index] ?? Archive;
  return <section className="relative overflow-hidden rounded-2xl border border-white/7 bg-white/[0.035] p-4 text-white shadow-[0_20px_48px_rgba(0,0,0,0.12)]">
    <div className="absolute -right-5 -top-6 h-20 w-20 rounded-full bg-violet-500/10 blur-2xl" />
    <div className="flex items-start justify-between"><span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">{label}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/6"><Icon className="h-4 w-4 text-violet-300" /></span></div>
    <p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-white/40">{detail}</p>
  </section>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col gap-5 border-b border-white/7 px-5 py-6 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-8">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">{description}</p></div>
    {action}
  </header>;
}
