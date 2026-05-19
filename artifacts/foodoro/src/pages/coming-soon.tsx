import { useTranslation } from "react-i18next";
import { Clock, Lock, Rocket } from "lucide-react";

interface ComingSoonProps {
  featureEn: string;
  featureAr: string;
  phase: number;
  phaseNameEn: string;
  phaseNameAr: string;
  etaEn: string;
  etaAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export function ComingSoon({
  featureEn,
  featureAr,
  phase,
  phaseNameEn,
  phaseNameAr,
  etaEn,
  etaAr,
  descriptionEn,
  descriptionAr,
}: ComingSoonProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const feature = isAr ? featureAr : featureEn;
  const phaseName = isAr ? phaseNameAr : phaseNameEn;
  const eta = isAr ? etaAr : etaEn;
  const description = isAr ? descriptionAr : descriptionEn;

  return (
    <div className="h-full flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Rocket className="w-10 h-10 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30">
              Phase {phase}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{feature}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-start">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {isAr ? "الجدول الزمني المتوقع" : "Expected Timeline"}
              </p>
              <p className="text-sm font-semibold text-foreground">{eta}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {isAr ? "المرحلة" : "Development Phase"}
              </p>
              <p className="text-sm font-semibold text-foreground">Phase {phase} — {phaseName}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {isAr
            ? "هذه الميزة قيد التطوير وستصبح متاحة في الإصدار القادم."
            : "This feature is under development and will be available in an upcoming release."}
        </p>
      </div>
    </div>
  );
}

export function AiAnalyticsComingSoon() {
  return (
    <ComingSoon
      featureEn="AI Analytics & Insights"
      featureAr="تحليلات الذكاء الاصطناعي"
      phase={3}
      phaseNameEn="AI Core"
      phaseNameAr="النواة الذكية"
      etaEn="Q1–Q2 2027"
      etaAr="الربع الأول–الثاني 2027"
      descriptionEn="AI-powered demand forecasting, smart menu recommendations, and natural language business insights — generated automatically every night."
      descriptionAr="توقعات الطلب بالذكاء الاصطناعي، توصيات القائمة الذكية، وتحليلات الأعمال بالغة الطبيعية — تُولَّد تلقائياً كل ليلة."
    />
  );
}

export function InventoryIntelligenceComingSoon() {
  return (
    <ComingSoon
      featureEn="Inventory Intelligence"
      featureAr="ذكاء المخزون"
      phase={3}
      phaseNameEn="AI Core"
      phaseNameAr="النواة الذكية"
      etaEn="Q1–Q2 2027"
      etaAr="الربع الأول–الثاني 2027"
      descriptionEn="Predictive stock management: AI forecasts shortages 7 days ahead, suggests optimal reorder quantities, and auto-triggers purchase orders."
      descriptionAr="إدارة المخزون التنبؤية: الذكاء الاصطناعي يتوقع النواقص قبل 7 أيام، ويقترح كميات الطلب المثلى، ويُفعّل أوامر الشراء تلقائياً."
    />
  );
}

export function StaffScheduleComingSoon() {
  return (
    <ComingSoon
      featureEn="Staff Scheduling"
      featureAr="جدولة الموظفين"
      phase={4}
      phaseNameEn="Workflow Engine"
      phaseNameAr="محرك سير العمل"
      etaEn="Q3 2027"
      etaAr="الربع الثالث 2027"
      descriptionEn="Automated shift scheduling with demand-based staffing recommendations, overtime tracking, and shift swap approvals."
      descriptionAr="جدولة المناوبات التلقائية مع توصيات التوظيف بناءً على الطلب، تتبع العمل الإضافي، وموافقات تبادل الورديات."
    />
  );
}

export function WebhooksComingSoon() {
  return (
    <ComingSoon
      featureEn="Webhook Management"
      featureAr="إدارة Webhooks"
      phase={6}
      phaseNameEn="Platform & Marketplace"
      phaseNameAr="المنصة والسوق"
      etaEn="Q1 2028"
      etaAr="الربع الأول 2028"
      descriptionEn="Subscribe to real-time events (order created, inventory low, ticket updated) and push them to any external system or integration."
      descriptionAr="اشترك في الأحداث الفورية (طلب جديد، مخزون منخفض، تذكرة محدّثة) وأرسلها إلى أي نظام خارجي أو تكامل."
    />
  );
}

export function DeveloperComingSoon() {
  return (
    <ComingSoon
      featureEn="Developer API & API Keys"
      featureAr="واجهة برمجية للمطورين"
      phase={6}
      phaseNameEn="Platform & Marketplace"
      phaseNameAr="المنصة والسوق"
      etaEn="Q1 2028"
      etaAr="الربع الأول 2028"
      descriptionEn="Public REST API with OAuth2 authentication, scoped API keys, and rate limiting — so third-party apps can integrate with your restaurant data."
      descriptionAr="واجهة برمجية REST عامة مع مصادقة OAuth2، مفاتيح API محدودة الصلاحيات، وتحديد معدل الطلبات — لتكامل تطبيقات الطرف الثالث مع بيانات مطعمك."
    />
  );
}

export function ApiDocsComingSoon() {
  return (
    <ComingSoon
      featureEn="API Documentation"
      featureAr="توثيق API"
      phase={6}
      phaseNameEn="Platform & Marketplace"
      phaseNameAr="المنصة والسوق"
      etaEn="Q1 2028"
      etaAr="الربع الأول 2028"
      descriptionEn="Interactive API documentation with live examples, authentication guides, and SDK downloads for developers building on FOODPRO."
      descriptionAr="توثيق API تفاعلي مع أمثلة حية، أدلة المصادقة، وتنزيلات SDK للمطورين الذين يبنون على منصة FOODPRO."
    />
  );
}

export function FinancialsComingSoon() {
  return (
    <ComingSoon
      featureEn="P&L Financial Reports"
      featureAr="تقارير الأرباح والخسائر"
      phase={3}
      phaseNameEn="AI Core"
      phaseNameAr="النواة الذكية"
      etaEn="Q1–Q2 2027"
      etaAr="الربع الأول–الثاني 2027"
      descriptionEn="Full Profit & Loss statements, monthly revenue breakdowns, COGS analysis, gross margin tracking, and VAT reconciliation reports."
      descriptionAr="كشوفات الأرباح والخسائر الكاملة، تحليل الإيرادات الشهرية، تكلفة البضائع المباعة، تتبع هامش الربح الإجمالي، وتقارير تسوية ضريبة القيمة المضافة."
    />
  );
}
