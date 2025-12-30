import CalgaryMap from "@/CalgaryMap";
import AppContent from "@/components/layout/app-content";
import AppShell from "@/components/layout/app-shell";
import AppSidebar from "@/components/layout/app-sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/theme-provider";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <AppShell variant="sidebar">
          <AppSidebar />
          <AppContent variant="sidebar">
            <CalgaryMap />
          </AppContent>
        </AppShell>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
