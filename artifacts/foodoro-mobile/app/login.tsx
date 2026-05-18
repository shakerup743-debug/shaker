import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 60,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 24,
    },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 32,
    },
    logoText: {
      color: "#FFFFFF",
      fontSize: 28,
      fontFamily: "Inter_700Bold",
    },
    title: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 40,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      height: 52,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 16,
    },
    inputFocused: {
      borderColor: colors.primary,
    },
    error: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginBottom: 16,
      textAlign: "center",
    },
    button: {
      height: 52,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    demoSection: {
      marginTop: 40,
      gap: 8,
    },
    demoLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 4,
    },
    demoRow: {
      flexDirection: "row",
      gap: 8,
    },
    demoBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.secondary,
      alignItems: "center",
    },
    demoBtnText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.secondaryForeground,
    },
  });

  const demos = [
    { label: "Admin", email: "admin@foodoro.com", password: "Admin@1234" },
    { label: "Cashier", email: "cashier@foodoro.com", password: "Cash@1234" },
    { label: "Kitchen", email: "kitchen@foodoro.com", password: "Kit@1234" },
  ];

  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.inner}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>F</Text>
          </View>
          <Text style={styles.title}>FOODORO</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            testID="input-email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, passFocused && styles.inputFocused]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            onFocus={() => setPassFocused(true)}
            onBlur={() => setPassFocused(false)}
            onSubmitEditing={handleLogin}
            testID="input-password"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.button, { opacity: pressed || loading ? 0.8 : 1 }]}
            onPress={handleLogin}
            disabled={loading}
            testID="button-login"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.demoSection}>
            <Text style={styles.demoLabel}>QUICK ACCESS</Text>
            <View style={styles.demoRow}>
              {demos.map((d) => (
                <Pressable
                  key={d.label}
                  style={({ pressed }) => [styles.demoBtn, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                >
                  <Text style={styles.demoBtnText}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
