export const metadata = { title: "JamQuote Staff Console · internal" };

// The staff console renders its own full-screen chrome; no shared layout.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
