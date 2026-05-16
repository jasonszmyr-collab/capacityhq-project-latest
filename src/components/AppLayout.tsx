import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

export default function AppLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-transparent overflow-hidden">

      {/* Header */}
      <AppHeader title={title} />

      {/* Page Content */}
      <div className="pt-24 pb-24 px-6">
        <div className="max-w-5xl mx-auto">{children}</div>
      </div>

      {/* Bottom Nav */}
      <BottomNav />
    </div>
  );
}