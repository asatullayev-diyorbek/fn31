import { Routes, Route } from "react-router-dom";
import { LandingPage } from "@/features/dashboard/LandingPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { PuzzleDemoPage } from "@/features/puzzle/PuzzleDemoPage";
import { LoginPage } from "@/features/telegram-auth/LoginPage";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { CreatePuzzlePage } from "@/features/rooms/CreatePuzzlePage";
import { PuzzleRoomPage } from "@/features/puzzle/PuzzleRoomPage";
import { JoinRoomPage } from "@/features/rooms/JoinRoomPage";
import { AdminPage } from "@/features/admin/AdminPage";

export function AppRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<PuzzleDemoPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join" element={<JoinRoomPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />
      <Route
        path="/create"
        element={
          <RequireAuth>
            <CreatePuzzlePage />
          </RequireAuth>
        }
      />
      <Route
        path="/room/:roomId/next"
        element={
          <RequireAuth>
            <CreatePuzzlePage />
          </RequireAuth>
        }
      />
      <Route
        path="/room/:roomId"
        element={
          <RequireAuth>
            <PuzzleRoomPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
