import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { BarChart3, BookOpen, BrainCircuit, CalendarClock, ChevronRight, ClipboardCheck, LayoutDashboard, Plus, ShieldCheck, Users } from "lucide-react";
import { useLocation } from "wouter";
import type { CSSProperties } from "react";

const teacherItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/teacher/tests" },
  { icon: ClipboardCheck, label: "All tests", path: "/teacher/tests" },
  { icon: Plus, label: "Create test", path: "/teacher/tests/create" },
  { icon: BookOpen, label: "Question bank", path: "/teacher/question-bank" },
  { icon: CalendarClock, label: "Scheduled", path: "/teacher/tests" },
  { icon: BarChart3, label: "Results", path: "/teacher/tests" },
];

const studentItems = [
  { icon: LayoutDashboard, label: "My assessments", path: "/student/tests" },
  { icon: CalendarClock, label: "Upcoming", path: "/student/tests" },
  { icon: ClipboardCheck, label: "Live now", path: "/student/tests" },
  { icon: BarChart3, label: "Results", path: "/student/tests" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const studentMode = location.startsWith("/student");
  const items = studentMode ? studentItems : teacherItems;
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" style={{ "--sidebar": "#090a0f", "--sidebar-foreground": "#f8f7ff", "--sidebar-accent": "rgba(255,255,255,.06)", "--sidebar-accent-foreground": "#ffffff", "--sidebar-border": "rgba(255,255,255,.07)" } as CSSProperties} className="border-r border-white/7 bg-[#090a0f] text-white">
        <SidebarHeader className="h-[88px] justify-center border-b border-white/7 px-3">
          <button onClick={() => setLocation(studentMode ? "/student/tests" : "/teacher/tests")} className="flex items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20"><BrainCircuit className="h-5 w-5" /></span>
            <span className="group-data-[collapsible=icon]:hidden">
              <span className="block text-[11px] font-semibold tracking-[0.24em] text-violet-300">NEUROCLASS</span>
              <span className="mt-0.5 block text-sm font-semibold tracking-tight text-white">Assessment OS</span>
            </span>
          </button>
        </SidebarHeader>
        <SidebarContent className="px-3 py-5">
          <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 group-data-[collapsible=icon]:hidden">{studentMode ? "Student workspace" : "Teacher workspace"}</div>
          <SidebarMenu className="gap-1">
            {items.map(item => {
              const active = location === item.path || (item.label === "All tests" && location === "/teacher/tests");
              return <SidebarMenuItem key={`${item.label}-${item.path}`}>
                <SidebarMenuButton isActive={active} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 rounded-xl px-3 text-white/60 hover:bg-white/6 hover:text-white data-[active=true]:bg-violet-500/13 data-[active=true]:text-violet-100">
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>;
            })}
          </SidebarMenu>
          {!studentMode && <div className="mx-2 mt-8 rounded-2xl border border-violet-400/15 bg-violet-500/8 p-3.5 group-data-[collapsible=icon]:hidden">
            <ShieldCheck className="h-4 w-4 text-violet-300" />
            <p className="mt-2 text-xs font-medium text-white">Integrity-first delivery</p>
            <p className="mt-1 text-[11px] leading-4 text-white/50">Review evidence, never make automated accusations.</p>
          </div>}
        </SidebarContent>
        <SidebarFooter className="border-t border-white/7 p-3">
          {isAuthenticated ? <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 border border-white/10"><AvatarFallback className="bg-white/8 text-[11px] text-white">{user?.name?.slice(0, 1).toUpperCase() || "N"}</AvatarFallback></Avatar>
            <button onClick={logout} className="min-w-0 text-left group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-medium text-white">{user?.name || "NeuroClass user"}</p><p className="mt-0.5 text-[10px] text-white/40">Sign out</p></button>
          </div> : <Button onClick={() => startLogin()} size="sm" className="w-full rounded-xl bg-white text-black hover:bg-violet-100 group-data-[collapsible=icon]:px-0"><Users className="h-4 w-4" /><span className="group-data-[collapsible=icon]:hidden">Sign in</span></Button>}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-screen bg-[#f6f7fb] dark:bg-[#0e0f16]">
        {isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/8 bg-[#0e0f16]/95 px-3 text-white backdrop-blur"><SidebarTrigger className="rounded-lg text-white" /><span className="text-sm font-medium">Assessment OS</span><ChevronRight className="h-4 w-4 text-white/30" /></div>}
        <main className="min-h-screen">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
