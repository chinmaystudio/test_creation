import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import QuestionBank from "./pages/QuestionBank";
import TeacherPreview from "./pages/TeacherPreview";
import TeacherTests from "./pages/TeacherTests";
import TestWizard from "./pages/TestWizard";
import PreExamCheck from "./pages/PreExamCheck";
import StudentExam from "./pages/StudentExam";
import StudentTests from "./pages/StudentTests";
import StudentResult from "./pages/StudentResult";
import TeacherResults from "./pages/TeacherResults";
import ClassroomPortal from "./pages/ClassroomPortal";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/teacher/tests"} component={TeacherTests} />
      <Route path={"/teacher/tests/create"} component={TestWizard} />
      <Route path={"/teacher/tests/:testId/preview"} component={TeacherPreview} />
      <Route path={"/teacher/question-bank"} component={QuestionBank} />
      <Route path={"/teacher/tests/:testId/results"} component={TeacherResults} />
      <Route path={"/classroom/:classroomId"} component={ClassroomPortal} />
      <Route path={"/student/tests"} component={StudentTests} />
      <Route path={"/student/tests/:testId/check"} component={PreExamCheck} />
      <Route path={"/student/tests/:testId/attempt"} component={StudentExam} />
      <Route path={"/student/tests/:testId/results"} component={StudentResult} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
