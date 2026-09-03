// Auth.js (NextAuth v5) configuration. Spec §44 (secure auth, sessions, hashing).
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "./db";
import { verifyPassword } from "./password";

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || user.status !== "ACTIVE") return null;
        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.isSuperAdmin = (user as any).isSuperAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).id = token.userId;
      (session.user as any).isSuperAdmin = token.isSuperAdmin ?? false;
      return session;
    },
  },
});
