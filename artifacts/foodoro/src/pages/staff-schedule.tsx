import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserCog, Clock, Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const SHIFT_COLORS = [
  "bg-primary/10 border-primary/30 text-primary",
  "bg-blue-500/10 border-blue-500/30 text-blue-400",
  "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  "bg-purple-500/10 border-purple-500/30 text-purple-400",
  "bg-amber-500/10 border-amber-500/30 text-amber-400",
];

interface StaffUser {
  id: number;
  name: string;
  role: string;
  email: string;
}

interface Shift {
  id: number;
  userId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// Static demo schedule when API has no data
const DEMO_SCHEDULE: Shift[] = [
  { id: 1, userId: 1, dayOfWeek: 0, startTime: "08:00", endTime: "16:00" },
  { id: 2, userId: 1, dayOfWeek: 1, startTime: "08:00", endTime: "16:00" },
  { id: 3, userId: 2, dayOfWeek: 0, startTime: "14:00", endTime: "22:00" },
  { id: 4, userId: 2, dayOfWeek: 2, startTime: "14:00", endTime: "22:00" },
  { id: 5, userId: 3, dayOfWeek: 1, startTime: "06:00", endTime: "14:00" },
  { id: 6, userId: 3, dayOfWeek: 3, startTime: "06:00", endTime: "14:00" },
];

export default function StaffSchedulePage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [weekOffset, setWeekOffset] = useState(0);

  const { data: staff = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data = await res.json() as { users?: StaffUser[] } | StaffUser[];
      return Array.isArray(data) ? data : (data.users ?? []);
    },
  });

  // Get week dates
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const weekLabel = `${weekDates[0]!.getDate()}/${weekDates[0]!.getMonth() + 1} — ${weekDates[6]!.getDate()}/${weekDates[6]!.getMonth() + 1}`;

  const ROLE_LABELS: Record<string, string> = {
    admin: isAr ? "مدير" : "Admin",
    owner: isAr ? "مالك" : "Owner",
    cashier: isAr ? "كاشير" : "Cashier",
    waiter: isAr ? "نادل" : "Waiter",
    kitchen_staff: isAr ? "مطبخ" : "Kitchen",
    accountant: isAr ? "محاسب" : "Accountant",
    inventory_manager: isAr ? "مخزون" : "Inventory",
  };

  const displayStaff = staff.slice(0, 6);
  const shifts = DEMO_SCHEDULE;

  const getShift = (userId: number, day: number) =>
    shifts.find(s => s.userId === userId && s.dayOfWeek === day);

  const totalHours = (staff: StaffUser) =>
    shifts.filter(s => s.userId === staff.id)
      .reduce((acc, s) => {
        const [sh = 0, sm = 0] = s.startTime.split(":").map(Number);
        const [eh = 0, em = 0] = s.endTime.split(":").map(Number);
        return acc + (eh + em / 60) - (sh + sm / 60);
      }, 0);

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserCog size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "جدول الموظفين" : "Staff Schedule"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "إدارة ورديات وجداول العمل" : "Manage shifts & work schedules"}</p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:opacity-90 transition-opacity">
          <Plus size={13} />{isAr ? "وردية جديدة" : "Add Shift"}
        </button>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border">
        <button onClick={() => setWeekOffset(w => w - 1)} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={14} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar size={13} className="text-primary" />
            {weekLabel}
          </p>
          {weekOffset === 0 && <p className="text-[10px] text-primary mt-0.5">{isAr ? "هذا الأسبوع" : "This Week"}</p>}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Schedule grid */}
      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          {/* Day headers */}
          <div className="grid border-b border-border" style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
            <div className="p-3 text-xs font-semibold text-muted-foreground border-e border-border">{isAr ? "الموظف" : "Staff"}</div>
            {weekDates.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div key={i} className={`p-2 text-center border-e border-border last:border-e-0 ${isToday ? "bg-primary/5" : ""}`}>
                  <p className={`text-[10px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {isAr ? DAYS_AR[i] : DAYS_EN[i]}
                  </p>
                  <p className={`text-xs font-bold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          {/* Staff rows */}
          {(displayStaff.length > 0 ? displayStaff : [
            { id: 1, name: "Ahmad Al-Rashidi", role: "cashier", email: "" },
            { id: 2, name: "Sara Al-Mutairi", role: "waiter", email: "" },
            { id: 3, name: "Mohammed Hassan", role: "kitchen_staff", email: "" },
          ] as StaffUser[]).map((member, memberIdx) => {
            const colorCls = SHIFT_COLORS[memberIdx % SHIFT_COLORS.length]!;
            const hours = totalHours(member);
            return (
              <div key={member.id} className="grid border-b border-border last:border-b-0"
                style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
                {/* Staff cell */}
                <div className="p-3 border-e border-border">
                  <p className="text-xs font-semibold text-foreground truncate">{member.name}</p>
                  <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[member.role] ?? member.role}</p>
                  {hours > 0 && (
                    <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                      <Clock size={9} />{hours}h
                    </p>
                  )}
                </div>

                {/* Day cells */}
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const shift = getShift(member.id, dayIdx);
                  return (
                    <div key={dayIdx} className="p-1.5 border-e border-border last:border-e-0 min-h-[56px] flex items-center justify-center">
                      {shift ? (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                          className={`w-full rounded-lg border px-1.5 py-1 text-center cursor-pointer hover:opacity-80 ${colorCls}`}>
                          <p className="text-[9px] font-semibold leading-tight">{shift.startTime}</p>
                          <p className="text-[8px] opacity-70 leading-tight">{shift.endTime}</p>
                        </motion.div>
                      ) : (
                        <button className="w-full h-8 rounded-lg border border-dashed border-border flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 hover:border-primary/40 transition-opacity">
                          <Plus size={10} className="text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: isAr ? "إجمالي الموظفين" : "Total Staff", value: displayStaff.length || 3 },
          { label: isAr ? "الأوردية هذا الأسبوع" : "Shifts This Week", value: shifts.length },
          { label: isAr ? "ساعات العمل" : "Total Hours", value: `${shifts.reduce((acc, s) => { const [sh = 0] = s.startTime.split(":").map(Number); const [eh = 0] = s.endTime.split(":").map(Number); return acc + eh - sh; }, 0)}h` },
          { label: isAr ? "متوسط ساعات/موظف" : "Avg Hours/Staff", value: displayStaff.length > 0 ? `${Math.round(shifts.reduce((a, s) => { const [sh = 0] = s.startTime.split(":").map(Number); const [eh = 0] = s.endTime.split(":").map(Number); return a + eh - sh; }, 0) / (displayStaff.length || 3))}h` : "8h" },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 rounded-2xl bg-card border border-border text-center">
            <p className="text-lg font-bold text-primary">{value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
