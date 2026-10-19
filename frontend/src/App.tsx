import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { retryDelay, retryWhileWaking } from "./api/retry";
import { AppShell } from "./components/AppShell";
import { SHOW_WITHOUT_ZEALO } from "./config";
import { StoryPage } from "./pages/StoryPage";

// The pitch page is where a demo starts, so it is the only page loaded up front.
// The map (Leaflet) and the chart pages (Recharts) load on demand; the map's chunk
// is fetched while the presenter is still on the pitch page.
const loadMap = () =>
  import("./pages/InventoryMapPage").then((m) => ({ default: m.InventoryMapPage }));
const InventoryMapPage = lazy(loadMap);
void loadMap();
const FacilityDashboardPage = lazy(() =>
  import("./pages/FacilityDashboardPage").then((m) => ({ default: m.FacilityDashboardPage })),
);
const ComparisonPage = lazy(() =>
  import("./pages/ComparisonPage").then((m) => ({ default: m.ComparisonPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const DataSourcesPage = lazy(() =>
  import("./pages/DataSourcesPage").then((m) => ({ default: m.DataSourcesPage })),
);
const AboutPage = lazy(() => import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const NetworkRedistributionPage = lazy(() =>
  import("./pages/NetworkRedistributionPage").then((m) => ({
    default: m.NetworkRedistributionPage,
  })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    // Keep retrying while a sleeping API wakes up; otherwise one retry, as before.
    queries: {
      retry: (count, error) => retryWhileWaking(count, error) || count < 1,
      retryDelay,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function PageFallback() {
  return <p className="p-6 text-sm text-ink-2">Loading\u2026</p>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<StoryPage />} />
              <Route path="/map" element={<InventoryMapPage />} />
              <Route path="/facility" element={<FacilityDashboardPage />} />
              <Route path="/facility/:facilityId" element={<FacilityDashboardPage />} />
              <Route path="/network" element={<NetworkRedistributionPage />} />
              <Route
                path="/compare"
                element={SHOW_WITHOUT_ZEALO ? <ComparisonPage /> : <Navigate to="/map" replace />}
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/sources" element={<DataSourcesPage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </Suspense>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
