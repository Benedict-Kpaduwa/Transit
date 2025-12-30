import CalgaryMap from "@/CalgaryMap";
import AppContent from "@/components/layout/app-content";
import AppShell from "@/components/layout/app-shell";
import AppSidebar from "@/components/layout/app-sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell variant="sidebar">
        <AppSidebar />
        <AppContent variant="sidebar">
          <CalgaryMap />
        </AppContent>
      </AppShell>
    </QueryClientProvider>
  );
};

export default App;
