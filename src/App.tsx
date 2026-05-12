import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Atendimentos from "./pages/Atendimentos";
import Knowledge from "./pages/Knowledge";
import Integrations from "./pages/Integrations";
import Contacts from "./pages/Contacts";
import CRM from "./pages/CRM";
import Chat from "./pages/Chat";
import Billing from "./pages/Billing";
import Profile from "./pages/Profile";
import Teams from "./pages/Teams";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import SuperAdmin from "./pages/SuperAdmin";
// Organization is now embedded as a tab in Teams
import WidgetChat from "./pages/WidgetChat";
import Tasks from "./pages/Tasks";
import LeadDetail from "./pages/LeadDetail";
import ResetPassword from "./pages/ResetPassword";
import GmailOAuthCallback from "./pages/GmailOAuthCallback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,              // always refetch on mount
      gcTime: 5 * 60_000,       // 5 min garbage-collection
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <LanguageProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/gmail-oauth-callback" element={<GmailOAuthCallback />} />
            <Route path="/widget/:id/iframe" element={<WidgetChat />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/atendimentos" element={<Atendimentos />} />
              <Route path="/agentes" element={<Agents />} />
              <Route path="/conhecimento" element={<Knowledge />} />
              <Route path="/canais" element={<Integrations />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/crm" element={<CRM />} />
              <Route path="/tarefas" element={<Tasks />} />
              <Route path="/crm/lead/:id" element={<LeadDetail />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/perfil" element={<Navigate to="/configuracoes" replace />} />
              <Route path="/equipe" element={<Teams />} />
              <Route path="/configuracoes" element={<Settings />} />
              <Route path="/relatorios" element={<Reports />} />
              <Route path="/organizacao" element={<Navigate to="/equipe" replace />} />
              <Route path="/super-admin" element={<SuperAdmin />} />
              {/* Redirects for old routes */}
              <Route path="/integrations" element={<Navigate to="/canais" replace />} />
              <Route path="/agents" element={<Navigate to="/agentes" replace />} />
              <Route path="/knowledge" element={<Navigate to="/conhecimento" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </LanguageProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
