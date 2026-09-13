import CloudDeviceControl from "./CloudDeviceControl";
import BottomNav from "./BottomNav";

export default function CloudControlPage() {
  return (
    <>
      <div style={{ paddingBottom: "88px" }}>
        <CloudDeviceControl />
      </div>

      <BottomNav />
    </>
  );
}
