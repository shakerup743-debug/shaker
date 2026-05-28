import { SignJWT, jwtVerify } from "jose";

const rawSecret = process.env["JWT_SECRET"] ?? "foodoro-dev-secret-change-in-production-32chars";
const secret = new TextEncoder().encode(rawSecret);

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  tenantId?: number;
  sessionId?: number;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}
