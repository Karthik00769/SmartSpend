import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import pool from "@/lib/db";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return fail("Missing email or password", 400);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (rows.length > 0) {
      return fail("User already exists", 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const fullName = name || email.split("@")[0];

    const oauthId = `local_${crypto.randomUUID()}`;

    // users.id is INT AUTO_INCREMENT — do NOT specify id, MySQL assigns it.
    await pool.execute(
      `INSERT INTO users (oauth_id, email, full_name, password_hash, currency_code, created_at)
       VALUES (?, ?, ?, ?, 'USD', NOW())`,
      [oauthId, email, fullName, passwordHash]
    );

    return ok({ message: "User created successfully" }, 201);
  } catch (error: any) {
    console.error("Signup error:", error?.message ?? error);
    return fail("Internal server error", 500);
  }
}
