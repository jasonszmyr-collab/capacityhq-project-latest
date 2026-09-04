import React, { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  RotateCcw,
  Settings2,
  Loader2,
  AlertCircle,
  Octagon,
} from "lucide-react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  waitForTarget,
  type DeviceStatus,
  type DeviceTarget,
} from "@/lib/renderDevice";

import { cloudService } from "@/services/cloudService";

type OverrideMode =
  | "AUTO"
  | "FULL"
  | "HALF"
  | "DOWN";

interface FlagData {
  device_id?: string;
  override_mode?: string | null;
  testmode?: boolean | null;
  pre_test_override_mode?: string | null;
  [key: string]: unknown;
}

interface Directive {
  [key: string]: unknown;
}

interface ControlPanelProps {
  flagData?: FlagData | null;

  onUpdate: (
    updates: Partial<FlagData>
  ) => void | Promise<void>;

  isUpdating: boolean;

  deviceApiUrl: string;

  deviceData?: DeviceStatus | null;

  directives?: Directive[];
}

interface TestStep {
  index: number;
  total: number;
  command: DeviceTarget;
  label: string;
}

interface TestSequenceEntry {
  command: DeviceTarget;
  label: string;
}

// UI mode -> Render /control command.
// "Down" in the UI maps to "BOTTOM" on ESP32/Render.
const RENDER_COMMAND_MAP: Record<
  Exclude<OverrideMode, "AUTO">,
  DeviceTarget
> = {
  FULL: "FULL",
  HALF: "HALF",
  DOWN: "BOTTOM",
};

// Test Mode diagnostic sequence.
const TEST_SEQUENCE: TestSequenceEntry[] = [
  {
    command: "BOTTOM",
    label: "Lowering to Bottom",
  },
  {
    command: "FULL",
    label: "Raising to Full",
  },
  {
    command: "HALF",
    label: "Lowering to Half",
  },
  {
    command: "FULL",
    label: "Raising to Full",
  },
  {
    command: "BOTTOM",
    label: "Lowering to Bottom",
  },
];

