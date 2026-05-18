import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

interface DashboardStats {
  todayRevenue?: number;
  yesterdayRevenue?: number;
  todayOrders?: number;
  yesterdayOrders?: number;
  pendingKitchenTickets?: number;
  lowStockCount?: number;
  monthRevenue?: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.kpiDot, { backgroundColor: color + "30" }]}>
        <View style={[styles.kpiDotInner, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.kpiValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {sub && <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>{sub}</Text>}
    </View>
  );
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");

  const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";

  const today = new Date().toISOString().split("T")[0]!;

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["mobile-analytics-stats"],
    queryFn: async () => {
      const token = await AsyncStorage.getItem("foodoro-token");
      const res = await fetch(`${BASE_URL}/api/reports/dashboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return {};
      return res.json() as Promise<DashboardStats>;
    },
  });

  const { data: topProducts = [], isLoading: topLoading } = useQuery<TopProduct[]>({
    queryKey: ["mobile-top-products", today],
    queryFn: async () => {
      const token = await AsyncStorage.getItem("foodoro-token");
      const res = await fetch(`${BASE_URL}/api/reports/top-products?date=${today}&limit=5`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json() as Promise<TopProduct[]>;
    },
  });

  const todayRev = Number(stats?.todayRevenue ?? 0);
  const yesterdayRev = Number(stats?.yesterdayRevenue ?? 0);
  const revTrend = yesterdayRev > 0
    ? ((todayRev - yesterdayRev) / yesterdayRev * 100).toFixed(1)
    : null;

  const PERIOD_OPTIONS = [
    { value: "today" as const, label: "Today" },
    { value: "week"  as const, label: "Week" },
    { value: "month" as const, label: "Month" },
  ];

  const screenStyles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
  });

  return (
    <View style={screenStyles.root}>
      <View style={screenStyles.header}>
        <Text style={screenStyles.title}>Analytics</Text>
        <Text style={screenStyles.subtitle}>Revenue & performance insights</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Period selector */}
        <View style={[styles.periodRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {PERIOD_OPTIONS.map(p => (
            <TouchableOpacity key={p.value} onPress={() => setPeriod(p.value)}
              style={[styles.periodBtn, period === p.value && { backgroundColor: colors.primary }]}>
              <Text style={[styles.periodText, { color: period === p.value ? "#fff" : colors.mutedForeground }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI Grid */}
        {statsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.kpiGrid}>
            <KpiCard label="Revenue" value={`${todayRev.toFixed(0)} SAR`}
              sub={revTrend ? `${Number(revTrend) >= 0 ? "+" : ""}${revTrend}% vs yesterday` : undefined}
              color={colors.primary} />
            <KpiCard label="Orders" value={String(stats?.todayOrders ?? 0)}
              sub={`Yesterday: ${stats?.yesterdayOrders ?? 0}`}
              color="#3B82F6" />
            <KpiCard label="Kitchen Queue" value={String(stats?.pendingKitchenTickets ?? 0)}
              sub="Active tickets" color="#F59E0B" />
            <KpiCard label="Low Stock" value={String(stats?.lowStockCount ?? 0)}
              sub="Items need reorder" color="#EF4444" />
          </View>
        )}

        {/* P&L summary */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>P&L Summary</Text>
          {[
            { label: "Gross Revenue",  value: todayRev,                color: colors.primary },
            { label: "VAT (15%)",      value: -(todayRev * 0.15),     color: "#F59E0B" },
            { label: "Net Revenue",    value: todayRev * 0.85,         color: colors.foreground },
            { label: "Est. COGS (35%)", value: -(todayRev * 0.85 * 0.35), color: "#EF4444" },
            { label: "Gross Profit",   value: todayRev * 0.85 * 0.65, color: "#10B981" },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.plRow}>
              <Text style={[styles.plLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <Text style={[styles.plValue, { color }]}>
                {value < 0 ? `(${Math.abs(value).toFixed(2)})` : value.toFixed(2)} SAR
              </Text>
            </View>
          ))}
        </View>

        {/* Top Products */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Products Today</Text>
          {topLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : topProducts.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No sales data yet</Text>
          ) : (
            topProducts.map((p, idx) => (
              <View key={p.name} style={styles.productRow}>
                <Text style={[styles.productRank, { color: colors.mutedForeground }]}>#{idx + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                  <View style={[styles.productBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.productBarFill, {
                      width: `${(p.revenue / (topProducts[0]?.revenue ?? 1)) * 100}%` as `${number}%`,
                      backgroundColor: colors.primary,
                    }]} />
                  </View>
                  <Text style={[styles.productQty, { color: colors.mutedForeground }]}>{p.quantity} units</Text>
                </View>
                <Text style={[styles.productRevenue, { color: colors.primary }]}>
                  {p.revenue.toFixed(0)} SAR
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },
  periodRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 16 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  periodText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  kpiCard: {
    width: "47%", padding: 14, borderRadius: 16, borderWidth: 1,
  },
  kpiDot: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  kpiDotInner: { width: 12, height: 12, borderRadius: 6 },
  kpiValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  kpiSub: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  plRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  plLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  plValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  productRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  productRank: { fontSize: 12, fontFamily: "Inter_500Medium", width: 20 },
  productName: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 },
  productBar: { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 2 },
  productBarFill: { height: "100%", borderRadius: 2 },
  productQty: { fontSize: 10, fontFamily: "Inter_400Regular" },
  productRevenue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 16 },
});
