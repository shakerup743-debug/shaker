import { Feather } from "@expo/vector-icons";
import { useGetOrder } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  pending: { bg: "#FEF3C7", text: "#92400E" },
  preparing: { bg: "#DBEAFE", text: "#1E40AF" },
  ready: { bg: "#D1FAE5", text: "#065F46" },
  completed: { bg: "#F3F4F6", text: "#374151" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
};

export default function OrderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = parseInt(id ?? "0", 10);
  const { data: order, isLoading } = useGetOrder(orderId);

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 8,
      paddingHorizontal: 20,
      paddingBottom: 12,
      gap: 12,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 40 },
    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
    sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
    row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    rowLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
    rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    divider: { height: 1, marginVertical: 12 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
    totalValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
    itemRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
    itemName: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
    itemRight: { alignItems: "flex-end" },
    itemQty: { fontSize: 13, fontFamily: "Inter_400Regular" },
    itemTotal: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 2 },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  });

  if (isLoading) {
    return (
      <View style={[styles.root, styles.loadingWrap]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!order) return null;

  const status = order.status as OrderStatus;
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.pending;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Order #{order.orderNumber}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Order Info</Text>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Status</Text>
            <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.badgeText, { color: statusColor.text }]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Type</Text>
            <Text style={[styles.rowValue, { color: colors.foreground }]}>
              {(order.type ?? "").replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
          </View>
          {order.tableNumber && (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Table</Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>#{order.tableNumber}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Payment</Text>
            <Text style={[styles.rowValue, { color: colors.foreground }]}>
              {(order.paymentMethod ?? "—").replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Items</Text>
          {(order.items ?? []).map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={[styles.itemName, { color: colors.foreground }]}>{item.productName}</Text>
              <View style={styles.itemRight}>
                <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>×{item.quantity}</Text>
                <Text style={[styles.itemTotal, { color: colors.foreground }]}>
                  {Number(item.subtotal).toFixed(2)} SAR
                </Text>
              </View>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.rowValue, { color: colors.foreground }]}>{Number(order.subtotal).toFixed(2)} SAR</Text>
          </View>
          {order.discount && Number(order.discount) > 0 ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Discount</Text>
              <Text style={[styles.rowValue, { color: colors.destructive }]}>-{Number(order.discount).toFixed(2)} SAR</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>VAT (15%)</Text>
            <Text style={[styles.rowValue, { color: colors.foreground }]}>{Number(order.tax).toFixed(2)} SAR</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{Number(order.total).toFixed(2)} SAR</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
