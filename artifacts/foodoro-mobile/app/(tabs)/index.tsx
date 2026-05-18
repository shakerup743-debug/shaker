import { Feather } from "@expo/vector-icons";
import { useGetDashboardStats, useListOrders } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useSse } from "@/hooks/useSse";

type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  pending: { bg: "#FEF3C7", text: "#92400E" },
  preparing: { bg: "#DBEAFE", text: "#1E40AF" },
  ready: { bg: "#D1FAE5", text: "#065F46" },
  completed: { bg: "#F3F4F6", text: "#374151" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
};

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[cardStyles.iconWrap, { backgroundColor: color + "20" }]}>
        <Feather name={icon as never} size={18} color={color} />
      </View>
      <Text style={[cardStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[cardStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  const { data: stats, refetch: refetchStats } = useGetDashboardStats();
  const { data: orders, isLoading, refetch } = useListOrders({
    status: filter !== "all" ? filter : undefined,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchStats()]);
    setRefreshing(false);
  }, [refetch, refetchStats]);

  useSse({
    events: {
      "order:created": () => {
        void refetch();
        void refetchStats();
      },
      "ticket:updated": () => {
        void refetchStats();
      },
    },
  });

  const FILTERS: Array<{ key: OrderStatus | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "preparing", label: "Preparing" },
    { key: "ready", label: "Ready" },
    { key: "completed", label: "Done" },
  ];

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 12 },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
    },
    filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80,
      gap: 10,
    },
    orderCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
    },
    orderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    orderNum: { fontSize: 16, fontFamily: "Inter_700Bold" },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    orderType: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
    orderMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, alignItems: "center" },
    orderTotal: { fontSize: 16, fontFamily: "Inter_700Bold" },
    orderTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
    empty: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 60 },
    emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <StatCard label="Revenue" value={`${Number(stats.todayRevenue ?? 0).toFixed(0)} SAR`} icon="trending-up" color="#E67E22" />
          <StatCard label="Orders" value={stats.todayOrders ?? 0} icon="shopping-bag" color="#3B82F6" />
          <StatCard label="Kitchen" value={stats.pendingKitchenTickets ?? 0} icon="clock" color="#10B981" />
        </View>
      )}

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(i) => i.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = filter === item.key;
          return (
            <Pressable
              onPress={() => setFilter(item.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? "#FFFFFF" : colors.mutedForeground },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        }}
      />

      {isLoading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={orders ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          scrollEnabled={!!orders?.length}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No orders found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = item.status as OrderStatus;
            const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
            return (
              <Pressable
                onPress={() => router.push(`/order/${item.id}`)}
                style={({ pressed }) => [
                  styles.orderCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={styles.orderRow}>
                  <Text style={[styles.orderNum, { color: colors.foreground }]}>#{item.orderNumber}</Text>
                  <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
                    <Text style={[styles.badgeText, { color: statusColor.text }]}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.orderType, { color: colors.mutedForeground }]}>
                  {(item.type ?? "").replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  {item.tableNumber ? ` · Table ${item.tableNumber}` : ""}
                </Text>
                <View style={styles.orderMeta}>
                  <Text style={[styles.orderTotal, { color: colors.primary }]}>
                    {Number(item.total).toFixed(2)} SAR
                  </Text>
                  <Text style={[styles.orderTime, { color: colors.mutedForeground }]}>
                    {formatTime(item.createdAt as unknown as string)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
