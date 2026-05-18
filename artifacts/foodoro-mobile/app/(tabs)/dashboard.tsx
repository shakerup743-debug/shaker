import { Feather } from "@expo/vector-icons";
import { useGetDashboardStats } from "@workspace/api-client-react";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import { useSse } from "@/hooks/useSse";

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        kpiStyles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[kpiStyles.iconBg, { backgroundColor: color + "22" }]}
      >
        <Feather name={icon as never} size={20} color={color} />
      </View>
      <Text style={[kpiStyles.value, { color: colors.foreground }]}>
        {value}
      </Text>
      <Text style={[kpiStyles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      {!!sub && (
        <Text style={[kpiStyles.sub, { color: colors.mutedForeground }]}>
          {sub}
        </Text>
      )}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    minWidth: 140,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  value: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  sub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: -2,
  },
});

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);

  const { data: stats, isLoading, refetch } = useGetDashboardStats();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useSse({
    events: {
      "order:created": () => {
        void refetch();
      },
      "ticket:updated": () => {
        void refetch();
      },
    },
    onConnect: () => setLiveConnected(true),
    onDisconnect: () => setLiveConnected(false),
  });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: colors.background,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    greeting: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    name: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginTop: 2,
    },
    date: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    liveDot: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: liveConnected ? "#10B98118" : colors.secondary,
      marginTop: 4,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: liveConnected ? "#10B981" : colors.mutedForeground,
    },
    liveText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: liveConnected ? "#10B981" : colors.mutedForeground,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90,
      gap: 14,
    },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    row: { flexDirection: "row", gap: 12 },
    alertCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    alertIconBg: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    alertText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
    alertSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.name}>{user?.name?.split(" ")[0] ?? "Manager"}</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <View style={styles.liveDot}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>
              {liveConnected ? "Live" : "Offline"}
            </Text>
          </View>
        </View>
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={styles.sectionTitle}>Today&apos;s Performance</Text>
          <View style={styles.row}>
            <KpiCard
              label="Revenue"
              value={`${Number(stats?.todayRevenue ?? 0).toFixed(0)} SAR`}
              sub="Today"
              icon="trending-up"
              color="#E67E22"
            />
            <KpiCard
              label="Orders"
              value={stats?.todayOrders ?? 0}
              sub="Today"
              icon="shopping-bag"
              color="#3B82F6"
            />
          </View>
          <View style={styles.row}>
            <KpiCard
              label="Kitchen Queue"
              value={stats?.pendingKitchenTickets ?? 0}
              sub="Active tickets"
              icon="clock"
              color="#F59E0B"
            />
            <KpiCard
              label="Low Stock"
              value={stats?.lowStockCount ?? 0}
              sub="Items"
              icon="alert-triangle"
              color={
                (stats?.lowStockCount ?? 0) > 0 ? "#EF4444" : "#10B981"
              }
            />
          </View>

          {(stats?.lowStockCount ?? 0) > 0 && (
            <>
              <Text style={styles.sectionTitle}>Alerts</Text>
              <Pressable
                style={[
                  styles.alertCard,
                  {
                    backgroundColor: "#FEE2E2",
                    borderColor: "#FECACA",
                  },
                ]}
              >
                <View
                  style={[styles.alertIconBg, { backgroundColor: "#FCA5A520" }]}
                >
                  <Feather name="alert-triangle" size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertText, { color: "#991B1B" }]}>
                    Low Stock Warning
                  </Text>
                  <Text style={[styles.alertSub, { color: "#B91C1C" }]}>
                    {stats?.lowStockCount}{" "}
                    {stats?.lowStockCount === 1 ? "item is" : "items are"} running
                    low on inventory
                  </Text>
                </View>
              </Pressable>
            </>
          )}

          <Text style={styles.sectionTitle}>Quick Stats</Text>
          <View
            style={[
              styles.alertCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[styles.alertIconBg, { backgroundColor: "#E67E2220" }]}
            >
              <Feather name="pie-chart" size={20} color="#E67E22" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertText, { color: colors.foreground }]}>
                Avg. Order Value
              </Text>
              <Text
                style={[styles.alertSub, { color: colors.mutedForeground }]}
              >
                {stats?.todayOrders && stats.todayOrders > 0
                  ? `${(Number(stats.todayRevenue ?? 0) / stats.todayOrders).toFixed(2)} SAR`
                  : "—"}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
