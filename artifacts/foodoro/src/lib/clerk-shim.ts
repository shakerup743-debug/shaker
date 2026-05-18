/**
 * Clerk shim — replaces @clerk/react hooks with our JWT-based auth.
 * The Layout component (and others) were originally written against Clerk's API;
 * this shim adapts our AuthContext to look like Clerk so we don't have to
 * rewrite every consumer.
 */
import { useAuth as useJwtAuth } from "@/contexts/auth";

const TOKEN_KEY = "foodoro-token";

interface ClerkLikeUser {
  fullName: string | null;
  firstName: string | null;
  imageUrl: string | null;
  emailAddresses: { emailAddress: string }[];
  publicMetadata?: Record<string, unknown>;
}

export function useUser(): { user: ClerkLikeUser | null; isSignedIn: boolean; isLoaded: boolean } {
  const { user, isLoading } = useJwtAuth();
  if (!user) {
    return { user: null, isSignedIn: false, isLoaded: !isLoading };
  }
  const fullName = user.name || user.email.split("@")[0];
  return {
    user: {
      fullName,
      firstName: fullName.split(" ")[0] ?? null,
      imageUrl: null,
      emailAddresses: [{ emailAddress: user.email }],
      publicMetadata: { role: user.role },
    },
    isSignedIn: true,
    isLoaded: true,
  };
}

export function useClerk(): {
  signOut: (opts?: { redirectUrl?: string }) => Promise<void> | void;
} {
  const { logout } = useJwtAuth();
  return {
    signOut: async (opts) => {
      logout();
      if (opts?.redirectUrl) {
        // give the auth state time to clear before navigating
        setTimeout(() => {
          window.location.href = opts.redirectUrl!;
        }, 50);
      }
    },
  };
}

export function useAuth(): {
  isSignedIn: boolean;
  isLoaded: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => void;
} {
  const { user, isLoading, logout } = useJwtAuth();
  return {
    isSignedIn: !!user,
    isLoaded: !isLoading,
    getToken: async () => localStorage.getItem(TOKEN_KEY),
    signOut: logout,
  };
}
