import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/api-client";
import { IMPERSONATION_COOKIE, TOKEN_COOKIE } from "@/lib/session";

/**
 * Proxies an accountant export from the API, carrying the tenant's session.
 *
 * A plain link straight to the API would arrive with no Authorization header —
 * the token lives in an httpOnly cookie this origin can read and the browser
 * will not attach cross-origin. So the download goes through here, exactly as
 * the PDF routes do.
 *
 * The API remains the authority on what may be exported and for whom: this
 * route adds no filtering of its own, it only forwards credentials. Anything
 * else would put a second, weaker copy of the tenant rule in front of the real
 * one.
 */
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { file: string } }) {
  const jar = cookies();
  // Impersonation is honoured, matching serverRequest: a staff member looking
  // at a tenant's console should export what that tenant would export, not
  // their own empty set.
  const token = jar.get(IMPERSONATION_COOKIE)?.value ?? jar.get(TOKEN_COOKIE)?.value;
  if (!token) return new Response("Not signed in", { status: 401 });

  const range = new URL(req.url).searchParams;
  const query = new URLSearchParams({
    from: range.get("from") ?? "",
    to: range.get("to") ?? "",
  });

  const res = await fetch(`${API_BASE_URL}/exports/${params.file}?${query}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    // The API's own message, so "from must not be after to" reaches the person
    // who typed it rather than becoming a generic failure.
    const text = await res.text();
    let message = "Couldn't build that export.";
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* not JSON — keep the generic message */
    }
    return new Response(message, { status: res.status });
  }

  return new Response(await res.text(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // Passed through so the file keeps the name the API chose, which carries
      // the basis and the period.
      "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
    },
  });
}
