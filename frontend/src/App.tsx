import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { InventoryMapPage } from "./pages/InventoryMapPage";

// The two chart-heavy pages pull in Recharts, which is large. Loading them on
// demand keeps the map -- the page a judge lands on -- as small as possible.
const FacilityDashboardPage = lazy(() =>
  import("./pages/FacilityDashboardPage").then((m) => ({ default: m.FacilityDashboardPage })),
);
const NetworkRedistributionPage = lazy(() =>
  import("./pages/NetworkRedistributionPage").then((m) => ({
    default: m.NetworkRedistributionPage,
  })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

function PageFallback() {
  return <p className="p-6 text-sm text-ink-muted">Loading\u2026</p>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<InventoryMapPage />} />
              <Route path="/facility" element={<FacilityDashboardPage />} />
              <Route path="/facility/:facilityId" element={<FacilityDashboardPage />} />
              <Route path="/network" element={<NetworkRedistributionPage />} />
            </Routes>
          </Suspense>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
