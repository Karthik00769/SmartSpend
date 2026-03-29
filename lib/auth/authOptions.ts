import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import pool from "@/lib/db";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2";

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
          "SELECT id, email, password_hash FROM users WHERE email = ?",
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
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        // Check by email (Google sub ID ≠ DB BIGINT id)
        const [rows] = await pool.execute<RowDataPacket[]>(
          "SELECT id FROM users WHERE email = ?",
          [user.email]
        );

        if (rows.length === 0) {
          // New Google user — insert with auto-increment id
          const [result] = await pool.execute<any>(
            "INSERT INTO users (email, full_name, avatar_url, currency_code, created_at) VALUES (?, ?, ?, 'USD', NOW())",
            [user.email, (user as any).name || user.email?.split('@')[0] || '', (user as any).image || '']
          );
          // Overwrite user.id with the real DB id so JWT gets the correct value
          user.id = result.insertId.toString();
        } else {
          // Existing user — set user.id to DB id
          user.id = rows[0].id.toString();
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      // Append user id to the token on initial login
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Pass the user id from token to session
      if (session.user && token) {
        (session.user as any).id = token.id;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "default_development_secret_do_not_use_in_prod",
  pages: {
    // Custom login page can go here if applicable:
    signIn: "/login",
  },
};