export default function ControlPanel({
  flagData,
  onUpdate,
  isUpdating,
  deviceApiUrl,
  deviceData: _deviceData,
  directives: _directives,
}: ControlPanelProps) {
  const [showTestConfirm, setShowTestConfirm] =
    useState(false);

  const [commandSending, setCommandSending] =
    useState(false);

  const [stopSending, setStopSending] =
    useState(false);

  const [testRunning, setTestRunning] =
    useState(false);

  const [testStep, setTestStep] =
    useState<TestStep | null>(null);

  const currentOverride =
    flagData?.override_mode || "AUTO";

  const isTestMode =
    flagData?.testmode || false;

  // STOP or disabling Test Mode can abort the sequence.
  const testAbortRef = useRef(false);

  const overrideButtons = [
    {
      mode: "AUTO" as const,
      label: "Auto",
      icon: RotateCcw,
      color:
        "bg-emerald-500 hover:bg-emerald-600",
    },
    {
      mode: "FULL" as const,
      label: "Full",
      icon: ArrowUp,
      color:
        "bg-blue-500 hover:bg-blue-600",
    },
    {
      mode: "HALF" as const,
      label: "Half",
      icon: Minus,
      color:
        "bg-amber-500 hover:bg-amber-600",
    },
    {
      mode: "DOWN" as const,
      label: "Down",
      icon: ArrowDown,
      color:
        "bg-zinc-500 hover:bg-zinc-600",
    },
  ];

    const sendRenderCommand = async (
    command: DeviceTarget | "STOP"
  ) => {
    const deviceId =
      flagData?.device_id || "HP-001";

    const cloudCommand =
      command.toLowerCase() as
        | "full"
        | "half"
        | "bottom"
        | "stop";

    const ok = await cloudService.sendCommand(
      deviceId,
      cloudCommand
    );

    if (!ok) {
      throw new Error(
        "Authenticated device command failed"
      );
    }

    return ok;
  };

  const handleOverride = async (
    mode: OverrideMode
  ) => {
    if (testRunning) {
      return;
    }

    // AUTO belongs to the persistent server-side
    // evaluator. Do NOT send a motor command here.
    if (mode === "AUTO") {
      await onUpdate({
        override_mode: "AUTO",
      });

      toast.success(
        "Automatic mode enabled — evaluator will position the flag"
      );

      return;
    }

    if (isUpdating || commandSending) {
      return;
    }

    const command =
      RENDER_COMMAND_MAP[mode];

    setCommandSending(true);

    try {
      await sendRenderCommand(command);

      const label =
        mode === "DOWN"
          ? "Down"
          : mode.charAt(0) +
            mode.slice(1).toLowerCase();

      toast.success(
        `${label} command accepted by device`
      );

      await onUpdate({
        override_mode: mode,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      toast.error(
        `Failed to send ${mode} command: ${message}`
      );
    } finally {
      setCommandSending(false);
    }
  };

  const handleStop = async () => {
    if (stopSending) {
      return;
    }

    // STOP must abort Test Mode immediately.
    if (testRunning) {
      testAbortRef.current = true;
    }

    setStopSending(true);

    try {
      await sendRenderCommand("STOP");

      toast.success(
        "STOP command accepted by device"
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      toast.error(
        `Failed to send STOP: ${message}`
      );
    } finally {
      setStopSending(false);
    }
  };

  const handleTestMode = () => {
    if (isUpdating) {
      return;
    }

    if (!isTestMode) {
      setShowTestConfirm(true);
      return;
    }

    if (testRunning) {
      testAbortRef.current = true;
      return;
    }

    void onUpdate({
      testmode: false,
    });
  };

  const runTestSequence = async () => {
    setTestRunning(true);
    testAbortRef.current = false;

    try {
      for (
        let i = 0;
        i < TEST_SEQUENCE.length;
        i++
      ) {
        if (testAbortRef.current) {
          break;
        }

        const step =
          TEST_SEQUENCE[i];

        setTestStep({
          index: i,
          total: TEST_SEQUENCE.length,
          ...step,
        });

        await sendRenderCommand(
          step.command
        );

        // IMPORTANT:
        // Do not advance merely because Render accepted
        // the command or because position numerically
        // equals the target.
        //
        // waitForTarget() requires confirmed physical
        // arrival using fresh telemetry + position +
        // stopped/idle motor state.
        await waitForTarget(
          deviceApiUrl,
          step.command,
          {
            timeoutMs: 120000,
            pollMs: 1000,
            isAborted: () =>
              testAbortRef.current,
          }
        );
      }

      if (!testAbortRef.current) {
        toast.success(
          "Diagnostic cycle completed successfully"
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      if (message !== "aborted") {
        toast.error(
          `Test failed: ${message}`
        );
      }
    } finally {
      setTestRunning(false);
      setTestStep(null);
      testAbortRef.current = false;

      await onUpdate({
        testmode: false,
      });
    }
  };

  const confirmTestMode = () => {
    void onUpdate({
      testmode: true,
      pre_test_override_mode:
        currentOverride,
    });

    setShowTestConfirm(false);

    void runTestSequence();
  };

  return (
    <>
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-zinc-800">
            <Settings2 className="w-5 h-5" />
            Control Panel
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Override Controls */}
          <div>
            <Label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 block">
              Override Mode
            </Label>

            <div className="grid grid-cols-4 gap-2">
              {overrideButtons.map(
                (btn) => {
                  const Icon = btn.icon;

                  const isActive =
                    currentOverride ===
                    btn.mode;

                  const busy =
                    commandSending &&
                    btn.mode !== "AUTO";

                  return (
                    <motion.div
                      key={btn.mode}
                      whileTap={{
                        scale: 0.95,
                      }}
                    >
                      <Button
                        onClick={() =>
                          void handleOverride(
                            btn.mode
                          )
                        }
                        disabled={
                          isUpdating ||
                          isTestMode ||
                          testRunning ||
                          commandSending
                        }
                        className={`w-full h-16 flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                          isActive
                            ? `${btn.color} text-white shadow-lg`
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {(isUpdating &&
                          isActive) ||
                        busy ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}

                        <span className="text-xs font-medium">
                          {btn.label}
                        </span>
                      </Button>
                    </motion.div>
                  );
                }
              )}
            </div>

            <AnimatePresence>
              {isTestMode && (
                <motion.p
                  initial={{
                    opacity: 0,
                    height: 0,
                  }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                  }}
                  className="text-xs text-amber-600 mt-2 flex items-center gap-1"
                >
                  <AlertCircle className="w-3 h-3" />
                  Override controls disabled
                  during test mode
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Emergency Stop */}
          <div className="pt-4 border-t border-zinc-100">
            <Label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 block">
              Emergency Stop
            </Label>

            <motion.div
              whileTap={{
                scale: 0.97,
              }}
            >
              <Button
                onClick={() =>
                  void handleStop()
                }
                disabled={stopSending}
                className="w-full h-12 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white shadow-lg disabled:opacity-50"
              >
                {stopSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Octagon className="w-5 h-5" />
                )}

                <span className="text-sm font-semibold">
                  STOP
                </span>
              </Button>
            </motion.div>

            <p className="text-xs text-zinc-400 mt-1.5">
              Halts the motor immediately.
              Available even while a command
              or test is in progress.
            </p>
          </div>

          {/* Test Mode */}
          <div className="pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-zinc-800">
                  Test Mode
                </Label>

                <p className="text-xs text-zinc-500 mt-0.5">
                  Run full diagnostic cycle
                </p>
              </div>

              <Switch
                checked={isTestMode}
                onCheckedChange={
                  handleTestMode
                }
                disabled={isUpdating}
                className="data-[state=checked]:bg-purple-500"
              />
            </div>

            <AnimatePresence>
              {isTestMode && (
                <motion.div
                  initial={{
                    opacity: 0,
                    height: 0,
                  }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                  }}
                  className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4"
                >
                  <div className="flex items-center gap-2">
                    {testRunning ? (
                      <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-purple-600" />
                    )}

                    <span className="text-sm font-medium text-purple-800">
                      {testRunning &&
                      testStep
                        ? `${testStep.label} (Step ${
                            testStep.index +
                            1
                          } of ${
                            testStep.total
                          })`
                        : "Test cycle in progress"}
                    </span>
                  </div>

                  <p className="text-xs text-purple-600 mt-2">
                    Sequence: Bottom → Full →
                    Half → Full → Bottom
                  </p>

                  <p className="text-xs text-purple-500 mt-1">
                    Press STOP to abort
                    immediately.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={showTestConfirm}
        onOpenChange={
          setShowTestConfirm
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Start Test Cycle?
            </AlertDialogTitle>

            <AlertDialogDescription>
              This will run a full diagnostic
              sequence on the flagpole motor
              system. The flag will move
              through all positions: Bottom →
              Full → Half → Full → Bottom.
              Each step waits until the motor
              physically reaches its target
              before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={
                confirmTestMode
              }
              className="bg-purple-500 hover:bg-purple-600"
            >
              Start Test
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}