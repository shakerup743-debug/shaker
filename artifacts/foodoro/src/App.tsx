import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

import "@/i18n";
import { CurrencyProvider } from "@/contexts/currency";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";

// ── Lazy-loaded pages ──────────────────────────────────────────────────────
const SignInPage              = lazy(() => import("@/pages/sign-in"));
const SignUpPage              = lazy(() => import("@/pages/sign-up"));
const PosPage                 = lazy(() => import("@/pages/pos"));
const KitchenPage             = lazy(() => import("@/pages/kitchen"));
const ProductsPage            = lazy(() => import("@/pages/products"));
const InventoryPage           = lazy(() => import("@/pages/inventory"));
const ReportsPage             = lazy(() => import("@/pages/reports"));
const OrderPage               = lazy(() => import("@/pages/order"));
const CustomersPage           = lazy(() => import("@/pages/customers"));
const SuppliersPage           = lazy(() => import("@/pages/suppliers"));
const CouponsPage             = lazy(() => import("@/pages/coupons"));
const TablesPage              = lazy(() => import("@/pages/tables"));
const StaffPage               = lazy(() => import("@/pages/staff"));
const BranchesPage            = lazy(() => import("@/pages/branches"));
const LoyaltyPage             = lazy(() => import("@/pages/loyalty"));
const PaymentsPage            = lazy(() => import("@/pages/payments"));
const AuditPage               = lazy(() => import("@/pages/audit"));
const SecurityPage            = lazy(() => import("@/pages/security"));
const CashierShiftsPage       = lazy(() => import("@/pages/cashier-shifts"));
const ReportsAdvancedPage     = lazy(() => import("@/pages/reports-advanced"));
const NotificationsCenterPage = lazy(() => import("@/pages/notifications-center"));
const QrMenuPage              = lazy(() => import("@/pages/qr-menu"));
const FloorPlanPage           = lazy(() => import("@/pages/floor-plan"));
const CustomerAnalyticsPage   = lazy(() => import("@/pages/customer-analytics"));
const FinancialOverviewPage   = lazy(() => import("@/pages/financial-overview"));
const TenantSettingsPage      = lazy(() => import("@/pages/tenant-settings"));
const BillingPage             = lazy(() => import("@/pages/billing"));
const CashierAmendmentsPage   = lazy(() => import("@/pages/cashier-amendments"));
const SettingsPage            = lazy(() => import("@/pages/settings"));
const QrOrdersPage            = lazy(() => import("@/pages/qr-orders"));
const FraudMonitoringPage     = lazy(() => import("@/pages/fraud-monitoring"));
const DiscountSettingsPage    = lazy(() => import("@/pages/discount-settings"));
const InvoiceSettingsPage     = lazy(() => import("@/pages/invoice-settings"));
const NotFound                = lazy(() => import("@/pages/not-found"));

// Coming-soon variants (split by named export)
const AiAnalyticsComingSoon          = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.AiAnalyticsComingSoon })));
const InventoryIntelligenceComingSoon = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.InventoryIntelligenceComingSoon })));
const StaffScheduleComingSoon        = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.StaffScheduleComingSoon })));
const WebhooksComingSoon             = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.WebhooksComingSoon })));
const DeveloperComingSoon            = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.DeveloperComingSoon })));
const ApiDocsComingSoon              = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.ApiDocsComingSoon })));
const FinancialsComingSoon           = lazy(() => import("@/pages/coming-soon").then(m => ({ default: m.FinancialsComingSoon })));

// ── QueryClient ────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Page loading spinner ───────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center bg-[#111827]">
      <div className="w-8 h-8 border-2 border-[#E67E22] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Auth guard (JWT-based) ─────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111827]">
        <div className="w-8 h-8 border-2 border-[#E67E22] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/sign-in" />;
  }

  return <>{children}</>;
}

// ── App routes ─────────────────────────────────────────────────────────────
function AppRoutes() {
  const [location] = useLocation();

  if (location.split("?")[0] === "/order") {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/order" component={OrderPage} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <Switch>
      <Route path="/sign-in">
        {() => (
          <Suspense fallback={<PageLoader />}>
            <SignInPage />
          </Suspense>
        )}
      </Route>
      <Route path="/sign-up">
        {() => (
          <Suspense fallback={<PageLoader />}>
            <SignUpPage />
          </Suspense>
        )}
      </Route>
      <Route>
        {() => (
          <RequireAuth>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <Switch>
                  <Route path="/"                        component={PosPage} />
                  <Route path="/kitchen"                 component={KitchenPage} />
                  <Route path="/products"                component={ProductsPage} />
                  <Route path="/inventory"               component={InventoryPage} />
                  <Route path="/reports"                 component={ReportsPage} />
                  <Route path="/financials"              component={FinancialsComingSoon} />
                  <Route path="/customers"               component={CustomersPage} />
                  <Route path="/suppliers"               component={SuppliersPage} />
                  <Route path="/coupons"                 component={CouponsPage} />
                  <Route path="/tables"                  component={TablesPage} />
                  <Route path="/ai"                      component={AiAnalyticsComingSoon} />
                  <Route path="/staff"                   component={StaffPage} />
                  <Route path="/branches"                component={BranchesPage} />
                  <Route path="/webhooks"                component={WebhooksComingSoon} />
                  <Route path="/developer"               component={DeveloperComingSoon} />
                  <Route path="/loyalty"                 component={LoyaltyPage} />
                  <Route path="/payments"                component={PaymentsPage} />
                  <Route path="/audit"                   component={AuditPage} />
                  <Route path="/security"                component={SecurityPage} />
                  <Route path="/reports/advanced"        component={ReportsAdvancedPage} />
                  <Route path="/notifications"           component={NotificationsCenterPage} />
                  <Route path="/api-docs"                component={ApiDocsComingSoon} />
                  <Route path="/qr-menu"                 component={QrMenuPage} />
                  <Route path="/floor-plan"              component={FloorPlanPage} />
                  <Route path="/staff-schedule"          component={StaffScheduleComingSoon} />
                  <Route path="/inventory/intelligence"  component={InventoryIntelligenceComingSoon} />
                  <Route path="/customers/analytics"     component={CustomerAnalyticsPage} />
                  <Route path="/financials/overview"     component={FinancialOverviewPage} />
                  <Route path="/tenant/settings"         component={TenantSettingsPage} />
                  <Route path="/cashier/shifts"          component={CashierShiftsPage} />
                  <Route path="/cashier/amendments"      component={CashierAmendmentsPage} />
                  <Route path="/billing"                 component={BillingPage} />
                  <Route path="/settings"                component={SettingsPage} />
                  <Route path="/qr-orders"               component={QrOrdersPage} />
                  <Route path="/cashier/qr-orders"       component={QrOrdersPage} />
                  <Route path="/security/fraud"          component={FraudMonitoringPage} />
                  <Route path="/settings/discounts"      component={DiscountSettingsPage} />
                  <Route path="/settings/invoice"        component={InvoiceSettingsPage} />
                  <Route                                 component={NotFound} />
                </Switch>
              </Suspense>
            </Layout>
          </RequireAuth>
        )}
      </Route>
    </Switch>
  );
}

function AppInner() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    const dir = i18n.language === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return <AppRoutes />;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CurrencyProvider>
            <TooltipProvider>
              <AppInner />
              <Toaster />
            </TooltipProvider>
          </CurrencyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
