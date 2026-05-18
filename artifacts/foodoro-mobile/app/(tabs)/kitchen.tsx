import { Feather } from "@expo/vector-icons";
import {
  useListKitchenTickets,
  useUpdateTicketStatus,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
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

type TicketStatus = "new" | "in_progress" | "ready";

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; next?: TicketStatus; nextLabel?: string }> = {
  new: { label: "New", color: "#3B82F6", next: "in_progress", nextLabel: "Start" },
  in_progress: { label: "In Progress", color: "#F59E0B", next: "ready", nextLabel: "Mark Ready" },
  ready: { label: "Ready", color: "#10B981" },
};

export default function KitchenScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<TicketStatus | "all">("all");

  const { data: tickets, isLoading, refetch } = useListKitchenTickets({
    status: filter !== "all" ? filter : undefined,
  });

  const { mutateAsync: updateStatus } = useUpdateTicketStatus();
  const [refreshing, setRefreshing] = useState(false);

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
  });

  const handleAdvance = async (ticketId: number, nextStatus: TicketStatus) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateStatus({ id: ticketId, data: { status: nextStatus } });
    await refetch();
  };

  const FILTERS: Array<{ key: TicketStatus | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "new", label: "New" },
    { key: "in_progress", label: "In Progress" },
    { key: "ready", label: "Ready" },
  ];

  const formatElapsed = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff === 1) return "1 min ago";
    return `${diff} min ago`;
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80,
      gap: 12,
    },
    card: { borderRadius: 16, borderWidth: 1, padding: 16 },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
    orderNum: { fontSize: 17, fontFamily: "Inter_700Bold" },
    orderType: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    itemsSection: { gap: 6, marginBottom: 14 },
    itemRow: { flexDirection: "row", justifyContent: "space-between" },
    itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
    itemQty: { fontSize: 14, fontFamily: "Inter_700Bold" },
    divider: { height: 1, marginVertical: 12 },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    elapsed: { fontSize: 13, fontFamily: "Inter_400Regular" },
    advBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 },
    advBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    empty: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 60 },
    emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Kitchen</Text>
        <Text style={styles.subtitle}>
          {tickets?.length ?? 0} active ticket{tickets?.length !== 1 ? "s" : ""}
        </Text>
      </View>

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
              style={[styles.filterChip, {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              }]}
            >
              <Text style={[styles.filterText, { color: active ? "#FFFFFF" : colors.mutedForeground }]}>
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
          data={tickets ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          scrollEnabled={!!tickets?.length}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="check-circle" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Kitchen is clear!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = item.status as TicketStatus;
            const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={[styles.orderNum, { color: colors.foreground }]}>#{item.orderNumber}</Text>
                    <Text style={[styles.orderType, { color: colors.mutedForeground }]}>
                      {(item.type ?? "").replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: cfg.color }]}>
                    <Text style={styles.badgeText}>{cfg.label}</Text>
                  </View>
                </View>

                <View style={styles.itemsSection}>
                  {(item.items ?? []).map((itm, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={[styles.itemName, { color: colors.foreground }]}>{itm.productName}</Text>
                      <Text style={[styles.itemQty, { color: colors.primary }]}>×{itm.quantity}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.footer}>
                  <Text style={[styles.elapsed, { color: colors.mutedForeground }]}>
                    {formatElapsed(item.createdAt as unknown as string)}
                  </Text>
                  {cfg.next && (
                    <Pressable
                      onPress={() => handleAdvance(item.id, cfg.next!)}
                      style={({ pressed }) => [styles.advBtn, { backgroundColor: cfg.color, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <Feather name="arrow-right" size={14} color="#FFFFFF" />
                      <Text style={styles.advBtnText}>{cfg.nextLabel}</Text>
                    </Pressable>
                  )}
                  {status === "ready" && (
                    <View style={[styles.badge, { backgroundColor: "#10B981" }]}>
                      <Text style={styles.badgeText}>Ready ✓</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
