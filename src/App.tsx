import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DashboardLayout from "@/layouts/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import MembersPage from "@/pages/MembersPage";
import MemberDetailPage from "@/pages/MemberDetailPage";
import FundPage from "@/pages/FundPage";
import CashInHandPage from "@/pages/CashInHandPage";
import IslamicLoansPage from "@/pages/IslamicLoansPage";
import IslamicLoanDetailPage from "@/pages/IslamicLoanDetailPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import MemberLoansPage from "@/pages/MemberLoansPage";
import MemberLoansByMemberPage from "@/pages/MemberLoansByMemberPage";
import MemberLoanDetailPage from "@/pages/MemberLoanDetailPage";
import PhoneBookPage from "@/pages/PhoneBookPage";
import AssetsPage from "@/pages/AssetsPage";
import TutorialsPage from "@/pages/TutorialsPage";
import TasksPage from "@/pages/TasksPage";
import RulesPage from "@/pages/RulesPage";
import DefaultSettingsPage from "@/pages/DefaultSettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data remains fresh for 5 minutes (prevents reload when navigating back)
      gcTime: 1000 * 60 * 30,    // Keep cache in memory for 30 minutes
      refetchOnWindowFocus: false, // Don't refetch every time user switches tabs
      refetchOnReconnect: true,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="members/:id" element={<MemberDetailPage />} />
              <Route path="fund" element={<FundPage />} />
              <Route path="cash-in-hand" element={<CashInHandPage />} />
              <Route path="islamic-loans" element={<IslamicLoansPage />} />
              <Route path="islamic-loans/:id" element={<IslamicLoanDetailPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route path="member-loans" element={<MemberLoansPage />} />
              <Route path="member-loans/m/:memberId" element={<MemberLoansByMemberPage />} />
              <Route path="member-loans/:id" element={<MemberLoanDetailPage />} />
              <Route path="phone-book" element={<PhoneBookPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="tutorials" element={<TutorialsPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route path="default-settings" element={<DefaultSettingsPage />} />
              <Route path="payment-defaults" element={<DefaultSettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
