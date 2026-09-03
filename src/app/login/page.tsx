import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=1");
    throw e;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">W</div>
          <h1 className="text-xl font-semibold">WhatsApp Campaign Console</h1>
          <p className="text-sm text-gray-500">Sign in to your workspace</p>
        </div>
        <form action={login} className="card space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Invalid email or password.</p>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" placeholder="you@company.com" defaultValue="admin@acme.test" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required className="input" placeholder="••••••••" defaultValue="password123" />
          </div>
          <button type="submit" className="btn-primary w-full">Sign in</button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-400">Seeded demo: admin@acme.test / password123</p>
      </div>
    </div>
  );
}
