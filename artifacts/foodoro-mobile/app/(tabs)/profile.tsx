import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";

function Row({ icon, label, value, danger, onPress }: {
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const color = danger ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: (danger ? colors.destructive : colors.primary) + "18" }]}>
        <Feather name={icon as never} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {!!value && <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>}
      </View>
      {!!onPress && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    gap: 14,
    marginBottom: 8,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const ROLE_LABELS: Record<string, string> = {
    admin: "Administrator",
    cashier: "Cashier",
    kitchen_staff: "Kitchen Staff",
    inventory_manager: "Inventory Manager",
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const screenStyles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,
      marginBottom: 12,
    },
    avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    name: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    email: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    roleBadge: {
      marginTop: 8,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
      backgroundColor: colors.primary + "20",
    },
    roleText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    section: {
      paddingHorizontal: 20,
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    scrollContent: {
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80,
    },
    versionText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 24,
      paddingBottom: 8,
    },
  });

  return (
    <View style={screenStyles.root}>
      <ScrollView contentContainerStyle={screenStyles.scrollContent}>
        <View style={screenStyles.header}>
          <Text style={screenStyles.title}>Profile</Text>
          {user && (
            <>
              <View style={screenStyles.avatar}>
                <Text style={screenStyles.avatarText}>
                  {user.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={screenStyles.name}>{user.name}</Text>
              <Text style={screenStyles.email}>{user.email}</Text>
              <View style={screenStyles.roleBadge}>
                <Text style={screenStyles.roleText}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={screenStyles.section}>
          <Text style={[screenStyles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>
          <Row icon="user" label="Full Name" value={user?.name ?? "-"} />
          <Row icon="mail" label="Email" value={user?.email ?? "-"} />
          <Row icon="shield" label="Role" value={ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "-"} />
        </View>

        <View style={screenStyles.section}>
          <Text style={[screenStyles.sectionTitle, { color: colors.mutedForeground }]}>App</Text>
          <Row icon="info" label="Version" value="1.0.0" />
          <Row icon="server" label="Server" value="Connected" />
        </View>

        <View style={screenStyles.section}>
          <Row icon="log-out" label="Sign Out" danger onPress={handleLogout} />
        </View>

        <Text style={screenStyles.versionText}>FOODORO POS · Mobile Companion</Text>
      </ScrollView>
    </View>
  );
}
