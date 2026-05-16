import { useNavigate } from "react-router-dom";

export default function BackButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(-1)}
      className="mb-6 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg backdrop-blur hover:bg-white/20"
    >
      ← Back
    </button>
  );
}
