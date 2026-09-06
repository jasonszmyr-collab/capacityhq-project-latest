import React from "react";
import { motion } from "framer-motion";

interface FlagVisualProps {
  position: string;
  isAnimating: boolean;
  livePercent?: number | null;
}

export default function FlagVisual({
  position,
  isAnimating,
  livePercent,
}: FlagVisualProps) {
  const getPositionPercentage = () => {
    // Live proportional placement:
    // 1.0 = FULL (top, 5%)
    // 0.0 = DOWN (bottom, 85%)
    if (
      typeof livePercent === "number" &&
      Number.isFinite(livePercent)
    ) {
      const clamped = Math.max(0, Math.min(1, livePercent));
      return 85 - clamped * 80;
    }

    switch (position) {
      case "full":
        return 5;

      case "half":
        return 45;

      case "down":
        return 85;

      default:
        return 5;
    }
  };

  return (
    <div className="relative w-full h-64 flex justify-center items-end">
      {/* Pole */}
      <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-56 bg-gradient-to-b from-zinc-300 via-zinc-400 to-zinc-500 rounded-full shadow-lg">
        {/* Gold finial */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-full shadow-md" />

        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full" />
      </div>

      {/* Flag */}
      <motion.div
        className="absolute left-1/2 ml-1"
        initial={{
          top: `${getPositionPercentage()}%`,
        }}
        animate={{
          top: `${getPositionPercentage()}%`,
        }}
        transition={{
          type: "spring",
          stiffness: 50,
          damping: 15,
          duration: 1.5,
        }}
      >
        <div className="relative">
          {/* Flag fabric with wave effect */}
          <motion.div
            className="w-20 h-12 rounded-sm overflow-hidden shadow-lg"
            animate={
              isAnimating
                ? {
                    skewY: [0, 1, -1, 0.5, 0],
                    scaleX: [1, 1.02, 0.98, 1.01, 1],
                  }
                : {}
            }
            transition={{
              repeat: isAnimating ? Infinity : 0,
              duration: 3,
              ease: "easeInOut",
            }}
          >
            {/* US Flag representation */}
            <div className="w-full h-full relative bg-red-600">
              {/* Stripes */}
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className={`h-[14.28%] ${
                    i % 2 === 0 ? "bg-red-600" : "bg-white"
                  }`}
                />
              ))}

              {/* Blue canton */}
              <div className="absolute top-0 left-0 w-2/5 h-[57%] bg-blue-900 flex items-center justify-center">
                <div className="grid grid-cols-3 gap-px p-0.5">
                  {[...Array(9)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 h-1 bg-white rounded-full opacity-90"
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Halyard line */}
          <div className="absolute -left-1 top-0 w-0.5 h-full bg-zinc-400" />
        </div>
      </motion.div>

      {/* Base */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-3 bg-gradient-to-t from-zinc-600 to-zinc-500 rounded-t-sm" />

      {/* Position labels */}
      <div className="absolute right-4 top-4 text-xs text-zinc-400 font-medium">
        FULL
      </div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">
        HALF
      </div>

      <div className="absolute right-4 bottom-8 text-xs text-zinc-400 font-medium">
        DOWN
      </div>

      {/* Position markers */}
      <div className="absolute left-1/2 translate-x-4 top-4 w-2 h-0.5 bg-zinc-300" />

      <div className="absolute left-1/2 translate-x-4 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-zinc-300" />

      <div className="absolute left-1/2 translate-x-4 bottom-8 w-2 h-0.5 bg-zinc-300" />
    </div>
  );
}