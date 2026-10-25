import { useLocation } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

function AppContent(): JSX.Element {
  const location = useLocation();
  const isPuzzleRoom = location.pathname.startsWith("/room/");

  if (isPuzzleRoom) {
    return (
      <div style={{ height: "100vh", maxHeight: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <main style={{ flex: 1, height: "100%", overflow: "hidden" }}>
          <AppRouter />
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <AppRouter />
      </main>
      <SiteFooter />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
