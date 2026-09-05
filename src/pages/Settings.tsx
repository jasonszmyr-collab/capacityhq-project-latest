import { useState } from "react";
import { useNavigate } from "react-router-dom";

import PageHeader from "../components/PageHeader";
import BottomNav from "../components/BottomNav";
import { supabase } from "../services/supabaseClient";

export default function Settings() {
  const navigate = useNavigate();

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPrivacyPolicy = () => {
    window.open(
      "https://www.honor-pole.com/privacy-policy",
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your HonorPole account?\n\n" +
        "This permanently deletes your account and associated account data. " +
        "This action cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Your session has expired. Please sign in again.");
        return;
      }

      const { data, error: functionError } =
        await supabase.functions.invoke("delete-account", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

      if (functionError) {
        console.error("Account deletion failed:", functionError);
        setError("Unable to delete your account. Please try again.");
        return;
      }

      if (!data?.success) {
        console.error("Unexpected delete-account response:", data);
        setError("Unable to delete your account. Please try again.");
        return;
      }

      await supabase.auth.signOut();

      localStorage.removeItem("demoMode");

      navigate("/", { replace: true });
    } catch (err) {
      console.error("Unexpected account deletion error:", err);
      setError("Unable to delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <PageHeader title="Settings" />

      <main className="pt-20 px-4 max-w-xl mx-auto">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
          <h2 className="text-lg font-semibold mb-2">
            Privacy
          </h2>

          <p className="text-sm text-white/70 mb-4">
            Review how HonorPole handles account information and app data.
          </p>

          <button
            type="button"
            onClick={openPrivacyPolicy}
            className="w-full rounded-lg bg-white/10 px-4 py-3 text-left"
          >
            Privacy Policy
          </button>
        </section>

        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <h2 className="text-lg font-semibold mb-2">
            Delete Account
          </h2>

          <p className="text-sm text-white/70 mb-4">
            Permanently delete your HonorPole account and associated account
            data. This action cannot be undone.
          </p>

          {error && (
            <p className="text-sm text-red-400 mb-4">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              void handleDeleteAccount();
            }}
            className="w-full rounded-lg border border-red-500/50 px-4 py-3 text-red-300 disabled:opacity-50"
          >
            {deleting ? "Deleting Account..." : "Delete Account"}
          </button>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}