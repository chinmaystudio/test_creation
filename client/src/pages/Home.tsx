import { useEffect } from "react";
import { useLocation } from "wouter";

/** Routes the project entry point to the assessment portal without rendering template content. */
export default function Home() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/teacher/tests"); }, [setLocation]);
  return <div className="min-h-screen bg-[#0e0f16]" aria-busy="true" />;
}
