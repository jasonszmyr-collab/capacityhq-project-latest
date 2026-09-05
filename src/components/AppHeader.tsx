import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

import {
    useSystemStatus,
    type PhysicalFlagPosition
} from "../services/useSystemStatus";

//======================================================================
// Helpers
//======================================================================

function flagPositionLabel(
    position: PhysicalFlagPosition
): string
{
    switch (position)
    {
        case "FULL":
            return "Full Mast";

        case "HALF":
            return "Half Staff";

        case "DOWN":
            return "Flag Down";

        case "MOVING":
            return "Moving";

        default:
            return "Position Unknown";
    }
}

//----------------------------------------------------------------------

function flagPositionStyle(
    position: PhysicalFlagPosition
): string
{
    switch (position)
    {
        case "FULL":
            return "bg-green-500 text-white";

        case "HALF":
            return "bg-yellow-400 text-black";

        case "DOWN":
            return "bg-slate-500 text-white";

        case "MOVING":
            return "bg-blue-500 text-white";

        default:
            return "bg-slate-600 text-white";
    }
}

//======================================================================
// App Header
//======================================================================

export default function AppHeader({
    title
}: {
    title: string;
})
{
    const navigate =
        useNavigate();

    const location =
        useLocation();

    const {
        isOnline,
        physicalPosition
    } =
        useSystemStatus();

    const mainRoutes =
        [
            "/",
            "/cloud",
            "/setup",
            "/wifi"
        ];

    const isMainRoute =
        mainRoutes.includes(
            location.pathname
        );

    //------------------------------------------------------------------
    // Back
    //------------------------------------------------------------------

    const handleBack = () =>
    {
        if (window.history.length > 1)
        {
            navigate(-1);
        }
        else
        {
            navigate("/");
        }
    };

    //------------------------------------------------------------------
// Logout
//------------------------------------------------------------------

const handleLogout = async () =>
{
    try
    {
        const { error } =
            await supabase.auth.signOut();

        if (error)
        {
            console.error(
                "Logout failed:",
                error
            );

            return;
        }

        localStorage.removeItem(
            "demoMode"
        );

        navigate(
            "/",
            { replace: true }
        );
    }
    catch (error)
    {
        console.error(
            "Unexpected logout error:",
            error
        );
    }
};

    //------------------------------------------------------------------
    // Render
    //------------------------------------------------------------------

    return (
        <div
    className="
        fixed
        top-0
        left-0
        w-full
        z-50
        flex
        items-center
        justify-between
        px-6
        pt-4
        pb-10
        bg-black/50
        backdrop-blur
        border-b
        border-white/10
    "
>

            {/* BACK */}

            {!isMainRoute
                ? (
                    <button
                        type="button"
                        onClick={handleBack}
                        className="text-white text-sm"
                    >
                        Back
                    </button>
                )
                : (
                    <div />
                )}

            {/* TITLE */}

            <h1
                className="
    absolute
    left-1/2
    bottom-2
    -translate-x-1/2
    text-white
    font-semibold
    whitespace-nowrap
"
            >
                {title}
            </h1>

            {/* RIGHT */}

            <div
                className="
                    flex
                    items-center
                    gap-3
                "
            >

                {/* Physical Flag Position */}

                <div
                    className={`
                        px-3
                        py-1
                        rounded-full
                        text-xs
                        font-semibold
                        ${flagPositionStyle(
                            physicalPosition
                        )}
                    `}
                >
                    🇺🇸{" "}
                    {flagPositionLabel(
                        physicalPosition
                    )}
                </div>

                {/* Connection */}

                <div
                    className="
                        flex
                        items-center
                        gap-2
                        text-xs
                        text-white/80
                    "
                >

                    <div
                        className={`
                            w-2
                            h-2
                            rounded-full
                            ${
                                isOnline
                                    ? "bg-green-400 animate-pulse"
                                    : "bg-red-500"
                            }
                        `}
                    />

                                        {isOnline
                        ? "Online"
                        : "Offline"}

                </div>

                {/* Sign Out */}

                <button
                    type="button"
                    onClick={() =>
                    {
                        void handleLogout();
                    }}
                    className="
                        px-3
                        py-1
                        rounded-lg
                        text-xs
                        font-medium
                        text-white
                        bg-white/10
                        hover:bg-white/20
                        transition
                    "
                    >
                    Sign Out
                </button>

            </div>

        </div>
    );
}