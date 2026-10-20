import { Routes, Route } from "react-router-dom";
import { LandingPage } from "@/features/dashboard/LandingPage";
import { PuzzleDemoPage } from "@/features/puzzle/PuzzleDemoPage";

export function AppRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<PuzzleDemoPage />} />
    </Routes>
  );
}
