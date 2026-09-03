export const dynamic = "force-dynamic";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/tenant";
import { cookies } from "next/headers";

const schema = z.object({ organizationId: z.string() });

// Switch active org — validated against the user's memberships (never trusted blindly). Spec §3.
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { organizationId } = schema.parse(await req.json());
  const membership = await prisma.organizationUser.findFirst({ where: { userId: user.userId, organizationId } });
  if (!membership) throw Object.assign(new Error("Not a member of that organization"), { status: 403 });

  const jar = await cookies();
  jar.set(ACTIVE_ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", path: "/" });
  return json({ ok: true, organizationId });
});
