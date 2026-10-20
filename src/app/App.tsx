import { AppProviders } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export function App(): JSX.Element {
  return (
    <AppProviders>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <SiteHeader />
        <main style={{ flex: 1 }}>
          <AppRouter />
        </main>
        <SiteFooter />
      </div>
    </AppProviders>
  );
}
