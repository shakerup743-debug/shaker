import { Feather } from "@expo/vector-icons";
import { useListOrders } from "@workspace/api-client-react";
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

const STATUS_META: Record<OrderStatus, { color: string; labelEn: string; icon: string }> = {
  pending:   { color: "#F59E0B", labelEn: "Pending",   icon: "clock" },
  preparing: { color: "#3B82F6", labelEn: "Preparing", icon: "loader" },
  ready:     { color: "#10B981", labelEn: "Ready",     icon: "check-circle" },
  completed: { color: "#6B7280", labelEn: "Completed", icon: "check-square" },
  cancelled: { color: "#EF4444", labelEn: "Cancelled", icon: "x-circle" },
};

const TYPE_LABELS: Record<string, string> = {
  dine_in:  "Dine In",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

interface Order {
  id: number;
  orderNumber: string;
  type: string;
  status: OrderStatus;
  total: number | string;
  tableNumber?: string | null;
  createdAt?: string;
  items?: unknown[];
}

function OrderCard({ order }: { order: Order }) {
  const colors = useColors();
  const meta = STATUS_META[order.status] ?? { color: "#6B7280", labelEn: order.status, icon: "circle" };
  const total = typeof order.total === "string" ? parseFloat(order.total) : order.total;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.orderNum, { color: colors.foreground }]}>{order.orderNumber}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.typeBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.typeText, { color: colors.mutedForeground }]}>
                {TYPE_LABELS[order.type] ?? order.type}
              </Text>
            </View>
            {order.tableNumber && (
              <Text style={[styles.table, { color: colors.mutedForeground }]}>T{order.tableNumber}</Text>
            )}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.color + "18", borderColor: meta.color + "30" }]}>
          <Feather name={meta.icon as never} size={11} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.labelEn}</Text>
        </View>
      </View>
      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
        <Text style={[styles.total, { color: colors.foreground }]}>{total.toFixed(2)} SAR</Text>
      </View>
    </View>
  );
}

const FILTER_TABS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all",       label: "All" },
  { value: "pending",   label: "Pending" },
  { value: "preparing", label: "Preparing" },
  { value: "ready",     label: "Ready" },
  { value: "completed", label: "Completed" },
];

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  const { data: orders, isLoading, refetch } = useListOrders({});

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useSse({
    events: {
      "order:created": () => void refetch(),
      "ticket:updated": () => void refetch(),
    },
  });

  const filtered = (orders ?? []).filter(o =>
    filter === "all" ? true : o.status === filter
  ) as Order[];

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16 }]}>
        <Text style={[st.title, { color: colors.foreground }]}>Orders</Text>
        <Text style={[st.subtitle, { color: colors.mutedForeground }]}>
          {filtered.length} {filter === "all" ? "total" : filter}
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={st.filterRow}>
        {FILTER_TABS.map(tab => (
          <Pressable
            key={tab.value}
            onPress={() => setFilter(tab.value)}
            style={[st.filterTab, {
              backgroundColor: filter === tab.value ? colors.primary : colors.card,
              borderColor: filter === tab.value ? colors.primary : colors.border,
            }]}
          >
            <Text style={[st.filterText, { color: filter === tab.value ? "#fff" : colors.mutedForeground }]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading && !refreshing ? (
        <View style={st.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={st.empty}>
          <Feather name="shopping-bag" size={36} color={colors.mutedForeground} />
          <Text style={[st.emptyText, { color: colors.mutedForeground }]}>No orders</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[st.list, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => <OrderCard order={item as Order} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  orderNum: { fontSize: 15, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  table: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1,
  },
  totalLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  total: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  filterRow: {
    flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 12, flexWrap: "nowrap",
  },
  filterTab: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  filterText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  list: { paddingTop: 4 },
});
