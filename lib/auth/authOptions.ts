import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import pool from "@/lib/db";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2";
import { logAuditEvent } from "@/services/audit.service";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
          "SELECT id, email, password_hash, session_version FROM users WHERE email = ? AND is_active = 1 AND deleted_at IS NULL",
          [credentials.email]
        );

        if (rows.length === 0) {
          throw new Error("Invalid email or password");
        }

        const user = rows[0];

        // Validate password if hash exists
        if (user.password_hash) {
          const valid = await bcrypt.compare(credentials.password, user.password_hash);
          if (!valid) throw new Error("Invalid email or password");
        }

        return {
          id: user.id.toString(),
          email: user.email,
          session_version: user.session_version // Custom property for force logout
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  useSecureCookies: true,
  cookies: {
    state: {
      name: '__Secure-next-auth.state',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
    pkceCodeVerifier: {
      name: '__Secure-next-auth.pkce.verifier',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        if (!user.email) return false; 
        
        // Use sub (unique provider ID) as oauth_id
        const oauth_id = profile?.sub || account?.providerAccountId;
        if (!oauth_id) return false;

        // 1. LOOKUP: Try oauth_id first, then fallback to email
        // This prevents duplicate accounts if a user signed up with credentials first.
        const [rows] = await pool.execute<RowDataPacket[]>(
          "SELECT id, oauth_id, is_active, deleted_at, session_version FROM users WHERE oauth_id = ? OR email = ?",
          [oauth_id, user.email]
        );

        if (rows.length === 0) {
          // 2. CREATE: New identity
          const [result] = await pool.execute<any>(
            `INSERT INTO users (oauth_id, email, full_name, avatar_url, currency_code, created_at, session_version, is_active) 
             VALUES (?, ?, ?, ?, 'USD', NOW(), 1, 1)`,
            [
              oauth_id, 
              user.email, 
              (user as any).name || user.email.split('@')[0], 
              (user as any).image || ''
            ]
          );
          user.id = result.insertId.toString();
          (user as any).session_version = 1;
          console.log(`[AUTH] New Google user created: ${user.email} (ID: ${user.id})`);
        } else {
          const dbUser = rows[0];

          // 3. VALIDATE: Ensure user is allowed to login
          if (dbUser.is_active === 0 || dbUser.deleted_at !== null) {
             console.warn(`[AUTH] Blocked login for deactivated user: ${user.email}`);
             return false;
          }

          // 4. LINKING / RECOVERY: If we found user by email but oauth_id is missing or different
          if (!dbUser.oauth_id || dbUser.oauth_id !== oauth_id) {
             console.log(`[AUTH] Linking existing email account ${user.email} to Google oauth_id: ${oauth_id}`);
             await pool.execute(
               "UPDATE users SET oauth_id = ?, avatar_url = ? WHERE id = ?",
               [oauth_id, (user as any).image || '', dbUser.id]
             );
          }
          
          user.id = dbUser.id.toString();
          (user as any).session_version = dbUser.session_version;
        }
      }

      if (user.id) {
        logAuditEvent(user.id, "LOGIN", "USER", user.id, { provider: account?.provider || "credentials" }).catch(console.error);
      }

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // 1. Initial login (when 'user' is provided by authorize)
      if (user) {
        token.id = user.id;
        token.session_version = (user as any).session_version;
        return token;
      }

      // 2. Client-side trigger updates (like profile name change)
      if (trigger === 'update' && session?.name) {
        token.name = session.name;
        return token;
      }

      // 3. ZERO-TRUST: On every request, verify session integrity against DB
      if (token.id) {
        try {
          const [rows] = await pool.execute<RowDataPacket[]>(
            "SELECT session_version, is_active, deleted_at FROM users WHERE id = ?",
            [token.id as string]
          );

          if (rows.length === 0) return null as any;

          const dbUser = rows[0];
          
          // Invalidate if deactivated, deleted, or version mismatch (Force Logout)
          if (
            dbUser.is_active === 0 || 
            dbUser.deleted_at !== null || 
            dbUser.session_version !== token.session_version
          ) {
            console.warn(`[AUTH] Force logout triggered for User ID: ${token.id} (Version Mismatch or Account Disabled)`);
            return null as any;
          }

        } catch (err) {
          console.error('[AUTH] Failed to verify session version:', err);
          // On DB error, we fail closed (secure)
          return null as any;
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as any).id = token.id;
        (session.user as any).session_version = token.session_version;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "default_development_secret_do_not_use_in_prod",
  pages: {
    signIn: "/login",
  },
};
